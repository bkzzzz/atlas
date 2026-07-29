import assert from "node:assert/strict";
import test from "node:test";
import {
  createReferenceEmbeddingIndex,
  REFERENCE_EMBEDDING_DIMENSIONS,
  type ReferenceFamily,
  type ReferenceFamilyIndex,
} from "../src/lib/reference-family";
import { createReferenceRetrievalHandler } from "../src/lib/reference-retrieval-handler";

test("reference retrieval rejects malformed queries before index or embedding work", async () => {
  let loadCalls = 0;
  let embeddingCalls = 0;
  const handler = createReferenceRetrievalHandler({
    loadIndexes: async () => {
      loadCalls += 1;
      throw new Error("must not load");
    },
    loadFamilyIndex: async () => {
      throw new Error("must not load");
    },
    embedQuery: async () => {
      embeddingCalls += 1;
      throw new Error("must not embed");
    },
  });

  const malformed = await handler(
    new Request("http://localhost/api/references/retrieve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: {
          projectBrief: "A fantasy game",
          assetRequest: "",
          assetType: "NOT_AN_ASSET",
        },
      }),
    }),
  );

  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), {
    error: "Add a valid project brief, asset request, and asset type.",
  });
  assert.equal(loadCalls, 0);
  assert.equal(embeddingCalls, 0);
});

test("semantic retrieval returns only safe family metadata and an ID-based preview URL", async () => {
  const tower = family("kenney-medieval-tower", {
    title: "Isometric Medieval Town · Tower",
    pack: "Isometric Medieval Town",
    category: "environment",
    tags: ["building", "medieval", "tower"],
    representativeImagePath:
      "2D assets/Isometric Medieval Town/PNG/tower.png",
  });
  const families = familyIndex([tower]);
  const handler = createReferenceRetrievalHandler({
    loadIndexes: async () => ({
      families,
      embeddings: createReferenceEmbeddingIndex(families.families, [
        { id: tower.id, vector: unitVector() },
      ]),
    }),
    loadFamilyIndex: async () => families,
    embedQuery: async () => unitVector(),
  });

  const response = await handler(validRequest());
  const body = (await response.json()) as Record<string, unknown>;
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    mode: "semantic",
    results: [
      {
        reference: {
          kind: "kenney-family",
          id: "kenney-medieval-tower",
          title: "Isometric Medieval Town · Tower",
          previewUrl:
            "/api/references/image?id=kenney-medieval-tower",
          pack: "Isometric Medieval Town",
          category: "environment",
          tags: ["building", "medieval", "tower"],
          source: "Kenney",
          author: "Kenney",
          license: "CC0-1.0",
        },
        score: 100,
        matchedFields: [],
      },
    ],
  });
  assert.doesNotMatch(
    serialized,
    /representativeImagePath|memberImagePaths|embeddingText|2D assets/,
  );
});

test("an embedding failure returns safe metadata from the trusted family index", async () => {
  const tower = family("kenney-medieval-tower", {
    title: "Stone Tower",
    category: "buildings",
    tags: ["tower"],
  });
  const families = familyIndex([tower]);
  const handler = createReferenceRetrievalHandler({
    loadIndexes: async () => ({
      families,
      embeddings: createReferenceEmbeddingIndex(families.families, [
        { id: tower.id, vector: unitVector() },
      ]),
    }),
    loadFamilyIndex: async () => families,
    embedQuery: async () => {
      throw new Error("embedding provider unavailable");
    },
  });

  const response = await handler(validRequest());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    mode: "keyword",
    results: [
      {
        reference: {
          kind: "kenney-family",
          id: "kenney-medieval-tower",
          title: "Stone Tower",
          previewUrl:
            "/api/references/image?id=kenney-medieval-tower",
          pack: "Test Pack",
          category: "buildings",
          tags: ["tower"],
          source: "Kenney",
          author: "Kenney",
          license: "CC0-1.0",
        },
        score: 39,
        matchedFields: ["title", "tags"],
      },
    ],
  });
});

test("an unavailable trusted family index fails without returning legacy references", async () => {
  const handler = createReferenceRetrievalHandler({
    loadIndexes: async () => {
      throw new Error("embedding index missing");
    },
    loadFamilyIndex: async () => {
      throw new Error("family index missing");
    },
    embedQuery: async () => unitVector(),
  });

  const response = await handler(validRequest());

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "The reference library is temporarily unavailable.",
  });
});

function validRequest() {
  return new Request("http://localhost/api/references/retrieve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: {
        projectBrief: "A fantasy defense game",
        assetRequest: "An isometric stone tower",
        assetType: "PROP",
      },
    }),
  });
}

function family(
  id: string,
  overrides: Partial<ReferenceFamily> = {},
): ReferenceFamily {
  return {
    id,
    title: id,
    pack: "Test Pack",
    category: "props",
    tags: ["prop"],
    source: "Kenney",
    author: "Kenney",
    license: "CC0-1.0",
    representativeImagePath: `2D assets/Test Pack/${id}.png`,
    memberImagePaths: [
      `2D assets/Test Pack/${id}.png`,
      `2D assets/Test Pack/${id}-variant.png`,
    ],
    embeddingText: `${id} prop`,
    ...overrides,
  };
}

function familyIndex(
  families: readonly ReferenceFamily[],
): ReferenceFamilyIndex {
  return {
    schemaVersion: 1,
    sourceRoot: "data/reference-source/Kenney",
    selectedPacks: ["Test Pack"],
    families,
  };
}

function unitVector() {
  return Array.from(
    { length: REFERENCE_EMBEDDING_DIMENSIONS },
    (_, index) => (index === 0 ? 1 : 0),
  );
}
