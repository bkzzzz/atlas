import { buildCharacterMetadata } from "@/lib/metadata-builder";
import { getOrCreateAnonymousAssetOwner } from "@/lib/anonymous-asset-owner";
import { betaAccess } from "@/lib/beta-access";
import { requireBetaAccess } from "@/lib/beta-access-handler";
import { prisma } from "@/lib/prisma";
import { createGenerationToken } from "@/lib/generation-session";
import { compileSingleStaticImageTask } from "@/lib/single-image-compiler";
import { classifyParserError, parseStaticImageTask } from "@/lib/task-parser";
import {
  runStaticImageMode,
  validateParseTaskRequest,
} from "@/lib/task-mode";

const activeParses = new Set<string>();

function developmentDiagnostic(error: ReturnType<typeof classifyParserError>) {
  return process.env.NODE_ENV === "development" ? error.diagnostic : undefined;
}

function parserErrorStatus(category: ReturnType<typeof classifyParserError>["category"]) {
  if (category === "not_configured") return 503;
  if (category === "authentication_error") return 401;
  if (category === "permission_or_model_access") return 403;
  if (category === "model_not_found") return 404;
  if (category === "insufficient_quota" || category === "rate_limit_exceeded") return 429;
  if (category === "timeout") return 504;
  return 502;
}

// The selected mode is the single eligibility gate. Only STATIC_IMAGE enters
// the parser/compiler/token flow; unsupported modes return before database or
// LLM work and never acquire a one-time generation token.
async function parseTask(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "A valid mode and natural-language request are required." },
      { status: 400 },
    );
  }

  const validation = validateParseTaskRequest(body);
  if (!validation.valid) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const {
    selectedMode,
    request: naturalLanguageRequest,
    assetSettings,
    styleSourceCharacterId,
  } = validation.value;

  try {
    const modeResult = await runStaticImageMode(selectedMode, async () => {
      const { id: characterId } = await context.params;
      const character = await prisma.character.findUnique({ where: { id: characterId } });
      if (!character) return Response.json({ error: "Character not found." }, { status: 404 });
      if (styleSourceCharacterId === characterId) {
        return Response.json(
          { error: "Choose another character as the style source." },
          { status: 400 },
        );
      }

      const [memory, assets] = await Promise.all([
        prisma.characterMemory.findUnique({ where: { characterId } }),
        prisma.imageAsset.findMany({
          where: {
            characterId,
            OR: [{ kind: null }, { kind: "REFERENCE" }],
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);
      let styleSourceMetadata = null;
      if (styleSourceCharacterId) {
        const [styleCharacter, styleMemory, styleAssets] = await Promise.all([
          prisma.character.findUnique({ where: { id: styleSourceCharacterId } }),
          prisma.characterMemory.findUnique({
            where: { characterId: styleSourceCharacterId },
          }),
          prisma.imageAsset.findMany({
            where: {
              characterId: styleSourceCharacterId,
              OR: [{ kind: null }, { kind: "REFERENCE" }],
            },
            orderBy: { createdAt: "desc" },
          }),
        ]);
        if (!styleCharacter) {
          return Response.json(
            { error: "Style source character not found." },
            { status: 404 },
          );
        }
        styleSourceMetadata = buildCharacterMetadata({
          character: styleCharacter,
          memory: styleMemory,
          assets: styleAssets,
        });
      }

      // Prevent repeated clicks from starting a second parser request while
      // the same static-image request is in flight in this server process.
      const parseKey = `${characterId}:${styleSourceCharacterId ?? "new"}:${naturalLanguageRequest}`;
      if (activeParses.has(parseKey)) {
        return Response.json(
          { error: "This request is already being parsed. Please wait." },
          { status: 409 },
        );
      }

      activeParses.add(parseKey);
      let parsed;
      try {
        parsed = await parseStaticImageTask(naturalLanguageRequest, assetSettings);
      } finally {
        activeParses.delete(parseKey);
      }

      const metadata = buildCharacterMetadata({ character, memory, assets });
      const compiled = compileSingleStaticImageTask(
        parsed.parsedTask,
        metadata,
        styleSourceMetadata,
      );
      const anonymousOwner = getOrCreateAnonymousAssetOwner(request, {
        secureCookies: process.env.NODE_ENV === "production",
      });
      const generationRequestId = crypto.randomUUID();
      const generationToken = createGenerationToken(
        compiled.compiledPrompt,
        assetSettings.background === "TRANSPARENT" ? "transparent" : "opaque",
        metadata.visualReferences.map(({ id }) => id),
        {
          generationRequestId,
          anonymousOwnerKey: anonymousOwner.ownerKey,
          characterId,
          assetName: `${character.name} — ${parsed.parsedTask.assetKind}`,
          assetType: parsed.parsedTask.assetKind,
          sourcePrompt: parsed.parsedTask.userRequest,
          generationSettings: {
            version: 1,
            assetSettings,
            styleSourceCharacterId,
            referenceAssetIds: metadata.visualReferences.map(({ id }) => id),
            parser: {
              model: parsed.model,
              requestId: parsed.requestId,
            },
          },
        },
      );

      const response = Response.json({
        selectedMode,
        parsedTask: parsed.parsedTask,
        metadata,
        ...compiled,
        generationToken,
        parser: { model: parsed.model, usage: parsed.usage },
      });
      if (anonymousOwner.setCookie) {
        response.headers.append("Set-Cookie", anonymousOwner.setCookie);
      }
      return response;
    });

    if (!modeResult.supported) {
      return Response.json(
        { error: modeResult.error, category: "unsupported_task" },
        { status: 422 },
      );
    }

    return modeResult.value;
  } catch (cause) {
    const error = classifyParserError(cause);
    // Only safe, non-secret diagnostics are logged. The raw provider payload,
    // prompt and credentials never enter logs or client responses.
    console.error("Task parser failure", { category: error.category, ...error.diagnostic });
    return Response.json(
      {
        error: error.message,
        category: error.category,
        diagnostic: developmentDiagnostic(error),
      },
      { status: parserErrorStatus(error.category) },
    );
  }
}

export const POST = requireBetaAccess(
  parseTask,
  betaAccess.hasAccess,
);
