import assert from "node:assert/strict";
import test from "node:test";
import { createImageStorage } from "../src/lib/image-storage-core";

const pngBytes = Uint8Array.from([137, 80, 78, 71]);

test("reference and generated images use the Blob storage abstraction", async () => {
  const puts: unknown[] = [];
  const deletes: unknown[] = [];
  const storage = createImageStorage({
    token: "blob-test-token",
    putBlob: async (pathname, body, options) => {
      puts.push({ pathname, body: [...body], options });
      return {
        url: `https://store.public.blob.vercel-storage.com/${pathname}`,
        pathname,
        contentType: options.contentType,
      };
    },
    getBlob: async (pathname) => ({
      statusCode: 200,
      stream: new Blob([pngBytes]).stream(),
      blob: {
        pathname,
        url: `https://store.public.blob.vercel-storage.com/${pathname}`,
        contentType: "image/png",
        size: pngBytes.byteLength,
      },
    }),
    deleteBlob: async (pathname, options) => {
      deletes.push({ pathname, options });
    },
    createId: () => "stable-id",
  });

  const reference = await storage.putReferenceImage({
    bytes: pngBytes,
    filename: "Knight Front.png",
    mimeType: "image/png",
  });
  assert.deepEqual(reference, {
    url:
      "https://store.public.blob.vercel-storage.com/references/stable-id-knight-front.png",
    pathname: "references/stable-id-knight-front.png",
    mimeType: "image/png",
    byteSize: 4,
  });
  assert.deepEqual(puts[0], {
    pathname: "references/stable-id-knight-front.png",
    body: [...pngBytes],
    options: {
      access: "public",
      addRandomSuffix: false,
      contentType: "image/png",
      token: "blob-test-token",
    },
  });

  const loaded = await storage.getReferenceImageBytes({
    pathname: reference.pathname,
    mimeType: reference.mimeType,
    byteSize: reference.byteSize,
  });
  assert.deepEqual([...loaded.bytes], [...pngBytes]);
  assert.equal(loaded.mimeType, "image/png");

  const generated = await storage.putGeneratedImage({
    bytes: pngBytes,
    filename: "generated.png",
    mimeType: "image/png",
  });
  assert.equal(generated.pathname, "generated/stable-id-generated.png");

  await storage.deleteReferenceImage(reference.pathname);
  await storage.deleteGeneratedImage(generated.pathname);
  assert.deepEqual(deletes, [
    {
      pathname: "references/stable-id-knight-front.png",
      options: { token: "blob-test-token" },
    },
    {
      pathname: "generated/stable-id-generated.png",
      options: { token: "blob-test-token" },
    },
  ]);
});

test("missing and invalid Blob objects fail closed", async () => {
  const missing = createImageStorage({
    token: "blob-test-token",
    putBlob: async () => {
      throw new Error("not used");
    },
    getBlob: async () => null,
    deleteBlob: async () => {},
  });
  await assert.rejects(
    missing.getReferenceImageBytes({
      pathname: "references/missing.png",
      mimeType: "image/png",
      byteSize: 4,
    }),
    /unavailable/i,
  );

  await assert.rejects(
    missing.putReferenceImage({
      bytes: new Uint8Array(),
      filename: "empty.png",
      mimeType: "image/png",
    }),
    /empty/i,
  );
  await assert.rejects(
    missing.putReferenceImage({
      bytes: pngBytes,
      filename: "unsafe.svg",
      mimeType: "image/svg+xml",
    }),
    /PNG, JPEG, or WebP/i,
  );
  await assert.rejects(
    missing.putReferenceImage({
      bytes: new Uint8Array(4_000_001),
      filename: "too-large.png",
      mimeType: "image/png",
    }),
    /4 MB or smaller/i,
  );
});

test("deleting an already-missing Blob remains safe", async () => {
  const missingError = new Error("missing");
  let attempts = 0;
  const storage = createImageStorage({
    token: "blob-test-token",
    putBlob: async () => {
      throw new Error("not used");
    },
    getBlob: async () => null,
    deleteBlob: async () => {
      attempts += 1;
      throw missingError;
    },
    isNotFoundError: (error) => error === missingError,
  });

  await storage.deleteReferenceImage("references/already-gone.png");
  assert.equal(attempts, 1);
});
