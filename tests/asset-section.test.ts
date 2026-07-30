import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetCard } from "../src/components/asset-section";

test("a visual reference card offers edit and delete without review controls or status styling", () => {
  const html = renderToStaticMarkup(
    React.createElement(AssetCard, {
      asset: {
        id: "reference-1",
        characterId: "character-1",
        name: "Gothic shapes",
        imageUrl: "https://example.com/reference.png",
        blobPathname: "references/reference.png",
        mimeType: "image/png",
        byteSize: 4,
        type: "Mood board",
        provider: "Manual",
        status: "REJECTED",
        prompt: null,
        feedback: "Legacy rejection feedback",
        createdAt: "2026-07-29T10:00:00.000Z",
      },
      onEdit: () => {},
      onDelete: () => {},
    }),
  );

  assert.match(html, /Edit details/);
  assert.match(html, /Delete/);
  assert.doesNotMatch(html, /Approve|Reject|APPROVED|REJECTED|PENDING/);
  assert.doesNotMatch(html, /Legacy rejection feedback/);
  assert.doesNotMatch(html, /emerald-|amber-|rose-400\/20/);
});
