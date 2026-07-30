import type { Uploadable } from "openai";

const MAX_REFERENCE_BYTES = 25_000_000;
const SUPPORTED_MIME_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export type ReferenceAssetRecord = Readonly<{
  id: string;
  name: string;
  imageUrl: string;
}>;

export type ReferenceAssetUploadResolverDependencies = Readonly<{
  loadAssets: (
    ids: readonly string[],
  ) => Promise<readonly ReferenceAssetRecord[]>;
  fetchImage: (url: string) => Promise<Response>;
  createUpload: (
    bytes: Uint8Array,
    filename: string,
    mimeType: string,
  ) => Promise<Uploadable>;
}>;

export class ReferenceAssetUnavailableError extends Error {
  constructor() {
    super("One or more visual references are unavailable.");
  }
}

export function createReferenceAssetUploadResolver(
  dependencies: ReferenceAssetUploadResolverDependencies,
) {
  return async function resolveReferenceAssetUploads(
    ids: readonly string[],
  ): Promise<readonly Uploadable[]> {
    if (
      ids.some((id) => !id.trim()) ||
      new Set(ids).size !== ids.length
    ) {
      throw new ReferenceAssetUnavailableError();
    }
    if (!ids.length) return [];

    try {
      const records = await dependencies.loadAssets(ids);
      const byId = new Map(records.map((asset) => [asset.id, asset]));
      const ordered = ids.map((id) => {
        const asset = byId.get(id);
        if (!asset) throw new ReferenceAssetUnavailableError();
        return asset;
      });

      return await Promise.all(
        ordered.map(async (asset) => {
          validateReferenceUrl(asset.imageUrl);
          const response = await dependencies.fetchImage(asset.imageUrl);
          const mimeType = response.headers
            .get("content-type")
            ?.split(";", 1)[0]
            .trim()
            .toLocaleLowerCase("en-US");
          const extension = mimeType
            ? SUPPORTED_MIME_TYPES.get(mimeType)
            : undefined;
          const contentLength = Number(
            response.headers.get("content-length") ?? 0,
          );
          if (
            !response.ok ||
            !mimeType ||
            !extension ||
            (contentLength > 0 && contentLength > MAX_REFERENCE_BYTES)
          ) {
            throw new ReferenceAssetUnavailableError();
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (!bytes.length || bytes.byteLength > MAX_REFERENCE_BYTES) {
            throw new ReferenceAssetUnavailableError();
          }
          return dependencies.createUpload(
            bytes,
            `${safeFilename(asset.id)}.${extension}`,
            mimeType,
          );
        }),
      );
    } catch {
      throw new ReferenceAssetUnavailableError();
    }
  };
}

function validateReferenceUrl(value: string) {
  const url = new URL(value);
  if (url.protocol === "data:") return;
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    unsafeHostname(url.hostname)
  ) {
    throw new ReferenceAssetUnavailableError();
  }
}

function unsafeHostname(hostname: string) {
  const normalized = hostname.toLocaleLowerCase("en-US");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized === "::1" ||
    normalized.startsWith("fe80:")
  ) {
    return true;
  }
  const octets = normalized.split(".").map(Number);
  if (
    octets.length === 4 &&
    octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
  ) {
    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  }
  return false;
}

function safeFilename(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return normalized || "reference";
}
