import assert from "node:assert/strict";
import test from "node:test";
import {
  createGeneratedAssetPersistence,
  GeneratedAssetPersistenceError,
} from "../src/lib/generated-asset-persistence";
import type { PendingGeneration } from "../src/lib/generation-session";
import type { GeneratedImage } from "../src/lib/image-generation-core";

const image: GeneratedImage = {
  imageUrl: "https://blob.example/generated/new.png",
  blobPathname: "generated/new.png",
  mimeType: "image/png",
  byteSize: 5,
  model: "mock-image-model",
  createdAt: "2026-08-06T12:00:00.000Z",
};

const pending: PendingGeneration = {
  compiledPrompt: "trusted compiled prompt",
  background: "transparent",
  referenceAssetIds: ["reference-1"],
  persistence: {
    generationRequestId: "request-1",
    anonymousOwnerKey: "owner-key",
    characterId: "character-1",
    assetName: "Mira — character sprite",
    assetType: "character sprite",
    sourcePrompt: "Create a sprite for Mira.",
    generationSettings: { version: 1, referenceAssetIds: ["reference-1"] },
  },
  expiresAt: 2_000,
};

const storedAsset = {
  id: "asset-1",
  imageUrl: image.imageUrl,
  blobPathname: image.blobPathname ?? null,
  mimeType: image.mimeType ?? null,
  byteSize: image.byteSize ?? null,
  model: image.model,
  createdAt: new Date(image.createdAt),
};

test("persists server-bound generated asset metadata and returns its asset ID", async () => {
  const created: Record<string, unknown>[] = [];
  const persist = createGeneratedAssetPersistence({
    createAsset: async (data) => {
      created.push(data);
      return storedAsset;
    },
    findAssetByRequest: async () => null,
    deleteGeneratedImage: async () => {},
  });

  const result = await persist(image, pending);

  assert.equal(result.assetId, "asset-1");
  assert.deepEqual(created, [{
    characterId: "character-1",
    name: "Mira — character sprite",
    imageUrl: image.imageUrl,
    blobPathname: "generated/new.png",
    mimeType: "image/png",
    byteSize: 5,
    type: "character sprite",
    provider: "OpenAI",
    status: "PENDING",
    prompt: "Create a sprite for Mira.",
    kind: "GENERATED",
    anonymousOwnerKey: "owner-key",
    generationRequestId: "request-1",
    model: "mock-image-model",
    sourcePrompt: "Create a sprite for Mira.",
    compiledPrompt: "trusted compiled prompt",
    generationSettings: { version: 1, referenceAssetIds: ["reference-1"] },
    createdAt: new Date("2026-08-06T12:00:00.000Z"),
  }]);
});

test("deletes the uploaded Blob when database persistence fails", async () => {
  const deleted: string[] = [];
  const persist = createGeneratedAssetPersistence({
    createAsset: async () => { throw new Error("database unavailable"); },
    findAssetByRequest: async () => null,
    deleteGeneratedImage: async (pathname) => { deleted.push(pathname); },
    logError: () => {},
  });

  await assert.rejects(persist(image, pending), GeneratedAssetPersistenceError);
  assert.deepEqual(deleted, ["generated/new.png"]);
});

test("returns the existing asset for a duplicate request and removes the duplicate Blob", async () => {
  const deleted: string[] = [];
  const existing = {
    ...storedAsset,
    id: "asset-existing",
    imageUrl: "https://blob.example/generated/existing.png",
    blobPathname: "generated/existing.png",
  };
  const persist = createGeneratedAssetPersistence({
    createAsset: async () => { throw new Error("unique constraint"); },
    findAssetByRequest: async (requestId, ownerKey) => {
      assert.equal(requestId, "request-1");
      assert.equal(ownerKey, "owner-key");
      return existing;
    },
    deleteGeneratedImage: async (pathname) => { deleted.push(pathname); },
  });

  const result = await persist(image, pending);

  assert.equal(result.assetId, "asset-existing");
  assert.equal(result.imageUrl, existing.imageUrl);
  assert.deepEqual(deleted, ["generated/new.png"]);
});

test("does not delete the canonical Blob after an uncertain committed insert", async () => {
  const deleted: string[] = [];
  const persist = createGeneratedAssetPersistence({
    createAsset: async () => { throw new Error("connection lost after commit"); },
    findAssetByRequest: async () => storedAsset,
    deleteGeneratedImage: async (pathname) => { deleted.push(pathname); },
  });

  const result = await persist(image, pending);

  assert.equal(result.assetId, storedAsset.id);
  assert.deepEqual(deleted, []);
});

test("retains the Blob when insert reconciliation also fails", async () => {
  const deleted: string[] = [];
  const persist = createGeneratedAssetPersistence({
    createAsset: async () => {
      throw new Error("connection lost after possible commit");
    },
    findAssetByRequest: async () => {
      throw new Error("database still unavailable");
    },
    deleteGeneratedImage: async (pathname) => {
      deleted.push(pathname);
    },
    logError: () => {},
  });

  await assert.rejects(persist(image, pending), GeneratedAssetPersistenceError);
  assert.deepEqual(deleted, []);
});
