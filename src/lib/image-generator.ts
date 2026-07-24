import "server-only";
import OpenAI from "openai";
import { classifyParserError, TaskParserError } from "@/lib/task-parser";

const IMAGE_TIMEOUT_MS = 60_000;

export type GeneratedImage = { imageUrl: string; model: string; createdAt: string };

// One direct Image API call creates exactly one temporary PNG. The base64 data
// is returned to the browser for display only; it is not written to disk or DB.
export async function generateCompiledImage(compiledPrompt: string): Promise<GeneratedImage> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL?.trim();
  if (!apiKey || !model) throw new TaskParserError("not_configured");

  try {
    const client = new OpenAI({ apiKey, timeout: IMAGE_TIMEOUT_MS, maxRetries: 0 });
    const response = await client.images.generate({
      model: model as OpenAI.Images.ImageModel,
      prompt: compiledPrompt,
      n: 1,
      size: "1024x1024",
      quality: "low",
      background: "opaque",
      output_format: "png",
    }, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    const image = response.data?.[0]?.b64_json;
    if (!image) throw new TaskParserError("unknown_upstream_error");
    return { imageUrl: `data:image/png;base64,${image}`, model, createdAt: new Date().toISOString() };
  } catch (error) {
    throw classifyParserError(error);
  }
}
