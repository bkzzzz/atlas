import {
  type ImageToStore,
  type StoredImage,
  validateImage,
} from "@/lib/image-storage-core";

const requiredFields = ["name", "type", "provider"] as const;
const editableFields = ["name", "type", "provider", "prompt"] as const;

type AssetCollectionDependencies = Readonly<{
  listAssets: (characterId: string) => Promise<unknown[]>;
  findCharacter: (characterId: string) => Promise<unknown | null>;
  createAsset: (data: Record<string, unknown>) => Promise<unknown>;
  putReferenceImage: (input: ImageToStore) => Promise<StoredImage>;
  deleteReferenceImage: (pathname: string) => Promise<void>;
}>;

type ReferenceMutationAsset = Readonly<{
  blobPathname?: string | null;
  kind?: string | null;
}>;

type AssetItemDependencies = Readonly<{
  findAsset: (
    assetId: string,
  ) => Promise<ReferenceMutationAsset | null>;
  updateAsset: (
    assetId: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
  deleteAsset: (assetId: string) => Promise<void>;
  deleteReferenceImage: (pathname: string) => Promise<void>;
}>;

export function createAssetCollectionHandler(
  dependencies: AssetCollectionDependencies,
) {
  return {
    async GET(characterId: string) {
      return Response.json(await dependencies.listAssets(characterId));
    },
    async POST(request: Request, characterId: string) {
      let body: FormData;
      try {
        body = await request.formData();
      } catch {
        return invalidCreateResponse();
      }
      const image = body.get("image");
      if (
        requiredFields.some(
          (field) =>
            typeof body.get(field) !== "string" ||
            !(body.get(field) as string).trim(),
        ) ||
        !(image instanceof File)
      ) {
        return invalidCreateResponse();
      }
      const input = Object.fromEntries(
        requiredFields.map((field) => [field, body.get(field) as string]),
      ) as Record<(typeof requiredFields)[number], string>;
      const bytes = new Uint8Array(await image.arrayBuffer());
      try {
        validateImage(bytes, image.type);
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Uploaded image is invalid.",
          },
          { status: 400 },
        );
      }
      if (!(await dependencies.findCharacter(characterId))) {
        return Response.json(
          { error: "Character not found." },
          { status: 404 },
        );
      }

      let stored: StoredImage | undefined;
      try {
        stored = await dependencies.putReferenceImage({
          bytes,
          filename: image.name,
          mimeType: image.type,
        });
        const created = await dependencies.createAsset({
          characterId,
          name: input.name.trim(),
          imageUrl: stored.url,
          blobPathname: stored.pathname,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          type: input.type.trim(),
          provider: input.provider.trim(),
          kind: "REFERENCE",
          // Retained only because the legacy database column is required.
          status: "PENDING",
        });
        return Response.json(created, { status: 201 });
      } catch {
        if (stored) {
          try {
            await dependencies.deleteReferenceImage(stored.pathname);
          } catch {
            // The original write failure remains the actionable error.
          }
        }
        return Response.json(
          { error: "Could not store the visual reference." },
          { status: 503 },
        );
      }
    },
  };
}

export function createAssetItemHandler(
  dependencies: AssetItemDependencies,
) {
  return {
    async PATCH(request: Request, assetId: string) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { error: "Request body must be an object." },
          { status: 400 },
        );
      }
      if (!isRecord(body)) {
        return Response.json(
          { error: "Request body must be an object." },
          { status: 400 },
        );
      }
      const data = Object.fromEntries(
        editableFields
          .filter((field) => field in body)
          .map((field) => [field, body[field]]),
      );
      if (!Object.keys(data).length) {
        return Response.json(
          { error: "Provide at least one editable asset field." },
          { status: 400 },
        );
      }
      for (const field of ["name", "type", "provider"] as const) {
        if (
          field in data &&
          (typeof data[field] !== "string" || !data[field].trim())
        ) {
          return Response.json(
            { error: `${field} must be a non-empty string.` },
            { status: 400 },
          );
        }
      }
      if (
        "prompt" in data &&
        data.prompt !== null &&
        typeof data.prompt !== "string"
      ) {
        return Response.json(
          { error: "prompt must be a string or null." },
          { status: 400 },
        );
      }
      const asset = await dependencies.findAsset(assetId);
      if (!isReferenceAsset(asset)) {
        return Response.json({ error: "Asset not found." }, { status: 404 });
      }
      const normalized = Object.fromEntries(
        Object.entries(data).map(([field, value]) => [
          field,
          typeof value === "string" ? value.trim() : value,
        ]),
      );
      return Response.json(
        await dependencies.updateAsset(assetId, normalized),
      );
    },
    async DELETE(assetId: string) {
      const asset = await dependencies.findAsset(assetId);
      if (!isReferenceAsset(asset)) {
        return Response.json({ error: "Asset not found." }, { status: 404 });
      }
      if (asset.blobPathname) {
        await dependencies.deleteReferenceImage(asset.blobPathname);
      }
      await dependencies.deleteAsset(assetId);
      return new Response(null, { status: 204 });
    },
  };
}

function isReferenceAsset(
  asset: ReferenceMutationAsset | null,
): asset is ReferenceMutationAsset {
  return asset !== null && (asset.kind == null || asset.kind === "REFERENCE");
}

function invalidCreateResponse() {
  return Response.json(
    { error: "Name, image file, type, and provider are required." },
    { status: 400 },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
