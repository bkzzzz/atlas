import "server-only";
import sharp from "sharp";
import {
  hasWorkspaceImageSignature,
  MAX_WORKSPACE_ASSET_BYTES,
  MAX_WORKSPACE_IMAGE_PIXELS,
  WORKSPACE_IMAGE_TYPES,
  validateWorkspaceImageDimensions,
  WorkspaceInputError,
} from "@/lib/workspace-core";

export type ParsedWorkspaceImage = {
  name: string;
  mimeType: (typeof WORKSPACE_IMAGE_TYPES)[number];
  bytes: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
};

export function parseImageDimension(
  value: FormDataEntryValue | null,
  name: "width" | "height",
) {
  if (typeof value !== "string" || !/^\d{1,5}$/u.test(value)) {
    throw new WorkspaceInputError(`The image ${name} is invalid.`);
  }
  const parsed = Number(value);
  // 16 megapixels keeps browser and server decoding memory bounded.
  if (parsed < 1 || parsed > 8192) {
    throw new WorkspaceInputError(`The image ${name} is invalid.`);
  }
  return parsed;
}

export async function parseWorkspaceImage(
  form: FormData,
  field = "file",
): Promise<ParsedWorkspaceImage> {
  const files = form.getAll(field);
  if (
    files.length !== 1 ||
    !(files[0] instanceof File) ||
    files[0].size === 0
  ) {
    throw new WorkspaceInputError("Choose a PNG, JPEG, or WebP image.");
  }
  const file = files[0];
  if (file.size > MAX_WORKSPACE_ASSET_BYTES) {
    throw new WorkspaceInputError("Images must be 10 MB or smaller.", 413);
  }
  if (!(WORKSPACE_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new WorkspaceInputError("Use a PNG, JPEG, or WebP image.", 415);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasWorkspaceImageSignature(bytes, file.type)) {
    throw new WorkspaceInputError("The selected file is not a valid image.");
  }

  const declaredWidths = form.getAll("width");
  const declaredHeights = form.getAll("height");
  if (declaredWidths.length !== 1 || declaredHeights.length !== 1) {
    throw new WorkspaceInputError(
      "Send exactly one width and height for the image.",
    );
  }
  const declaredWidth = parseImageDimension(declaredWidths[0], "width");
  const declaredHeight = parseImageDimension(declaredHeights[0], "height");

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: MAX_WORKSPACE_IMAGE_PIXELS,
    }).metadata();
  } catch {
    throw new WorkspaceInputError(
      "The selected image could not be safely decoded.",
    );
  }
  const expectedFormat = {
    "image/png": "png",
    "image/jpeg": "jpeg",
    "image/webp": "webp",
  }[file.type];
  if (metadata.format !== expectedFormat) {
    throw new WorkspaceInputError(
      "The selected image type does not match its contents.",
    );
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new WorkspaceInputError("Animated images are not supported.");
  }
  const swapsAxes =
    metadata.orientation !== undefined &&
    metadata.orientation >= 5 &&
    metadata.orientation <= 8;
  const decodedWidth = swapsAxes ? metadata.height : metadata.width;
  const decodedHeight = swapsAxes ? metadata.width : metadata.height;
  const { pixelWidth, pixelHeight } = validateWorkspaceImageDimensions(
    decodedWidth,
    decodedHeight,
  );
  if (
    declaredWidth !== pixelWidth ||
    declaredHeight !== pixelHeight
  ) {
    throw new WorkspaceInputError(
      `The declared image dimensions do not match the decoded ${pixelWidth} × ${pixelHeight} image.`,
    );
  }
  try {
    await sharp(bytes, {
      failOn: "error",
      limitInputPixels: MAX_WORKSPACE_IMAGE_PIXELS,
    })
      .rotate()
      .raw()
      .toBuffer();
  } catch {
    throw new WorkspaceInputError(
      "The selected image could not be safely decoded.",
    );
  }

  return {
    name: file.name.trim().slice(0, 120) || "Imported asset",
    mimeType: file.type as ParsedWorkspaceImage["mimeType"],
    bytes,
    pixelWidth,
    pixelHeight,
  };
}
