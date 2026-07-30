import { toFile } from "openai";
import { betaAccess } from "@/lib/beta-access";
import { requireBetaAccess } from "@/lib/beta-access-handler";
import { createGenerateImageHandler } from "@/lib/generate-image-handler";
import { consumeGenerationToken } from "@/lib/generation-session";
import { generateCompiledImage } from "@/lib/image-generator";
import {
  getReferenceImageBytes,
  putGeneratedImage,
} from "@/lib/image-storage";
import { prisma } from "@/lib/prisma";
import { createReferenceAssetUploadResolver } from "@/lib/reference-asset-inputs";
import { persistGeneratedImage } from "@/lib/generated-image-storage";

// Route Handlers use the Web Request/Response APIs. This thin server-only
// wiring keeps credentials in image-generator.ts while the handler is tested
// against injected mocks without a network call.
const resolveReferenceImageUploads = createReferenceAssetUploadResolver({
  loadAssets: (ids) =>
    prisma.imageAsset.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        blobPathname: true,
        mimeType: true,
        byteSize: true,
      },
    }),
  getReferenceImageBytes,
  createUpload: (bytes, filename, mimeType) =>
    toFile(bytes, filename, { type: mimeType }),
});

const generateImage = createGenerateImageHandler({
  consumeGenerationToken,
  generateCompiledImage,
  resolveReferenceImageUploads,
  persistGeneratedImage: (image) =>
    persistGeneratedImage(image, putGeneratedImage),
});

export const POST = requireBetaAccess(
  generateImage,
  betaAccess.hasAccess,
);
