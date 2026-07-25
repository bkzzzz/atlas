import type { PendingGeneration } from "@/lib/generation-session";
import {
  classifyImageGenerationError,
  type GeneratedImage,
  type ImageGenerationDiagnostic,
} from "@/lib/image-generation-core";

type ConsumeGenerationToken = (token: string) => PendingGeneration | null;
type GenerateCompiledImage = (compiledPrompt: string) => Promise<GeneratedImage>;

export type GenerateImageHandlerDependencies = {
  consumeGenerationToken: ConsumeGenerationToken;
  generateCompiledImage: GenerateCompiledImage;
  logError?: (message: string, details: { category: string } & ImageGenerationDiagnostic) => void;
};

function statusForGenerationError(category: ReturnType<typeof classifyImageGenerationError>["category"]) {
  if (category === "not_configured") return 503;
  if (category === "authentication_error") return 401;
  if (category === "permission_or_model_access") return 403;
  if (category === "model_not_found") return 404;
  if (category === "insufficient_quota" || category === "rate_limit_exceeded") return 429;
  if (category === "timeout") return 504;
  return 502;
}

// The handler is dependency-injected so automated tests can exercise the real
// HTTP contract with a mocked image client. The route module provides the
// server-only production dependencies.
export function createGenerateImageHandler(dependencies: GenerateImageHandlerDependencies) {
  const activeTokens = new Set<string>();
  const logError = dependencies.logError ?? console.error;

  return async function postGenerateImage(request: Request) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: "A valid generation token is required." },
        { status: 400 },
      );
    }

    let token = "";
    try {
      const generationToken =
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as { generationToken?: unknown }).generationToken
          : undefined;
      if (typeof generationToken !== "string" || !generationToken) {
        return Response.json(
          { error: "Parse and compile a supported image request before generating." },
          { status: 400 },
        );
      }

      token = generationToken;
      if (activeTokens.has(token)) {
        return Response.json(
          { error: "This image is already being generated. Please wait." },
          { status: 409 },
        );
      }

      // Consume before the external call. This is the billing safety boundary:
      // browser prompts/models are ignored and an uncertain upstream failure
      // still requires a fresh parse-and-compile request.
      const pending = dependencies.consumeGenerationToken(token);
      if (!pending) {
        return Response.json(
          { error: "This compiled request has expired or was already used. Parse and compile again." },
          { status: 409 },
        );
      }

      activeTokens.add(token);
      const image = await dependencies.generateCompiledImage(pending.compiledPrompt);
      return Response.json({ image: { ...image, compiledPrompt: pending.compiledPrompt } });
    } catch (cause) {
      const error = classifyImageGenerationError(cause);
      // Do not log the raw upstream error (which can contain prompt/image data
      // or a provider message). The diagnostic never contains credentials.
      logError("Image generation failure", { category: error.category, ...error.diagnostic });
      return Response.json(
        { error: error.message, category: error.category },
        { status: statusForGenerationError(error.category) },
      );
    } finally {
      if (token) activeTokens.delete(token);
    }
  };
}
