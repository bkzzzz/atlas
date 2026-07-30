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
  type: "Mood board",
  provider: "Manual",
  status: "PENDING",
  prompt: null,
  feedback: null,
  createdAt: "2026-07-29T10:00:00.000Z",
};

test("asset collection creation and listing remain available without an approval action", async () => {
  const created: unknown[] = [];
  const handler = createAssetCollectionHandler({
    listAssets: async () => [asset],
    findCharacter: async () => ({ id: "character-1" }),
    createAsset: async (data) => {
      created.push(data);
      return asset;
    },
  });

  const listed = await handler.GET("character-1");
  const response = await handler.POST(
    new Request("http://localhost/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: " Gothic shapes ",
        imageUrl: " https://example.com/reference.png ",
        type: " Mood board ",
        provider: " Manual ",
      }),
    }),
    "character-1",
  );

  assert.deepEqual(await listed.json(), [asset]);
  assert.equal(response.status, 201);
  assert.deepEqual(created, [{
    characterId: "character-1",
    name: "Gothic shapes",
    imageUrl: "https://example.com/reference.png",
    type: "Mood board",
    provider: "Manual",
    status: "PENDING",
  }]);
});

test("asset details can be edited and assets can be deleted, while status is not editable", async () => {
  const updates: unknown[] = [];
  const deleted: string[] = [];
  const handler = createAssetItemHandler({
    findAsset: async () => asset,
    updateAsset: async (id, data) => {
      updates.push({ id, data });
      return { ...asset, ...data };
    },
    deleteAsset: async (id) => {
      deleted.push(id);
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
  assert.deepEqual(deleted, ["asset-1"]);
});
