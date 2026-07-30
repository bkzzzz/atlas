const requiredFields = ["name", "imageUrl", "type", "provider"] as const;
const editableFields = ["name", "type", "provider", "prompt"] as const;

type AssetCollectionDependencies = Readonly<{
  listAssets: (characterId: string) => Promise<unknown[]>;
  findCharacter: (characterId: string) => Promise<unknown | null>;
  createAsset: (data: Record<string, unknown>) => Promise<unknown>;
}>;

type AssetItemDependencies = Readonly<{
  findAsset: (assetId: string) => Promise<unknown | null>;
  updateAsset: (
    assetId: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
  deleteAsset: (assetId: string) => Promise<void>;
}>;

export function createAssetCollectionHandler(
  dependencies: AssetCollectionDependencies,
) {
  return {
    async GET(characterId: string) {
      return Response.json(await dependencies.listAssets(characterId));
    },
    async POST(request: Request, characterId: string) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return invalidCreateResponse();
      }
      if (!isRecord(body)) return invalidCreateResponse();
      if (
        requiredFields.some(
          (field) =>
            typeof body[field] !== "string" || !body[field].trim(),
        )
      ) {
        return invalidCreateResponse();
      }
      const input = body as Record<(typeof requiredFields)[number], string>;
      if (!(await dependencies.findCharacter(characterId))) {
        return Response.json(
          { error: "Character not found." },
          { status: 404 },
        );
      }

      const created = await dependencies.createAsset({
        characterId,
        name: input.name.trim(),
        imageUrl: input.imageUrl.trim(),
        type: input.type.trim(),
        provider: input.provider.trim(),
        // Retained only because the legacy database column is required.
        status: "PENDING",
      });
      return Response.json(created, { status: 201 });
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
      if (!(await dependencies.findAsset(assetId))) {
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
      if (!(await dependencies.findAsset(assetId))) {
        return Response.json({ error: "Asset not found." }, { status: 404 });
      }
      await dependencies.deleteAsset(assetId);
      return new Response(null, { status: 204 });
    },
  };
}

function invalidCreateResponse() {
  return Response.json(
    { error: "Name, image URL, type, and provider are required." },
    { status: 400 },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
