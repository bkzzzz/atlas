import "server-only";
import OpenAI from "openai";
import {
  generateImageFromCompiledPrompt,
  type GeneratedImage,
  type ImageApiClient,
} from "@/lib/image-generation-core";

const IMAGE_TIMEOUT_MS = 60_000;

export type { GeneratedImage } from "@/lib/image-generation-core";

function createOpenAIImageClient(apiKey: string): ImageApiClient {
  // maxRetries remains zero because retrying an uncertain paid image request
  // could create another charge. The one-time token is consumed before this.
  return new OpenAI({ apiKey, timeout: IMAGE_TIMEOUT_MS, maxRetries: 0 }) as unknown as ImageApiClient;
}

// This wrapper is the only image-generation module that reads environment
// variables. It keeps the API key out of the client bundle and test fixtures.
export function generateCompiledImage(compiledPrompt: string): Promise<GeneratedImage> {
  return generateImageFromCompiledPrompt(compiledPrompt, {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_IMAGE_MODEL,
    createClient: createOpenAIImageClient,
    timeoutMs: IMAGE_TIMEOUT_MS,
  });
}
