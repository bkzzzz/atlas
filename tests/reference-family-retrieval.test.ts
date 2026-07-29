import assert from "node:assert/strict";
import test from "node:test";
import {
  createReferenceEmbeddingIndex,
  fingerprintReferenceFamilies,
  REFERENCE_EMBEDDING_DIMENSIONS,
  type ReferenceFamily,
  type ReferenceFamilyIndex,
} from "../src/lib/reference-family";
import {
  cosineSimilarity,
  rankReferenceFamilies,
  retrieveReferenceFamiliesWithFallback,
} from "../src/lib/reference-family-retrieval";
import type { ReferenceQuery } from "../src/lib/reference-retrieval";

const query: ReferenceQuery = {
  projectBrief: "A fantasy defense game",
  assetRequest: "A stone tower icon",
  assetType: "ICON",
};

test("cosine similarity ranks the closest families", () => {
  const families = [family("kenney-c"), family("kenney-a"), family("kenney-b")];
  const familyIndex = index(families);
  const embeddings = createReferenceEmbeddingIndex(families, [
    embedding("kenney-a", [1, 0]),
    embedding("kenney-b", [0.5, 0.5]),
    embedding("kenney-c", [0, 1]),
  ]);

  const ranked = rankReferenceFamilies(
    familyIndex,
    embeddings,
    vector([1, 0]),
  );

  assert.deepEqual(ranked.map(({ family: item }) => item.id), [
    "kenney-a",
    "kenney-b",
    "kenney-c",
  ]);
  assert.ok(ranked[0].similarity > ranked[1].similarity);
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
});

test("equal cosine scores use deterministic family ID ordering and Top 6", () => {
  const families = Array.from({ length: 8 }, (_, index) =>
    family(`kenney-${String.fromCharCode(104 - index)}`),
  );
  const embeddings = createReferenceEmbeddingIndex(
    families,
    families.map(({ id }) => embedding(id, [1, 0])),
  );

  const first = rankReferenceFamilies(index(families), embeddings, vector([1, 0]));
  const second = rankReferenceFamilies(index([...families].reverse()), embeddings, vector([1, 0]));

  assert.equal(first.length, 6);
  assert.deepEqual(
    first.map(({ family: item }) => item.id),
    ["kenney-a", "kenney-b", "kenney-c", "kenney-d", "kenney-e", "kenney-f"],
  );
  assert.deepEqual(first, second);
});

test("a missing API key uses the supplied deterministic keyword fallback", async () => {
  const fallback = [{ id: "fallback-reference" }];
  const outcome = await retrieveReferenceFamiliesWithFallback(query, {
    loadIndexes: async () => {
      const families = [family("kenney-a")];
      return {
        families: index(families),
        embeddings: createReferenceEmbeddingIndex(families, [
          embedding("kenney-a", [1, 0]),
        ]),
      };
    },
    embedQuery: async () => {
      throw new Error("OPENAI_API_KEY is missing");
    },
    keywordFallback: () => fallback,
  });

  assert.deepEqual(outcome, { mode: "keyword", results: fallback });
});

test("embedding request failure uses keyword fallback", async () => {
  const outcome = await retrieveReferenceFamiliesWithFallback(query, {
    loadIndexes: async () => {
      const families = [family("kenney-a")];
      return {
        families: index(families),
        embeddings: createReferenceEmbeddingIndex(families, [
          embedding("kenney-a", [1, 0]),
        ]),
      };
    },
    embedQuery: async () => {
      throw new Error("upstream unavailable");
    },
    keywordFallback: () => ["keyword"],
  });

  assert.deepEqual(outcome, { mode: "keyword", results: ["keyword"] });
});

test("a missing embedding index uses keyword fallback", async () => {
  let fallbackCalls = 0;
  const outcome = await retrieveReferenceFamiliesWithFallback(query, {
    loadIndexes: async () => {
      throw new Error("ENOENT");
    },
    embedQuery: async () => vector([1, 0]),
    keywordFallback: () => {
      fallbackCalls += 1;
      return ["keyword"];
    },
  });

  assert.equal(fallbackCalls, 1);
  assert.deepEqual(outcome, { mode: "keyword", results: ["keyword"] });
});

test("family fingerprints and embedding index output are deterministic", () => {
  const families = [family("kenney-b"), family("kenney-a")];
  const first = createReferenceEmbeddingIndex(families, [
    embedding("kenney-b", [0, 1]),
    embedding("kenney-a", [1, 0]),
  ]);
  const second = createReferenceEmbeddingIndex([...families].reverse(), [
    embedding("kenney-a", [1, 0]),
    embedding("kenney-b", [0, 1]),
  ]);

  assert.equal(fingerprintReferenceFamilies(families), first.familyFingerprint);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

function family(id: string): ReferenceFamily {
  return {
    id,
    title: id,
    pack: "Test Pack",
    category: "icons",
    tags: ["icon"],
    source: "Kenney",
    author: "Kenney",
    license: "CC0-1.0",
    representativeImagePath: `Icons/${id}.png`,
    memberImagePaths: [`Icons/${id}.png`, `Icons/${id}-variant.png`],
    embeddingText: `${id} icon`,
  };
}

function index(families: readonly ReferenceFamily[]): ReferenceFamilyIndex {
  return {
    schemaVersion: 1,
    sourceRoot: "data/reference-source/Kenney",
    selectedPacks: ["Test Pack"],
    families,
  };
}

function embedding(id: string, values: readonly number[]) {
  return { id, vector: vector(values) };
}

function vector(values: readonly number[]) {
  return Array.from(
    { length: REFERENCE_EMBEDDING_DIMENSIONS },
    (_, index) => values[index] ?? 0,
  );
}
