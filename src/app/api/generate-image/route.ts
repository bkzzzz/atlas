import { toFile } from "openai";
import { createGenerateImageHandler } from "@/lib/generate-image-handler";
import { consumeGenerationToken } from "@/lib/generation-session";
import { generateCompiledImage } from "@/lib/image-generator";
import { prisma } from "@/lib/prisma";
import { createReferenceAssetUploadResolver } from "@/lib/reference-asset-inputs";

// Route Handlers use the Web Request/Response APIs. This thin server-only
// wiring keeps credentials in image-generator.ts while the handler is tested
// against injected mocks without a network call.
const resolveReferenceImageUploads = createReferenceAssetUploadResolver({
  loadAssets: (ids) =>
    prisma.imageAsset.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true, imageUrl: true },
    }),
  fetchImage: (url) => fetch(url, { redirect: "error" }),
  createUpload: (bytes, filename, mimeType) =>
    toFile(bytes, filename, { type: mimeType }),
});

export const POST = createGenerateImageHandler({
  consumeGenerationToken,
  generateCompiledImage,
  resolveReferenceImageUploads,
});
