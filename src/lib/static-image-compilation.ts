import type { GenerationBackground } from "@/lib/generation-session";
import type { CharacterMetadata } from "@/lib/metadata-builder";
import type { ReferenceFamilyIndex } from "@/lib/reference-family";
import { compileSingleStaticImageTask } from "@/lib/single-image-compiler";
import {
  mergeStyleSpecWithReferences,
  StyleSpecMergeError,
  type ReferenceProvenance,
} from "@/lib/style-spec-merge";
import {
  validateDraftStaticImageTask,
  type ParsedStaticImageTask,
} from "@/lib/task-schema";

const INVALID_COMPILE_REQUEST =
  "Provide a valid Draft StyleSpec and one to three reference IDs.";

export type CompilationContextResult =
  | Readonly<{
      ok: true;
      metadata: CharacterMetadata;
      styleSourceMetadata: CharacterMetadata | null;
    }>
  | Readonly<{
      ok: false;
      status: 400 | 404;
      error: string;
    }>;

export type StaticImageCompilationDependencies = Readonly<{
  loadReferenceFamilyIndex: () => Promise<ReferenceFamilyIndex>;
  loadCompilationContext: (
    characterId: string,
    styleSourceCharacterId: string | null,
  ) => Promise<CompilationContextResult>;
  createGenerationToken: (
    compiledPrompt: string,
    background: GenerationBackground,
  ) => string;
}>;

export type StaticImageCompilationInput = Readonly<{
  characterId: string;
  draftStyleSpec: ParsedStaticImageTask;
  referenceIds: readonly string[];
  styleSourceCharacterId: string | null;
}>;

export type StaticImageCompilationSuccess = Readonly<{
  ok: true;
  parsedTask: ParsedStaticImageTask;
  compilerInstructions: string[];
  compiledPrompt: string;
  generationToken: string;
  referenceProvenance: ReferenceProvenance[];
  refinementMode: "deterministic-merge";
}>;

export type StaticImageCompilationFailure = Readonly<{
  ok: false;
  status: 400 | 404 | 503;
  error: string;
}>;

export type StaticImageCompilationResult =
  | StaticImageCompilationSuccess
  | StaticImageCompilationFailure;

export type ValidCompileTaskRequest = Readonly<{
  draftStyleSpec: ParsedStaticImageTask;
  referenceIds: string[];
  styleSourceCharacterId: string | null;
}>;

// This is the only post-parse authorization seam. It accepts a validated
// structured task, compiles it, and stores the prompt behind the existing
// one-time generation-token session.
export function compileStaticImageTaskAndCreateToken(
  task: ParsedStaticImageTask,
  metadata: CharacterMetadata,
  styleSourceMetadata: CharacterMetadata | null,
  createToken: StaticImageCompilationDependencies["createGenerationToken"],
) {
  const compiled = compileSingleStaticImageTask(
    task,
    metadata,
    styleSourceMetadata,
  );
  const background: GenerationBackground =
    task.assetSettings.background === "TRANSPARENT"
      ? "transparent"
      : "opaque";
  return {
    ...compiled,
    generationToken: createToken(compiled.compiledPrompt, background),
  };
}

export async function compileAndAuthorizeStaticImageTask(
  input: StaticImageCompilationInput,
  dependencies: StaticImageCompilationDependencies,
): Promise<StaticImageCompilationResult> {
  const draftStyleSpec = validateDraftStaticImageTask(input.draftStyleSpec);
  if (!draftStyleSpec) {
    return { ok: false, status: 400, error: INVALID_COMPILE_REQUEST };
  }
  if (
    input.styleSourceCharacterId !== null &&
    input.styleSourceCharacterId === input.characterId
  ) {
    return {
      ok: false,
      status: 400,
      error: "Choose another character as the style source.",
    };
  }

  let familyIndex: ReferenceFamilyIndex;
  try {
    familyIndex = await dependencies.loadReferenceFamilyIndex();
  } catch {
    return {
      ok: false,
      status: 503,
      error: "The reference library is temporarily unavailable.",
    };
  }

  let merged;
  try {
    merged = mergeStyleSpecWithReferences(
      draftStyleSpec,
      input.referenceIds,
      familyIndex.families,
    );
  } catch (cause) {
    if (cause instanceof StyleSpecMergeError) {
      return { ok: false, status: 400, error: cause.message };
    }
    throw cause;
  }

  const context = await dependencies.loadCompilationContext(
    input.characterId,
    input.styleSourceCharacterId,
  );
  if (!context.ok) return context;

  const compiled = compileStaticImageTaskAndCreateToken(
    merged.task,
    context.metadata,
    context.styleSourceMetadata,
    dependencies.createGenerationToken,
  );
  return {
    ok: true,
    parsedTask: merged.task,
    ...compiled,
    referenceProvenance: merged.referenceProvenance,
    refinementMode: "deterministic-merge",
  };
}

export function createCompileTaskHandler(
  dependencies: StaticImageCompilationDependencies,
) {
  return async function postCompileTask(
    request: Request,
    characterId: string,
  ) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidCompileRequest();
    }

    const validation = validateCompileTaskRequest(body);
    if (!validation) return invalidCompileRequest();

    try {
      const result = await compileAndAuthorizeStaticImageTask(
        { characterId, ...validation },
        dependencies,
      );
      if (!result.ok) {
        return Response.json(
          { error: result.error },
          { status: result.status },
        );
      }
      return Response.json({
        parsedTask: result.parsedTask,
        compilerInstructions: result.compilerInstructions,
        compiledPrompt: result.compiledPrompt,
        generationToken: result.generationToken,
        referenceProvenance: result.referenceProvenance,
        refinementMode: result.refinementMode,
      });
    } catch {
      return Response.json(
        { error: "Atlas could not compile this StyleSpec." },
        { status: 500 },
      );
    }
  };
}

export function validateCompileTaskRequest(
  value: unknown,
): ValidCompileTaskRequest | null {
  if (!isRecord(value)) return null;
  if (
    !hasOnlyKeys(value, [
      "draftStyleSpec",
      "referenceIds",
      "styleSourceCharacterId",
    ])
  ) {
    return null;
  }
  const draftStyleSpec = validateDraftStaticImageTask(value.draftStyleSpec);
  if (!draftStyleSpec || !Array.isArray(value.referenceIds)) return null;
  if (
    !value.referenceIds.every(
      (id): id is string => typeof id === "string" && Boolean(id.trim()),
    )
  ) {
    return null;
  }
  if (
    value.styleSourceCharacterId !== undefined &&
    value.styleSourceCharacterId !== null &&
    (typeof value.styleSourceCharacterId !== "string" ||
      !value.styleSourceCharacterId.trim())
  ) {
    return null;
  }

  return {
    draftStyleSpec,
    referenceIds: value.referenceIds.map((id) => id.trim()),
    styleSourceCharacterId:
      typeof value.styleSourceCharacterId === "string"
        ? value.styleSourceCharacterId.trim()
        : null,
  };
}

function invalidCompileRequest() {
  return Response.json(
    { error: INVALID_COMPILE_REQUEST },
    { status: 400 },
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
