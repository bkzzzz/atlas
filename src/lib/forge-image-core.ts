import OpenAI from "openai";
import type { ForgeReferenceImage } from "@/lib/forge-request";
import {
  classifyImageGenerationError,
  imageBase64From,
  ImageGenerationError,
  type GeneratedImage,
} from "@/lib/image-generation-core";

export type ForgeImageApiClient = {
  images: {
    generate: (
      request: OpenAI.Images.ImageGenerateParamsNonStreaming,
      options?: { signal?: AbortSignal },
    ) => Promise<unknown>;
    edit: (
      request: OpenAI.Images.ImageEditParamsNonStreaming,
      options?: { signal?: AbortSignal },
    ) => Promise<unknown>;
  };
};

export type ForgeImageDependencies = {
  apiKey: string | undefined;
  model: string | undefined;
  createClient: (apiKey: string) => ForgeImageApiClient;
  now?: () => Date;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 60_000;

function extensionFor(mimeType: ForgeReferenceImage["mimeType"]) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  return "webp";
}

// gpt-image-2 rejects `background: "transparent"` for both generate and
// edit. Other current GPT Image models can return transparent PNG assets.
export function forgeBackgroundForModel(model: string) {
  return /^gpt-image-2(?:$|-)/.test(model) ? "opaque" as const : "transparent" as const;
}

export async function generateForgeImageFromPrompt(
  compiledPrompt: string,
  referenceImage: ForgeReferenceImage | null,
  dependencies: ForgeImageDependencies,
): Promise<GeneratedImage> {
  const apiKey = dependencies.apiKey?.trim();
  const model = dependencies.model?.trim();
  if (!apiKey || !model) throw new ImageGenerationError("not_configured");

  const common = {
    model: model as OpenAI.Images.ImageModel,
    prompt: compiledPrompt,
    n: 1 as const,
    size: "1024x1024" as const,
    quality: "low" as const,
    background: forgeBackgroundForModel(model),
    output_format: "png" as const,
  };
  const options = {
    signal: AbortSignal.timeout(dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  };

  try {
    const client = dependencies.createClient(apiKey);
    const response = referenceImage
      ? await client.images.edit(
          {
            ...common,
            image: new File(
              [referenceImage.bytes],
              `reference.${extensionFor(referenceImage.mimeType)}`,
              { type: referenceImage.mimeType },
            ),
          },
          options,
        )
      : await client.images.generate(common, options);

    const image = imageBase64From(response);
    if (!image) throw new ImageGenerationError("unknown_upstream_error");

    return {
      imageUrl: `data:image/png;base64,${image}`,
      model,
      createdAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    };
  } catch (error) {
    throw classifyImageGenerationError(error);
  }
}
