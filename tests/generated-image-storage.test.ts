import assert from "node:assert/strict";
import test from "node:test";
import { persistGeneratedImage } from "../src/lib/generated-image-storage";

test("generated base64 bytes are stored and replaced with a durable Blob URL", async () => {
  const received: unknown[] = [];
  const persisted = await persistGeneratedImage(
    {
      imageUrl: "data:image/png;base64,aGVsbG8=",
      model: "mock-image-model",
      createdAt: "2026-07-30T12:00:00.000Z",
    },
    async (input) => {
      received.push({
        ...input,
        bytes: [...input.bytes],
      });
      return {
        url: "https://store.public.blob.vercel-storage.com/generated/output.png",
        pathname: "generated/output.png",
        mimeType: "image/png",
        byteSize: input.bytes.byteLength,
      };
    },
  );

  assert.deepEqual(received, [
    {
      bytes: [104, 101, 108, 108, 111],
      filename: "generated.png",
      mimeType: "image/png",
    },
  ]);
  assert.equal(
    persisted.imageUrl,
    "https://store.public.blob.vercel-storage.com/generated/output.png",
  );
  assert.equal(persisted.blobPathname, "generated/output.png");
});
