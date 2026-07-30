import path from "node:path";
import { createGenerateImageHandler } from "@/lib/generate-image-handler";
import { consumeGenerationToken } from "@/lib/generation-session";
import { generateCompiledImage } from "@/lib/image-generator";
import { createReferenceImageInputResolver } from "@/lib/reference-image-inputs";
import { loadReferenceFamilyIndex } from "@/lib/reference-index-server";

// Route Handlers use the Web Request/Response APIs. This thin server-only
// wiring keeps credentials in image-generator.ts while the handler is tested
// against injected mocks without a network call.
const resolveReferenceImageInputs = createReferenceImageInputResolver({
  sourceRoot: path.resolve("data/reference-source/Kenney"),
  loadFamilyIndex: loadReferenceFamilyIndex,
});

export const POST = createGenerateImageHandler({
  consumeGenerationToken,
  generateCompiledImage,
  resolveReferenceImageInputs,
});
