import { compileForgePrompt } from "@/lib/forge-prompt";
import {
  ForgeRequestError,
  parseForgeRequest,
  type ForgeReferenceImage,
} from "@/lib/forge-request";
import {
  classifyImageGenerationError,
  type GeneratedImage,
  type ImageGenerationDiagnostic,
} from "@/lib/image-generation-core";

type GenerateForgeImage = (
  compiledPrompt: string,
  referenceImage: ForgeReferenceImage | null,
) => Promise<GeneratedImage>;

export type ForgeHandlerDependencies = {
  generateForgeImage: GenerateForgeImage;
  logError?: (
    message: string,
    details: { category: string } & ImageGenerationDiagnostic,
  ) => void;
};

function statusForGenerationError(
  category: ReturnType<typeof classifyImageGenerationError>["category"],
) {
  if (category === "not_configured") return 503;
  if (category === "authentication_error") return 401;
  if (category === "permission_or_model_access") return 403;
  if (category === "model_not_found") return 404;
  if (category === "insufficient_quota" || category === "rate_limit_exceeded") return 429;
  if (category === "timeout") return 504;
  return 502;
}

function friendlyForgeMessage(
  category: ReturnType<typeof classifyImageGenerationError>["category"],
) {
  if (category === "rate_limit_exceeded" || category === "insufficient_quota") {
    return "The forge is busy right now. Please try again in a moment.";
  }
  if (category === "timeout") {
    return "This asset took too long to finish. Please try forging it again.";
  }
  if (
    category === "not_configured" ||
    category === "authentication_error" ||
    category === "permission_or_model_access" ||
    category === "model_not_found"
  ) {
    return "The forge is unavailable right now. Please try again later.";
  }
  return "The forge cooled down before finishing. Please try again.";
}

export function createForgeHandler(dependencies: ForgeHandlerDependencies) {
  const logError = dependencies.logError ?? console.error;

  return async function postForge(request: Request) {
    try {
      const input = await parseForgeRequest(request);
      const image = await dependencies.generateForgeImage(
        compileForgePrompt(input),
        input.referenceImage,
      );
      return Response.json({ image });
    } catch (cause) {
      if (cause instanceof ForgeRequestError) {
        return Response.json(
          { error: cause.message, category: cause.code },
          { status: cause.status },
        );
      }

      const error = classifyImageGenerationError(cause);
      // Never log raw provider errors, prompts, uploads, credentials, or image data.
      logError("Forge image generation failure", {
        category: error.category,
        ...error.diagnostic,
      });
      return Response.json(
        { error: friendlyForgeMessage(error.category), category: error.category },
        { status: statusForGenerationError(error.category) },
      );
    }
  };
}
