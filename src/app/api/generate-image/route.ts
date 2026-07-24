import { consumeGenerationToken } from "@/lib/generation-session";
import { generateCompiledImage } from "@/lib/image-generator";
import { classifyParserError } from "@/lib/task-parser";

const activeTokens = new Set<string>();

export async function POST(request: Request) {
  let token = "";
  try {
    const body = await request.json();
    if (!body || typeof body.generationToken !== "string" || !body.generationToken) {
      return Response.json({ error: "Parse and compile a supported image request before generating." }, { status: 400 });
    }
    token = body.generationToken;
    if (activeTokens.has(token)) return Response.json({ error: "This image is already being generated. Please wait." }, { status: 409 });
    const pending = consumeGenerationToken(token);
    if (!pending) return Response.json({ error: "This compiled request has expired or was already used. Parse and compile again." }, { status: 409 });
    activeTokens.add(token);
    const image = await generateCompiledImage(pending.compiledPrompt);
    return Response.json({ image: { ...image, compiledPrompt: pending.compiledPrompt } });
  } catch (cause) {
    const error = classifyParserError(cause);
    console.error("Image generation failure", { category: error.category, ...error.diagnostic });
    const status = error.category === "not_configured" ? 503 : error.category === "authentication_error" ? 401 : error.category === "permission_or_model_access" ? 403 : error.category === "model_not_found" ? 404 : error.category === "insufficient_quota" || error.category === "rate_limit_exceeded" ? 429 : error.category === "timeout" ? 504 : 502;
    return Response.json({ error: error.message, category: error.category }, { status });
  } finally {
    if (token) activeTokens.delete(token);
  }
}
