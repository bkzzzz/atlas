import { createGenerateImageHandler } from "@/lib/generate-image-handler";
import { consumeGenerationToken } from "@/lib/generation-session";
import { generateCompiledImage } from "@/lib/image-generator";

// Route Handlers use the Web Request/Response APIs. This thin server-only
// wiring keeps credentials in image-generator.ts while the handler is tested
// against injected mocks without a network call.
export const POST = createGenerateImageHandler({
  consumeGenerationToken,
  generateCompiledImage,
});
