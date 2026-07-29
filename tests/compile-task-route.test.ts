import assert from "node:assert/strict";
import test from "node:test";
import { createCompileTaskHandler } from "../src/lib/static-image-compilation";
import { createGenerationSession } from "../src/lib/generation-session";
import type { CharacterMetadata } from "../src/lib/metadata-builder";
import type { ReferenceFamilyIndex } from "../src/lib/reference-family";
import type { ParsedStaticImageTask } from "../src/lib/task-schema";
import { DEFAULT_STATIC_IMAGE_ASSET_SETTINGS } from "../src/lib/task-mode";

const draft: ParsedStaticImageTask = {
  assetKind: "prop",
  visualSubject: "a compact crystal lantern",
  visualStyle: "pixel art",
  composition: "single centered object",
  dimensions: "1024x1024",
  background: "transparent",
  positiveConstraints: ["blue crystal"],
  negativeConstraints: ["no text"],
  referenceAssets: [],
  assumptions: [],
  assetSettings: DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
  userRequest: "Create a compact crystal lantern.",
  referenceGuidance: [],
};

const metadata: CharacterMetadata = {
  version: "1.0",
  character: {
    id: "character-1",
    name: "Lantern",
    description: "A compact blue crystal lantern.",
    personality: "",
    species: "object",
  },
  memory: null,
  approvedAssets: [],
  rejectedAssets: [],
};

const index: ReferenceFamilyIndex = {
  schemaVersion: 1,
  sourceRoot: "data/reference-source/Kenney",
  selectedPacks: ["Roguelike/RPG pack"],
  families: [
    {
      id: "kenney-roguelike-crystal",
      title: "Crystal Item",
      pack: "Roguelike/RPG pack",
      category: "prop",
      tags: ["crystal", "item"],
      source: "Kenney",
      author: "Kenney",
      license: "CC0-1.0",
      representativeImagePath: "Roguelike RPG Pack/Items/crystal.png",
      memberImagePaths: ["Roguelike RPG Pack/Items/crystal.png"],
      embeddingText: "Crystal item prop",
    },
  ],
};

function request(body: unknown) {
  return new Request(
    "http://localhost/api/characters/character-1/compile-task",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function createHandler(overrides: {
  onIndexLoad?: () => void;
  createGenerationToken?: (prompt: string, background: "transparent" | "opaque") => string;
} = {}) {
  return createCompileTaskHandler({
    loadReferenceFamilyIndex: async () => {
      overrides.onIndexLoad?.();
      return index;
    },
    loadCompilationContext: async () => ({
      ok: true,
      metadata,
      styleSourceMetadata: null,
    }),
    createGenerationToken:
      overrides.createGenerationToken ?? (() => "compiled-token"),
  });
}

test("the endpoint accepts only a validated Draft, reference IDs, and optional style source", async () => {
  let indexLoads = 0;
  const handler = createHandler({ onIndexLoad: () => indexLoads += 1 });
  const response = await handler(
    request({
      draftStyleSpec: draft,
      referenceIds: ["kenney-roguelike-crystal"],
      styleSourceCharacterId: null,
      referenceMetadata: {
        title: "browser-controlled title",
        tags: ["browser-controlled"],
      },
    }),
    "character-1",
  );

  assert.equal(response.status, 400);
  assert.equal(indexLoads, 0);
  assert.match(
    ((await response.json()) as { error: string }).error,
    /valid Draft StyleSpec and one to three reference IDs/i,
  );
});

test("the endpoint rejects duplicates, more than three IDs, and unknown IDs before token creation", async () => {
  let tokenCalls = 0;
  const handler = createHandler({
    createGenerationToken: () => {
      tokenCalls += 1;
      return "must-not-exist";
    },
  });

  const duplicate = await handler(
    request({
      draftStyleSpec: draft,
      referenceIds: [
        "kenney-roguelike-crystal",
        "kenney-roguelike-crystal",
      ],
    }),
    "character-1",
  );
  assert.equal(duplicate.status, 400);
  assert.match(
    ((await duplicate.json()) as { error: string }).error,
    /unique/i,
  );

  const tooMany = await handler(
    request({
      draftStyleSpec: draft,
      referenceIds: ["one", "two", "three", "four"],
    }),
    "character-1",
  );
  assert.equal(tooMany.status, 400);

  const unknown = await handler(
    request({
      draftStyleSpec: draft,
      referenceIds: ["kenney-unknown-family"],
    }),
    "character-1",
  );
  assert.equal(unknown.status, 400);
  assert.match(
    ((await unknown.json()) as { error: string }).error,
    /unknown reference/i,
  );
  assert.equal(tokenCalls, 0);
});

test("a compile response mints an unchanged one-time generation token", async () => {
  const session = createGenerationSession({
    now: () => 1_000,
    createToken: () => "compiled-token",
    ttlMs: 100,
  });
  const handler = createHandler({
    createGenerationToken: session.createGenerationToken,
  });

  const response = await handler(
    request({
      draftStyleSpec: draft,
      referenceIds: ["kenney-roguelike-crystal"],
    }),
    "character-1",
  );
  const body = (await response.json()) as {
    generationToken: string;
    compiledPrompt: string;
    refinementMode: string;
  };

  assert.equal(response.status, 200);
  assert.equal(body.refinementMode, "deterministic-merge");
  assert.deepEqual(session.consumeGenerationToken(body.generationToken), {
    compiledPrompt: body.compiledPrompt,
    background: "transparent",
    expiresAt: 1_100,
  });
  assert.equal(session.consumeGenerationToken(body.generationToken), null);
});
