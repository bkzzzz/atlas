import "server-only";
import sharp from "sharp";
import {
  MAX_WORKSPACE_IMAGE_PIXELS,
  WorkspaceInputError,
} from "@/lib/workspace-core";

export const REFERENCE_COMPOSITE_SIZE = 1024;
const REFERENCE_COMPOSITE_GAP = 12;
const REFERENCE_COMPOSITE_PADDING = 16;

export async function composeReferenceImages(
  images: readonly Uint8Array[],
): Promise<Uint8Array> {
  if (images.length < 1 || images.length > 3) {
    throw new WorkspaceInputError(
      "Choose between 1 and 3 references for generation.",
    );
  }
  if (images.some((bytes) => !(bytes instanceof Uint8Array) || bytes.length === 0)) {
    throw new WorkspaceInputError("A selected reference image is unavailable.");
  }

  const usableWidth =
    REFERENCE_COMPOSITE_SIZE -
    REFERENCE_COMPOSITE_PADDING * 2 -
    REFERENCE_COMPOSITE_GAP * (images.length - 1);
  const baseWidth = Math.floor(usableWidth / images.length);
  let left = REFERENCE_COMPOSITE_PADDING;
  const composites: sharp.OverlayOptions[] = [];

  for (const [index, bytes] of images.entries()) {
    const remainingWidth =
      usableWidth - baseWidth * (images.length - 1);
    const width = index === images.length - 1 ? remainingWidth : baseWidth;
    let input: Buffer;
    try {
      input = await sharp(bytes, {
        failOn: "error",
        limitInputPixels: MAX_WORKSPACE_IMAGE_PIXELS,
      })
        .rotate()
        .resize({
          width,
          height: REFERENCE_COMPOSITE_SIZE - REFERENCE_COMPOSITE_PADDING * 2,
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          withoutEnlargement: false,
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch {
      throw new WorkspaceInputError(
        "A selected reference image could not be decoded.",
      );
    }
    composites.push({
      input,
      left,
      top: REFERENCE_COMPOSITE_PADDING,
    });
    left += width + REFERENCE_COMPOSITE_GAP;
  }

  const output = await sharp({
    create: {
      width: REFERENCE_COMPOSITE_SIZE,
      height: REFERENCE_COMPOSITE_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
  return Uint8Array.from(output);
}
