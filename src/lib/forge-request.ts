export const FORGE_ASSET_TYPES = [
  "CHARACTER",
  "ITEM",
  "ICON",
  "ENVIRONMENT",
] as const;

export const FORGE_VISUAL_STYLES = [
  "PIXEL_ART",
  "FANTASY_2D",
  "STORYBOOK",
] as const;

export const FORGE_VIEW_ANGLES = [
  "FRONT",
  "SIDE",
  "ISOMETRIC",
  "TOP_DOWN",
] as const;

export const FORGE_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type ForgeAssetType = (typeof FORGE_ASSET_TYPES)[number];
export type ForgeVisualStyle = (typeof FORGE_VISUAL_STYLES)[number];
export type ForgeViewAngle = (typeof FORGE_VIEW_ANGLES)[number];
export type ForgeImageMimeType = (typeof FORGE_IMAGE_MIME_TYPES)[number];

export type ForgeReferenceImage = {
  bytes: ArrayBuffer;
  mimeType: ForgeImageMimeType;
};

export type ForgeRequestInput = {
  assetType: ForgeAssetType;
  visualStyle: ForgeVisualStyle;
  viewAngle: ForgeViewAngle;
  prompt: string | null;
  referenceImage: ForgeReferenceImage | null;
};

export type ForgeRequestErrorCode =
  | "invalid_request"
  | "unsupported_media_type"
  | "image_too_large";

export class ForgeRequestError extends Error {
  constructor(
    public readonly code: ForgeRequestErrorCode,
    public readonly status: 400 | 413 | 415,
    message: string,
  ) {
    super(message);
  }
}

export const MAX_FORGE_PROMPT_LENGTH = 280;
export const MAX_FORGE_REFERENCE_BYTES = 10 * 1024 * 1024;

const EXPECTED_FIELDS = new Set([
  "assetType",
  "visualStyle",
  "viewAngle",
  "prompt",
  "referenceImage",
]);

function isOneOf<const Values extends readonly string[]>(
  value: string,
  values: Values,
): value is Values[number] {
  return (values as readonly string[]).includes(value);
}

function requiredString(formData: FormData, name: string) {
  const values = formData.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new ForgeRequestError(
      "invalid_request",
      400,
      `Choose a valid ${name} before generating.`,
    );
  }

  const value = values[0].trim();
  if (!value) {
    throw new ForgeRequestError(
      "invalid_request",
      400,
      `Choose a valid ${name} before generating.`,
    );
  }
  return value;
}

function optionalPrompt(formData: FormData) {
  const values = formData.getAll("prompt");
  if (values.length === 0) return null;
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new ForgeRequestError(
      "invalid_request",
      400,
      "The optional prompt must be plain text.",
    );
  }

  const prompt = values[0].trim();
  if (prompt.length > MAX_FORGE_PROMPT_LENGTH) {
    throw new ForgeRequestError(
      "invalid_request",
      400,
      `Keep the prompt to ${MAX_FORGE_PROMPT_LENGTH} characters or fewer.`,
    );
  }
  return prompt || null;
}

function hasMatchingSignature(bytes: Uint8Array, mimeType: ForgeImageMimeType) {
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

async function optionalReferenceImage(
  formData: FormData,
): Promise<ForgeReferenceImage | null> {
  const values = formData.getAll("referenceImage");
  if (values.length === 0) return null;
  if (values.length !== 1 || typeof values[0] === "string") {
    throw new ForgeRequestError(
      "invalid_request",
      400,
      "Attach at most one reference image.",
    );
  }

  const image = values[0];
  if (image.size === 0) {
    throw new ForgeRequestError(
      "invalid_request",
      400,
      "The reference image is empty. Choose another image.",
    );
  }
  if (image.size > MAX_FORGE_REFERENCE_BYTES) {
    throw new ForgeRequestError(
      "image_too_large",
      413,
      "The reference image must be 10 MB or smaller.",
    );
  }
  if (!isOneOf(image.type, FORGE_IMAGE_MIME_TYPES)) {
    throw new ForgeRequestError(
      "unsupported_media_type",
      415,
      "Use a PNG, JPEG, or WebP reference image.",
    );
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await image.arrayBuffer();
  } catch {
    throw new ForgeRequestError(
      "invalid_request",
      400,
      "The reference image could not be read. Choose another image.",
    );
  }
  if (!hasMatchingSignature(new Uint8Array(bytes), image.type)) {
    throw new ForgeRequestError(
      "invalid_request",
      400,
      "The reference image does not appear to be a valid PNG, JPEG, or WebP file.",
    );
  }

  return { bytes, mimeType: image.type };
}

export async function parseForgeRequest(request: Request): Promise<ForgeRequestInput> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) {
    throw new ForgeRequestError(
      "unsupported_media_type",
      415,
      "Send this request as multipart form data.",
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new ForgeRequestError(
      "invalid_request",
      400,
      "The generation request could not be read. Please try again.",
    );
  }

  for (const field of formData.keys()) {
    if (!EXPECTED_FIELDS.has(field)) {
      throw new ForgeRequestError(
        "invalid_request",
        400,
        `The request contains an unsupported field: ${field}.`,
      );
    }
  }

  const assetType = requiredString(formData, "assetType");
  const visualStyle = requiredString(formData, "visualStyle");
  const viewAngle = requiredString(formData, "viewAngle");

  if (!isOneOf(assetType, FORGE_ASSET_TYPES)) {
    throw new ForgeRequestError(
      "invalid_request",
      400,
      "Choose a supported asset type.",
    );
  }
  if (!isOneOf(visualStyle, FORGE_VISUAL_STYLES)) {
    throw new ForgeRequestError(
      "invalid_request",
      400,
      "Choose a supported visual style.",
    );
  }
  if (!isOneOf(viewAngle, FORGE_VIEW_ANGLES)) {
    throw new ForgeRequestError(
      "invalid_request",
      400,
      "Choose a supported view angle.",
    );
  }

  return {
    assetType,
    visualStyle,
    viewAngle,
    prompt: optionalPrompt(formData),
    referenceImage: await optionalReferenceImage(formData),
  };
}
