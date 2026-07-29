import assert from "node:assert/strict";
import test from "node:test";
import type { CharacterMetadata } from "../src/lib/metadata-builder";
import type {
  ReferenceFamily,
  ReferenceFamilyIndex,
} from "../src/lib/reference-family";
import {
  compileAndAuthorizeStaticImageTask,
  type StaticImageCompilationDependencies,
} from "../src/lib/static-image-compilation";
import type { ParsedStaticImageTask } from "../src/lib/task-schema";
import { DEFAULT_STATIC_IMAGE_ASSET_SETTINGS } from "../src/lib/task-mode";

const metadata: CharacterMetadata = {
  version: "1.0",
  character: {
    id: "character-1",
    name: "Mira",
    description: "A compact forest scout with a leaf-shaped cloak.",
    personality: "alert and warm",
    species: "human",
  },
  memory: null,
  approvedAssets: [],
  rejectedAssets: [],
};

const draft: ParsedStaticImageTask = {
  assetKind: "character sprite",
  visualSubject: "Mira carrying a short bow",
  visualStyle: "pixel art",
  composition: "strict side view",
  dimensions: "1024x1024",
  background: "transparent",
  positiveConstraints: ["single full-body character"],
  negativeConstraints: ["no text"],
  referenceAssets: [],
  assumptions: [],
  assetSettings: DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
  userRequest: "Create a forest scout sprite.",
  referenceGuidance: [],
};

function family(
  id: string,
  overrides: Partial<ReferenceFamily> = {},
): ReferenceFamily {
  return {
    id,
    title: "Adventurer Walk",
    pack: "Platformer Characters 1",
    category: "character",
    tags: ["adventurer", "walk"],
    source: "Kenney",
    author: "Kenney",
    license: "CC0-1.0",
    representativeImagePath: "Platformer Characters 1/PNG/adventurer.png",
    memberImagePaths: ["Platformer Characters 1/PNG/adventurer.png"],
    embeddingText: "Adventurer walk character",
    ...overrides,
  };
}

const trustedIndex: ReferenceFamilyIndex = {
  schemaVersion: 1,
  sourceRoot: "data/reference-source/Kenney",
  selectedPacks: ["Platformer Characters 1"],
  families: [
    family("kenney-platformer-adventurer"),
    family("kenney-platformer-female", {
      title: "Female Walk",
      tags: ["female", "walk"],
    }),
  ],
};

function dependencies(
  tokenCalls: Array<{ prompt: string; background: string }>,
): StaticImageCompilationDependencies {
  return {
    loadReferenceFamilyIndex: async () => trustedIndex,
    loadCompilationContext: async () => ({
      ok: true,
      metadata,
      styleSourceMetadata: null,
    }),
    createGenerationToken: (prompt, background) => {
      tokenCalls.push({ prompt, background });
      return "generation-token";
    },
  };
}

test("compilation resolves IDs from the trusted index and creates a token without parsing", async () => {
  const tokenCalls: Array<{ prompt: string; background: string }> = [];
  const result = await compileAndAuthorizeStaticImageTask(
    {
      characterId: "character-1",
      draftStyleSpec: draft,
      referenceIds: [
        "kenney-platformer-female",
        "kenney-platformer-adventurer",
      ],
      styleSourceCharacterId: null,
    },
    dependencies(tokenCalls),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.generationToken, "generation-token");
  assert.equal(result.refinementMode, "deterministic-merge");
  assert.deepEqual(
    result.parsedTask.referenceGuidance.map(({ id }) => id),
    ["kenney-platformer-adventurer", "kenney-platformer-female"],
  );
  assert.deepEqual(result.referenceProvenance, [
    {
      id: "kenney-platformer-adventurer",
      pack: "Platformer Characters 1",
      source: "Kenney",
      author: "Kenney",
      license: "CC0-1.0",
    },
    {
      id: "kenney-platformer-female",
      pack: "Platformer Characters 1",
      source: "Kenney",
      author: "Kenney",
      license: "CC0-1.0",
    },
  ]);
  assert.equal(tokenCalls.length, 1);
  assert.equal(tokenCalls[0]?.prompt, result.compiledPrompt);
  assert.equal(tokenCalls[0]?.background, "transparent");
  assert.doesNotMatch(
    result.compiledPrompt,
    /kenney-platformer|Kenney|CC0-1\.0|representativeImagePath/i,
  );
});

test("compilation validates the merge before returning project-context failures and never mints a token", async () => {
  let indexLoads = 0;
  let tokenCalls = 0;
  const result = await compileAndAuthorizeStaticImageTask(
    {
      characterId: "missing-character",
      draftStyleSpec: draft,
      referenceIds: ["kenney-platformer-adventurer"],
      styleSourceCharacterId: null,
    },
    {
      loadReferenceFamilyIndex: async () => {
        indexLoads += 1;
        return trustedIndex;
      },
      loadCompilationContext: async () => ({
        ok: false,
        status: 404,
        error: "Character not found.",
      }),
      createGenerationToken: () => {
        tokenCalls += 1;
        return "must-not-exist";
      },
    },
  );

  assert.deepEqual(result, {
    ok: false,
    status: 404,
    error: "Character not found.",
  });
  assert.equal(indexLoads, 1);
  assert.equal(tokenCalls, 0);
});
