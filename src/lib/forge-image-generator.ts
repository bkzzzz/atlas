import "server-only";
import OpenAI from "openai";
import {
  generateForgeImageFromPrompt,
  type ForgeImageApiClient,
} from "@/lib/forge-image-core";
import type { ForgeReferenceImage } from "@/lib/forge-request";
import type { GeneratedImage } from "@/lib/image-generation-core";

const IMAGE_TIMEOUT_MS = 60_000;

function createOpenAIImageClient(apiKey: string): ForgeImageApiClient {
  // Paid image requests are not retried because an uncertain retry can create
  // another charge.
  return new OpenAI({
    apiKey,
    timeout: IMAGE_TIMEOUT_MS,
    maxRetries: 0,
  }) as unknown as ForgeImageApiClient;
}

// This is the only Forge module that reads image-generation environment
// variables, keeping both values out of client components and browser input.
export function generateForgeImage(
  compiledPrompt: string,
  referenceImage: ForgeReferenceImage | null,
): Promise<GeneratedImage> {
  return generateForgeImageFromPrompt(compiledPrompt, referenceImage, {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_IMAGE_MODEL,
    createClient: createOpenAIImageClient,
    timeoutMs: IMAGE_TIMEOUT_MS,
  });
}
