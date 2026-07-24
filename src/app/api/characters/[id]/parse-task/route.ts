import { buildCharacterMetadata } from "@/lib/metadata-builder";
import { getProviderAdapter } from "@/lib/providers";
import { prisma } from "@/lib/prisma";
import { classifyParserError, parseArtTask } from "@/lib/task-parser";
import { createGenerationToken } from "@/lib/generation-session";

const activeParses = new Set<string>();

function developmentDiagnostic(error: ReturnType<typeof classifyParserError>) {
  if (process.env.NODE_ENV !== "development") return undefined;
  return error.diagnostic;
}

// This server-only flow makes one LLM parsing call, validates it, then passes
// the result to the existing deterministic provider adapter and compiler.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: characterId } = await context.params;
    const body = await request.json();
    if (!body || typeof body.request !== "string" || !body.request.trim()) {
      return Response.json({ error: "A natural-language art request is required." }, { status: 400 });
    }

    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) return Response.json({ error: "Character not found." }, { status: 404 });
    const [memory, assets] = await Promise.all([
      prisma.characterMemory.findUnique({ where: { characterId } }),
      prisma.imageAsset.findMany({ where: { characterId, status: { in: ["APPROVED", "REJECTED"] } }, orderBy: { createdAt: "desc" } }),
    ]);

    // Prevent repeated clicks from starting a second billable request while the
    // same request is already in flight in this server process.
    const parseKey = `${characterId}:${body.request.trim()}`;
    if (activeParses.has(parseKey)) {
      return Response.json({ error: "This request is already being parsed. Please wait." }, { status: 409 });
    }
    activeParses.add(parseKey);
    let parsed;
    try {
      parsed = await parseArtTask(body.request);
    } finally {
      activeParses.delete(parseKey);
    }
    const metadata = buildCharacterMetadata({ character, memory, assets });
    const compiled = getProviderAdapter(parsed.parsedTask.provider).compile({
      metadata,
      userRequest: parsed.parsedTask.userRequest,
      rikaOptions: parsed.parsedTask.rikaOptions ?? undefined,
    });

    // Only static GENERIC_IMAGE generation is enabled in this first paid loop.
    const generationToken = parsed.parsedTask.provider === "GENERIC_IMAGE" && parsed.parsedTask.operation === "generate"
      ? createGenerationToken(compiled.compiledPrompt)
      : null;
    return Response.json({ parsedTask: parsed.parsedTask, metadata, ...compiled, generationToken, parser: { model: parsed.model, usage: parsed.usage } });
  } catch (cause) {
    const error = classifyParserError(cause);
    // Retain provider diagnostics only on the server. These fields never
    // include the API key; production responses stay intentionally generic.
    console.error("Task parser failure", { category: error.category, ...error.diagnostic });
    const status = error.category === "not_configured" ? 503 : error.category === "authentication_error" ? 401 : error.category === "permission_or_model_access" ? 403 : error.category === "model_not_found" ? 404 : error.category === "insufficient_quota" || error.category === "rate_limit_exceeded" ? 429 : error.category === "timeout" ? 504 : error.category === "malformed_structured_output" ? 502 : 502;
    return Response.json({ error: error.message, category: error.category, diagnostic: developmentDiagnostic(error) }, { status });
  }
}
