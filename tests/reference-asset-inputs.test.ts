import assert from "node:assert/strict";
import test from "node:test";
import type { Uploadable } from "openai";
import { createReferenceAssetUploadResolver } from "../src/lib/reference-asset-inputs";

test("all current assets resolve to files and deleted assets disappear from subsequent resolutions", async () => {
  let assets = [
    {
      id: "reference-pending",
      name: "Pending legacy record",
      imageUrl: "https://example.com/pending.png",
    },
    {
      id: "reference-rejected",
      name: "Rejected legacy record",
      imageUrl: "https://example.com/rejected.webp",
    },
  ];
  const createdUploads: Array<{
    bytes: number[];
    filename: string;
    mimeType: string;
  }> = [];
  const resolver = createReferenceAssetUploadResolver({
    loadAssets: async (ids) => assets.filter(({ id }) => ids.includes(id)),
    fetchImage: async (url) =>
      new Response(
        Uint8Array.from(url.endsWith(".webp") ? [4, 5, 6] : [1, 2, 3]),
        {
          headers: {
            "Content-Type": url.endsWith(".webp")
              ? "image/webp"
              : "image/png",
          },
        },
      ),
    createUpload: async (bytes, filename, mimeType) => {
      createdUploads.push({
        bytes: [...bytes],
        filename,
        mimeType,
      });
      return { name: filename } as unknown as Uploadable;
    },
  });

  const initial = await resolver([
    "reference-pending",
    "reference-rejected",
  ]);
  assert.deepEqual(
    initial.map((upload) => (upload as { name: string }).name),
    ["reference-pending.png", "reference-rejected.webp"],
  );

  assets = assets.filter(({ id }) => id !== "reference-rejected");
  const afterDelete = await resolver(["reference-pending"]);
  assert.deepEqual(
    afterDelete.map((upload) => (upload as { name: string }).name),
    ["reference-pending.png"],
  );
  await assert.rejects(
    resolver(["reference-pending", "reference-rejected"]),
    /unavailable/i,
  );

  assert.deepEqual(createdUploads[0], {
    bytes: [1, 2, 3],
    filename: "reference-pending.png",
    mimeType: "image/png",
  });
});
