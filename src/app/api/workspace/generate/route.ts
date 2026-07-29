import { compileForgePrompt } from "@/lib/forge-prompt";
import { generateForgeImage } from "@/lib/forge-image-generator";
import {
  ForgeRequestError,
  parseForgeRequest,
} from "@/lib/forge-request";
import {
  classifyImageGenerationError,
  safeImageGenerationMessage,
} from "@/lib/image-generation-core";
import { generatedPngBytes } from "@/lib/workspace-core";
import { createImageNode } from "@/lib/workspace-server";

export const runtime = "nodejs";

function generationStatus(category: ReturnType<typeof classifyImageGenerationError>["category"]) {
  if (category === "not_configured") return 503;
  if (category === "authentication_error") return 401;
  if (category === "permission_or_model_access") return 403;
  if (category === "model_not_found") return 404;
  if (category === "insufficient_quota" || category === "rate_limit_exceeded") return 429;
  if (category === "timeout") return 504;
  return 502;
}

const assetNames = {
  CHARACTER: "Generated character",
  ITEM: "Generated item",
  ICON: "Generated icon",
  ENVIRONMENT: "Generated environment",
} as const;

export async function POST(request: Request) {
  try {
    const input = await parseForgeRequest(request);
    const generated = await generateForgeImage(
      compileForgePrompt(input),
      input.referenceImage,
    );
    const name = assetNames[input.assetType];
    const direction =
      input.prompt ??
      `${input.visualStyle.replaceAll("_", " ").toLowerCase()} ${input.assetType.toLowerCase()}`;
    const result = await createImageNode({
      name,
      mimeType: "image/png",
      bytes: generatedPngBytes(generated.imageUrl),
      width: 1024,
      height: 1024,
      source: "AI",
      prompt: input.prompt,
      conversation: {
        user: direction,
        assistant: `Added ${name.toLowerCase()} to the canvas.`,
      },
    });
    return Response.json(
      { node: result.node, messages: result.messages },
      { status: 201 },
    );
  } catch (cause) {
    if (cause instanceof ForgeRequestError) {
      return Response.json({ error: cause.message }, { status: cause.status });
    }
    const error = classifyImageGenerationError(cause);
    console.error("Workspace image generation failure", {
      category: error.category,
      ...error.diagnostic,
    });
    return Response.json(
      { error: safeImageGenerationMessage(error.category) },
      { status: generationStatus(error.category) },
    );
  }
}
