import type { Uploadable } from "openai";
import type {
  ImageBytes,
  StoredReference,
} from "@/lib/image-storage-core";

const SUPPORTED_MIME_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export type ReferenceAssetRecord = Readonly<{
  id: string;
  name: string;
  imageUrl: string;
  blobPathname: string | null;
  mimeType: string | null;
  byteSize: number | null;
}>;

export type ReferenceAssetUploadResolverDependencies = Readonly<{
  loadAssets: (
    ids: readonly string[],
  ) => Promise<readonly ReferenceAssetRecord[]>;
  getReferenceImageBytes: (
    reference: StoredReference,
  ) => Promise<ImageBytes>;
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
          if (
            !asset.blobPathname ||
            !asset.mimeType ||
            asset.byteSize === null
          ) {
            throw new ReferenceAssetUnavailableError();
          }
          const extension = SUPPORTED_MIME_TYPES.get(asset.mimeType);
          if (!extension) {
            throw new ReferenceAssetUnavailableError();
          }
          const { bytes, mimeType } =
            await dependencies.getReferenceImageBytes({
              pathname: asset.blobPathname,
              mimeType: asset.mimeType,
              byteSize: asset.byteSize,
            });
          if (mimeType !== asset.mimeType) {
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

function safeFilename(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return normalized || "reference";
}
