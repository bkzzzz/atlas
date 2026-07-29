import {
  optionalFormText,
  readWorkspaceForm,
  requiredFormText,
  workspaceRouteError,
} from "@/app/api/workspace/_route-utils";
import { compileGenerationDirection } from "@/lib/art-direction-core";
import { generateForgeImage } from "@/lib/forge-image-generator";
import { MAX_FORGE_PROMPT_LENGTH } from "@/lib/forge-request";
import {
  classifyImageGenerationError,
  safeImageGenerationMessage,
} from "@/lib/image-generation-core";
import { generatedPngBytes } from "@/lib/workspace-core";
import {
  artDirectionForGeneration,
  createImageNode,
  generationReferenceImage,
} from "@/lib/workspace-server";

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

function generatedAssetName(assetType: string) {
  const label = assetType
    .replaceAll("_", " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
  return `Generated ${label || "asset"}`.slice(0, 80);
}

export async function POST(request: Request) {
  try {
    const form = await readWorkspaceForm(request, ["styleSpecId", "prompt"]);
    const styleSpecId = requiredFormText(form, "styleSpecId", 120);
    const prompt = optionalFormText(
      form,
      "prompt",
      MAX_FORGE_PROMPT_LENGTH,
    );
    const artDirection = await artDirectionForGeneration(styleSpecId);
    if (!artDirection) {
      return Response.json(
        { error: "The selected StyleSpec no longer exists." },
        { status: 404 },
      );
    }
    const compiledDirection = compileGenerationDirection({
      brief: artDirection.brief,
      styleSpec: artDirection.styleSpec,
      prompt,
    });
    const generated = await generateForgeImage(
      compiledDirection,
      await generationReferenceImage(artDirection.references),
    );
    const name = generatedAssetName(artDirection.brief.assetType);
    const result = await createImageNode({
      name,
      mimeType: "image/png",
      bytes: generatedPngBytes(generated.imageUrl),
      pixelWidth: 1024,
      pixelHeight: 1024,
      source: "AI",
      prompt: compiledDirection,
      styleSpecId: artDirection.styleSpec.id,
      referenceIds: artDirection.styleSpec.referenceIds,
      conversation: {
        user:
          prompt ??
          `Generate a ${artDirection.brief.assetType.toLocaleLowerCase("en-US")} using ${artDirection.styleSpec.styleName}.`,
        assistant: `Added ${name.toLowerCase()} to the canvas.`,
      },
    });
    return Response.json(
      { node: result.node, messages: result.messages },
      { status: 201 },
    );
  } catch (cause) {
    const inputError = workspaceRouteError(
      cause,
      "The asset could not be generated.",
    );
    if (inputError.status < 500) {
      return inputError;
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
