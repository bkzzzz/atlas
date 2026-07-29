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
  rankReferenceFamiliesByKeywords,
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

test("a missing API key ranks only families from the trusted family index", async () => {
  const families = [
    family("kenney-space-pilot", {
      title: "Space Pilot",
      pack: "Space Shooter",
      category: "characters",
      tags: ["pilot", "space"],
    }),
    family("kenney-stone-tower", {
      title: "Stone Tower",
      pack: "Medieval RTS",
      category: "buildings",
      tags: ["medieval", "stone", "tower"],
    }),
  ];
  const outcome = await retrieveReferenceFamiliesWithFallback(query, {
    loadIndexes: async () => {
      return {
        families: index(families),
        embeddings: createReferenceEmbeddingIndex(families, [
          embedding("kenney-space-pilot", [1, 0]),
          embedding("kenney-stone-tower", [0, 1]),
        ]),
      };
    },
    loadFamilyIndex: async () => index(families),
    embedQuery: async () => {
      throw new Error("OPENAI_API_KEY is missing");
    },
  });

  assert.equal(outcome.mode, "keyword");
  assert.deepEqual(
    outcome.results.map(({ family: item }) => item.id),
    ["kenney-stone-tower", "kenney-space-pilot"],
  );
});

test("embedding request failure uses objective trusted-family metadata", async () => {
  const families = [
    family("kenney-tower", {
      title: "Stone Tower",
      category: "buildings",
      tags: ["tower"],
    }),
  ];
  const outcome = await retrieveReferenceFamiliesWithFallback(query, {
    loadIndexes: async () => {
      return {
        families: index(families),
        embeddings: createReferenceEmbeddingIndex(families, [
          embedding("kenney-tower", [1, 0]),
        ]),
      };
    },
    loadFamilyIndex: async () => index(families),
    embedQuery: async () => {
      throw new Error("upstream unavailable");
    },
  });

  assert.equal(outcome.mode, "keyword");
  assert.deepEqual(
    outcome.results.map(({ family: item, matchedFields }) => ({
      id: item.id,
      matchedFields,
    })),
    [
      {
        id: "kenney-tower",
        matchedFields: ["title", "tags"],
      },
    ],
  );
});

test("a missing embedding index loads the trusted family index for keyword fallback", async () => {
  const families = [
    family("kenney-tower", {
      title: "Stone Tower",
      category: "buildings",
      tags: ["tower"],
    }),
  ];
  let familyIndexLoads = 0;
  const outcome = await retrieveReferenceFamiliesWithFallback(query, {
    loadIndexes: async () => {
      throw new Error("ENOENT");
    },
    loadFamilyIndex: async () => {
      familyIndexLoads += 1;
      return index(families);
    },
    embedQuery: async () => vector([1, 0]),
  });

  assert.equal(familyIndexLoads, 1);
  assert.equal(outcome.mode, "keyword");
  assert.deepEqual(
    outcome.results.map(({ family: item }) => item.id),
    ["kenney-tower"],
  );
});

test("keyword ranking uses stable family ID ties and never returns more than six", () => {
  const families = Array.from({ length: 8 }, (_, index) =>
    family(`kenney-${String.fromCharCode(104 - index)}`, {
      title: "Stone Tower",
      category: "buildings",
      tags: ["stone", "tower"],
    }),
  );

  const first = rankReferenceFamiliesByKeywords(index(families), query);
  const second = rankReferenceFamiliesByKeywords(
    index([...families].reverse()),
    query,
  );

  assert.deepEqual(
    first.map(({ family: item }) => item.id),
    ["kenney-a", "kenney-b", "kenney-c", "kenney-d", "kenney-e", "kenney-f"],
  );
  assert.deepEqual(first, second);
});

test("keyword fallback fails when the trusted family index is unavailable", async () => {
  await assert.rejects(
    retrieveReferenceFamiliesWithFallback(query, {
      loadIndexes: async () => {
        throw new Error("embedding index missing");
      },
      loadFamilyIndex: async () => {
        throw new Error("family index missing");
      },
      embedQuery: async () => vector([1, 0]),
    }),
    /family index missing/,
  );
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

function family(
  id: string,
  overrides: Partial<ReferenceFamily> = {},
): ReferenceFamily {
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
    ...overrides,
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
