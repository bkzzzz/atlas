import type { GeneratedImage } from "@/lib/image-generation-core";
import type { PendingGeneration } from "@/lib/generation-session";

type PersistedGeneratedAsset = Readonly<{
  id: string;
  imageUrl: string;
  blobPathname: string | null;
  mimeType: string | null;
  byteSize: number | null;
  model: string | null;
  createdAt: Date | string;
}>;

type GeneratedAssetCreateData = Readonly<{
  characterId: string;
  name: string;
  imageUrl: string;
  blobPathname: string;
  mimeType: string;
  byteSize: number;
  type: string;
  provider: "OpenAI";
  status: "PENDING";
  prompt: string;
  kind: "GENERATED";
  anonymousOwnerKey: string;
  generationRequestId: string;
  model: string;
  sourcePrompt: string;
  compiledPrompt: string;
  generationSettings: NonNullable<
    PendingGeneration["persistence"]
  >["generationSettings"];
  createdAt: Date;
}>;

type GeneratedAssetPersistenceDependencies = Readonly<{
  createAsset: (
    data: GeneratedAssetCreateData,
  ) => Promise<PersistedGeneratedAsset>;
  findAssetByRequest: (
    generationRequestId: string,
    anonymousOwnerKey: string,
  ) => Promise<PersistedGeneratedAsset | null>;
  deleteGeneratedImage: (pathname: string) => Promise<void>;
  logError?: (message: string, details: Record<string, unknown>) => void;
}>;

export class GeneratedAssetPersistenceError extends Error {
  constructor() {
    super("Generated image could not be saved to the workspace.");
  }
}

export function createGeneratedAssetPersistence(
  dependencies: GeneratedAssetPersistenceDependencies,
) {
  const logError = dependencies.logError ?? console.error;

  return async function persistGeneratedAsset(
    image: GeneratedImage,
    pending: PendingGeneration,
  ): Promise<GeneratedImage> {
    const metadata = pending.persistence;
    if (
      !metadata ||
      !image.blobPathname ||
      !image.mimeType ||
      !image.byteSize
    ) {
      if (image.blobPathname) {
        await compensateBlob(image.blobPathname, "missing_metadata");
      }
      throw new GeneratedAssetPersistenceError();
    }

    try {
      const asset = await dependencies.createAsset({
        characterId: metadata.characterId,
        name: metadata.assetName,
        imageUrl: image.imageUrl,
        blobPathname: image.blobPathname,
        mimeType: image.mimeType,
        byteSize: image.byteSize,
        type: metadata.assetType,
        provider: "OpenAI",
        status: "PENDING",
        prompt: metadata.sourcePrompt,
        kind: "GENERATED",
        anonymousOwnerKey: metadata.anonymousOwnerKey,
        generationRequestId: metadata.generationRequestId,
        model: image.model,
        sourcePrompt: metadata.sourcePrompt,
        compiledPrompt: pending.compiledPrompt,
        generationSettings: metadata.generationSettings,
        createdAt: new Date(image.createdAt),
      });
      return imageFromAsset(image, asset);
    } catch (cause) {
      let existing: PersistedGeneratedAsset | null = null;
      let reconciliationFailed = false;
      try {
        existing = await dependencies.findAssetByRequest(
          metadata.generationRequestId,
          metadata.anonymousOwnerKey,
        );
      } catch {
        reconciliationFailed = true;
      }

      if (existing) {
        // A connection failure may occur after PostgreSQL committed this exact
        // row. Delete only a separately uploaded duplicate, never the Blob now
        // referenced by the canonical asset.
        if (existing.blobPathname !== image.blobPathname) {
          await compensateBlob(image.blobPathname, "duplicate_request");
        }
        return imageFromAsset(image, existing);
      }

      if (!reconciliationFailed) {
        await compensateBlob(image.blobPathname, "database_failure");
      }

      logError("Generated asset database persistence failed", {
        generationRequestId: metadata.generationRequestId,
        blobPathname: image.blobPathname,
        blobRetained: reconciliationFailed,
        cause: cause instanceof Error ? cause.name : "unknown",
      });
      throw new GeneratedAssetPersistenceError();
    }
  };

  async function compensateBlob(pathname: string, reason: string) {
    try {
      await dependencies.deleteGeneratedImage(pathname);
    } catch (cause) {
      logError("Generated asset Blob compensation failed", {
        pathname,
        reason,
        cause: cause instanceof Error ? cause.name : "unknown",
      });
    }
  }
}

function imageFromAsset(
  fallback: GeneratedImage,
  asset: PersistedGeneratedAsset,
): GeneratedImage {
  return {
    ...fallback,
    assetId: asset.id,
    imageUrl: asset.imageUrl,
    blobPathname: asset.blobPathname ?? undefined,
    mimeType: asset.mimeType ?? undefined,
    byteSize: asset.byteSize ?? undefined,
    model: asset.model ?? fallback.model,
    createdAt:
      typeof asset.createdAt === "string"
        ? asset.createdAt
        : asset.createdAt.toISOString(),
  };
}
