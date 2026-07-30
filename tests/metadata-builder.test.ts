import assert from "node:assert/strict";
import test from "node:test";
import { buildCharacterMetadata } from "../src/lib/metadata-builder";

const character = {
  id: "character-1",
  name: "Mira",
  description: "A careful explorer",
  personality: "Curious",
  species: "Human",
};

test("every attached visual reference is active regardless of its legacy status", () => {
  const metadata = buildCharacterMetadata({
    character,
    memory: null,
    assets: [
      {
        id: "new-reference",
        name: "New reference",
        imageUrl: "https://example.com/new.png",
        type: "Reference",
        provider: "Manual",
        status: "PENDING",
        prompt: null,
        feedback: null,
        createdAt: "2026-07-29T10:00:00.000Z",
      },
      {
        id: "formerly-approved",
        name: "Formerly approved",
        imageUrl: "https://example.com/approved.png",
        type: "Reference",
        provider: "Manual",
        status: "APPROVED",
        prompt: "Angular outlines",
        feedback: null,
        createdAt: "2026-07-28T10:00:00.000Z",
      },
      {
        id: "formerly-rejected",
        name: "Formerly rejected",
        imageUrl: "https://example.com/rejected.png",
        type: "Reference",
        provider: "Manual",
        status: "REJECTED",
        prompt: null,
        feedback: "Legacy feedback",
        createdAt: "2026-07-27T10:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(metadata.visualReferences, [
    {
      id: "new-reference",
      name: "New reference",
      imageUrl: "https://example.com/new.png",
      type: "Reference",
      provider: "Manual",
      prompt: null,
      createdAt: "2026-07-29T10:00:00.000Z",
    },
    {
      id: "formerly-approved",
      name: "Formerly approved",
      imageUrl: "https://example.com/approved.png",
      type: "Reference",
      provider: "Manual",
      prompt: "Angular outlines",
      createdAt: "2026-07-28T10:00:00.000Z",
    },
    {
      id: "formerly-rejected",
      name: "Formerly rejected",
      imageUrl: "https://example.com/rejected.png",
      type: "Reference",
      provider: "Manual",
      prompt: null,
      createdAt: "2026-07-27T10:00:00.000Z",
    },
  ]);
  assert.equal("approvedAssets" in metadata, false);
  assert.equal("rejectedAssets" in metadata, false);
});
