const MAX_REFERENCE_IMAGE_BYTES = 4_000_000;
const MAX_GENERATED_IMAGE_BYTES = 25_000_000;
const SUPPORTED_IMAGE_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export type StoredImage = Readonly<{
  url: string;
  pathname: string;
  mimeType: string;
  byteSize: number;
}>;

export type ImageBytes = Readonly<{
  bytes: Uint8Array;
  mimeType: string;
}>;

export type ImageToStore = Readonly<{
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}>;

export type StoredReference = Readonly<{
  pathname: string;
  mimeType: string;
  byteSize: number;
}>;

type PutOptions = Readonly<{
  access: "public";
  addRandomSuffix: false;
  contentType: string;
  token: string;
}>;

type GetOptions = Readonly<{
  access: "public";
  token: string;
  useCache: false;
}>;

type DeleteOptions = Readonly<{ token: string }>;

type ImageStorageDependencies = Readonly<{
  token?: string;
  putBlob: (
    pathname: string,
    body: Uint8Array,
    options: PutOptions,
  ) => Promise<{
    url: string;
    pathname: string;
    contentType: string;
  }>;
  getBlob: (
    pathname: string,
    options: GetOptions,
  ) => Promise<{
    statusCode: 200;
    stream: ReadableStream<Uint8Array>;
    blob: {
      pathname: string;
      url: string;
      contentType: string;
      size: number;
    };
  } | null>;
  deleteBlob: (
    pathname: string,
    options: DeleteOptions,
  ) => Promise<void>;
  createId?: () => string;
  isNotFoundError?: (error: unknown) => boolean;
}>;

export class ImageStorageError extends Error {}

export function createImageStorage(dependencies: ImageStorageDependencies) {
  const createId = dependencies.createId ?? crypto.randomUUID;

  async function putImage(
    folder: "references" | "generated",
    input: ImageToStore,
  ): Promise<StoredImage> {
    validateImage(
      input.bytes,
      input.mimeType,
      () => new ImageStorageError("Image content is invalid."),
      folder === "references"
        ? MAX_REFERENCE_IMAGE_BYTES
        : MAX_GENERATED_IMAGE_BYTES,
    );
    const token = requiredToken(dependencies.token);
    const extension = SUPPORTED_IMAGE_TYPES.get(input.mimeType);
    if (!extension) throw unsupportedTypeError();
    const filename = safeFilename(input.filename, extension);
    const pathname = `${folder}/${createId()}-${filename}`;
    const result = await dependencies.putBlob(pathname, input.bytes, {
      access: "public",
      addRandomSuffix: false,
      contentType: input.mimeType,
      token,
    });
    if (
      !result.url ||
      result.pathname !== pathname ||
      normalizeMimeType(result.contentType) !== input.mimeType
    ) {
      throw new ImageStorageError("Image storage returned invalid metadata.");
    }
    return {
      url: result.url,
      pathname: result.pathname,
      mimeType: input.mimeType,
      byteSize: input.bytes.byteLength,
    };
  }

  async function deleteImage(pathname: string) {
    if (!validPathname(pathname)) {
      throw new ImageStorageError("Image storage pathname is invalid.");
    }
    try {
      await dependencies.deleteBlob(pathname, {
        token: requiredToken(dependencies.token),
      });
    } catch (error) {
      if (!dependencies.isNotFoundError?.(error)) throw error;
    }
  }

  return {
    putReferenceImage: (input: ImageToStore) =>
      putImage("references", input),
    async getReferenceImageBytes(
      reference: StoredReference,
    ): Promise<ImageBytes> {
      if (
        !validPathname(reference.pathname) ||
        !Number.isSafeInteger(reference.byteSize) ||
        reference.byteSize <= 0 ||
        reference.byteSize > MAX_REFERENCE_IMAGE_BYTES ||
        !SUPPORTED_IMAGE_TYPES.has(reference.mimeType)
      ) {
        throw unavailableError();
      }
      const result = await dependencies.getBlob(reference.pathname, {
        access: "public",
        token: requiredToken(dependencies.token),
        useCache: false,
      });
      if (
        !result ||
        result.statusCode !== 200 ||
        result.blob.pathname !== reference.pathname ||
        normalizeMimeType(result.blob.contentType) !== reference.mimeType ||
        result.blob.size !== reference.byteSize
      ) {
        throw unavailableError();
      }
      const bytes = new Uint8Array(
        await new Response(result.stream).arrayBuffer(),
      );
      if (bytes.byteLength !== reference.byteSize) {
        throw unavailableError();
      }
      validateImage(bytes, reference.mimeType, unavailableError);
      return { bytes, mimeType: reference.mimeType };
    },
    deleteReferenceImage: deleteImage,
    putGeneratedImage: (input: ImageToStore) =>
      putImage("generated", input),
    deleteGeneratedImage: deleteImage,
  };
}

export function validateImage(
  bytes: Uint8Array,
  mimeType: string,
  errorFactory: () => Error = () =>
    new ImageStorageError("Uploaded image is invalid."),
  maxBytes = MAX_REFERENCE_IMAGE_BYTES,
) {
  if (!bytes.byteLength) {
    throw new ImageStorageError("Uploaded image is empty.");
  }
  if (bytes.byteLength > maxBytes) {
    throw new ImageStorageError(
      `Uploaded image must be ${maxBytes / 1_000_000} MB or smaller.`,
    );
  }
  if (!SUPPORTED_IMAGE_TYPES.has(normalizeMimeType(mimeType))) {
    throw unsupportedTypeError();
  }
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) throw errorFactory();
}

export {
  MAX_GENERATED_IMAGE_BYTES,
  MAX_REFERENCE_IMAGE_BYTES,
  SUPPORTED_IMAGE_TYPES,
};

function normalizeMimeType(value: string) {
  return value.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US") ?? "";
}

function requiredToken(value: string | undefined) {
  const token = value?.trim();
  if (!token) {
    throw new ImageStorageError(
      "BLOB_READ_WRITE_TOKEN is not configured.",
    );
  }
  return token;
}

function safeFilename(filename: string, extension: string) {
  const withoutExtension = filename.replace(/\.[^.]*$/, "");
  const basename = withoutExtension
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${basename || "image"}.${extension}`;
}

function validPathname(value: string) {
  return (
    Boolean(value) &&
    !value.startsWith("/") &&
    !value.includes("..") &&
    (value.startsWith("references/") || value.startsWith("generated/"))
  );
}

function unsupportedTypeError() {
  return new ImageStorageError(
    "Uploaded image must be a PNG, JPEG, or WebP file.",
  );
}

function unavailableError() {
  return new ImageStorageError(
    "One or more visual references are unavailable.",
  );
}
