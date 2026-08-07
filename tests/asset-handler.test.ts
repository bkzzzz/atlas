import assert from "node:assert/strict";
import test from "node:test";
import {
  createAssetCollectionHandler,
  createAssetItemHandler,
} from "../src/lib/asset-handler";

const asset = {
  id: "asset-1",
  characterId: "character-1",
  name: "Gothic shapes",
  imageUrl: "https://example.com/reference.png",
  blobPathname: "references/reference.png",
  mimeType: "image/png",
  byteSize: 4,
  type: "Mood board",
  provider: "Manual",
  status: "PENDING",
  prompt: null,
  feedback: null,
  createdAt: "2026-07-29T10:00:00.000Z",
};

test("asset collection creation and listing remain available without an approval action", async () => {
  const created: unknown[] = [];
  const uploads: unknown[] = [];
  const handler = createAssetCollectionHandler({
    listAssets: async () => [asset],
    findCharacter: async () => ({ id: "character-1" }),
    createAsset: async (data) => {
      created.push(data);
      return asset;
    },
    putReferenceImage: async (input) => {
      uploads.push(input);
      return {
        url: "https://example.com/reference.png",
        pathname: "references/reference.png",
        mimeType: "image/png",
        byteSize: 4,
      };
    },
    deleteReferenceImage: async () => {},
  });

  const form = new FormData();
  form.set("name", " Gothic shapes ");
  form.set("image", new File([Uint8Array.from([1, 2, 3, 4])], "reference.png", {
    type: "image/png",
  }));
  form.set("type", " Mood board ");
  form.set("provider", " Manual ");
  const listed = await handler.GET("character-1");
  const response = await handler.POST(
    new Request("http://localhost/assets", {
      method: "POST",
      body: form,
    }),
    "character-1",
  );

  assert.deepEqual(await listed.json(), [asset]);
  assert.equal(response.status, 201);
  assert.equal(uploads.length, 1);
  assert.deepEqual(uploads[0], {
    bytes: Uint8Array.from([1, 2, 3, 4]),
    filename: "reference.png",
    mimeType: "image/png",
  });
  assert.deepEqual(created, [{
    characterId: "character-1",
    name: "Gothic shapes",
    imageUrl: "https://example.com/reference.png",
    blobPathname: "references/reference.png",
    mimeType: "image/png",
    byteSize: 4,
    type: "Mood board",
    provider: "Manual",
    kind: "REFERENCE",
    status: "PENDING",
  }]);
});

test("asset details can be edited and assets can be deleted, while status is not editable", async () => {
  const updates: unknown[] = [];
  const deleted: string[] = [];
  const deletedBlobs: string[] = [];
  const handler = createAssetItemHandler({
    findAsset: async () => asset,
    updateAsset: async (id, data) => {
      updates.push({ id, data });
      return { ...asset, ...data };
    },
    deleteAsset: async (id) => {
      deleted.push(id);
    },
    deleteReferenceImage: async (pathname) => {
      deletedBlobs.push(pathname);
    },
  });

  const updated = await handler.PATCH(
    new Request("http://localhost/assets/asset-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: " Updated ", prompt: " angular lines " }),
    }),
    "asset-1",
  );
  const statusUpdate = await handler.PATCH(
    new Request("http://localhost/assets/asset-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED" }),
    }),
    "asset-1",
  );
  const deletedResponse = await handler.DELETE("asset-1");

  assert.equal(updated.status, 200);
  assert.deepEqual(updates, [{
    id: "asset-1",
    data: { name: "Updated", prompt: "angular lines" },
  }]);
  assert.equal(statusUpdate.status, 400);
  assert.equal(deletedResponse.status, 204);
  assert.deepEqual(deletedBlobs, ["references/reference.png"]);
  assert.deepEqual(deleted, ["asset-1"]);
});

test("generated assets cannot be patched through the legacy reference API", async () => {
  let updated = false;
  const handler = createAssetItemHandler({
    findAsset: async () => ({ ...asset, kind: "GENERATED" }),
    updateAsset: async () => {
      updated = true;
      return asset;
    },
    deleteAsset: async () => {},
    deleteReferenceImage: async () => {},
  });

  const response = await handler.PATCH(
    new Request("http://localhost/assets/generated-asset", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Changed" }),
    }),
    "generated-asset",
  );

  assert.equal(response.status, 404);
  assert.equal(updated, false);
});

test("generated assets cannot be deleted through the legacy reference API", async () => {
  let deleted = false;
  let blobDeleted = false;
  const handler = createAssetItemHandler({
    findAsset: async () => ({ ...asset, kind: "GENERATED" }),
    updateAsset: async () => asset,
    deleteAsset: async () => {
      deleted = true;
    },
    deleteReferenceImage: async () => {
      blobDeleted = true;
    },
  });

  const response = await handler.DELETE("generated-asset");

  assert.equal(response.status, 404);
  assert.equal(deleted, false);
  assert.equal(blobDeleted, false);
});

test("legacy null-kind and explicit reference assets remain mutable", async () => {
  const kinds = [null, "REFERENCE"] as const;
  for (const kind of kinds) {
    const handler = createAssetItemHandler({
      findAsset: async () => ({ ...asset, kind }),
      updateAsset: async (_id, data) => ({ ...asset, ...data }),
      deleteAsset: async () => {},
      deleteReferenceImage: async () => {},
    });
    const response = await handler.PATCH(
      new Request("http://localhost/assets/reference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Allowed" }),
      }),
      "reference",
    );
    assert.equal(response.status, 200);
  }
});
