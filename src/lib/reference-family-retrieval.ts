import {
  fingerprintReferenceFamilies,
  REFERENCE_EMBEDDING_DIMENSIONS,
  REFERENCE_EMBEDDING_MODEL,
  type ReferenceEmbeddingIndex,
  type ReferenceFamily,
  type ReferenceFamilyIndex,
} from "@/lib/reference-family";
import type { ReferenceQuery } from "@/lib/reference-retrieval";

export type RankedReferenceFamily = Readonly<{
  family: ReferenceFamily;
  similarity: number;
}>;

export type KeywordRankedReferenceFamily = Readonly<{
  family: ReferenceFamily;
  score: number;
  matchedFields: readonly ("title" | "pack" | "category" | "tags")[];
}>;

export type ReferenceRetrievalOutcome =
  | Readonly<{ mode: "semantic"; results: readonly RankedReferenceFamily[] }>
  | Readonly<{
      mode: "keyword";
      results: readonly KeywordRankedReferenceFamily[];
    }>;

export type SemanticRetrievalDependencies = Readonly<{
  loadIndexes: () => Promise<{
    families: ReferenceFamilyIndex;
    embeddings: ReferenceEmbeddingIndex;
  }>;
  loadFamilyIndex: () => Promise<ReferenceFamilyIndex>;
  embedQuery: (text: string) => Promise<readonly number[]>;
}>;

export function compileReferenceQueryText(query: ReferenceQuery) {
  const settings = query.settings;
  return [
    `Project brief: ${query.projectBrief.trim()}`,
    `Asset request: ${query.assetRequest.trim()}`,
    `Asset type: ${query.assetType}`,
    settings?.visualStyle ? `Visual style: ${settings.visualStyle}` : "",
    settings?.viewAngle ? `View: ${settings.viewAngle}` : "",
    settings?.background ? `Background: ${settings.background}` : "",
    settings?.pixelDetail ? `Pixel detail: ${settings.pixelDetail}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function retrieveReferenceFamiliesWithFallback(
  query: ReferenceQuery,
  dependencies: SemanticRetrievalDependencies,
  topK = 6,
): Promise<ReferenceRetrievalOutcome> {
  let trustedFamilies: ReferenceFamilyIndex | undefined;
  try {
    const { families, embeddings } = await dependencies.loadIndexes();
    trustedFamilies = families;
    const queryVector = await dependencies.embedQuery(
      compileReferenceQueryText(query),
    );
    return {
      mode: "semantic",
      results: rankReferenceFamilies(families, embeddings, queryVector, topK),
    };
  } catch {
    const families =
      trustedFamilies ?? (await dependencies.loadFamilyIndex());
    return {
      mode: "keyword",
      results: rankReferenceFamiliesByKeywords(families, query, topK),
    };
  }
}

export function rankReferenceFamiliesByKeywords(
  familyIndex: ReferenceFamilyIndex,
  query: ReferenceQuery,
  topK = 6,
): KeywordRankedReferenceFamily[] {
  const queryWeights = weightedQueryTokens(query);
  return familyIndex.families
    .map((family) => scoreFamilyKeywords(family, queryWeights))
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareText(left.family.id, right.family.id),
    )
    .slice(0, Math.max(0, Math.min(Math.floor(topK), 6)));
}

export function rankReferenceFamilies(
  familyIndex: ReferenceFamilyIndex,
  embeddingIndex: ReferenceEmbeddingIndex,
  queryVector: readonly number[],
  topK = 6,
): RankedReferenceFamily[] {
  validateCompatibleIndexes(familyIndex, embeddingIndex);
  if (
    queryVector.length !== REFERENCE_EMBEDDING_DIMENSIONS ||
    queryVector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      `Query embedding must contain ${REFERENCE_EMBEDDING_DIMENSIONS} finite values.`,
    );
  }

  const familyById = new Map(
    familyIndex.families.map((family) => [family.id, family]),
  );
  return embeddingIndex.embeddings
    .map((embedding) => ({
      family: familyById.get(embedding.id),
      similarity: cosineSimilarity(queryVector, embedding.vector),
    }))
    .filter(
      (
        result,
      ): result is { family: ReferenceFamily; similarity: number } =>
        Boolean(result.family),
    )
    .sort(
      (left, right) =>
        right.similarity - left.similarity ||
        compareText(left.family.id, right.family.id),
    )
    .slice(0, Math.max(0, Math.min(Math.floor(topK), 6)));
}

export function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
) {
  if (!left.length || left.length !== right.length) {
    throw new Error("Cosine similarity requires equal non-empty vectors.");
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      throw new Error("Cosine similarity requires finite vector values.");
    }
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (!leftMagnitude || !rightMagnitude) {
    throw new Error("Cosine similarity does not accept zero vectors.");
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function validateCompatibleIndexes(
  familyIndex: ReferenceFamilyIndex,
  embeddingIndex: ReferenceEmbeddingIndex,
) {
  if (
    embeddingIndex.model !== REFERENCE_EMBEDDING_MODEL ||
    embeddingIndex.dimensions !== REFERENCE_EMBEDDING_DIMENSIONS ||
    embeddingIndex.familyFingerprint !==
      fingerprintReferenceFamilies(familyIndex.families)
  ) {
    throw new Error("Reference embedding index does not match the family index.");
  }
  const familyIds = familyIndex.families.map(({ id }) => id).sort(compareText);
  const embeddingIds = embeddingIndex.embeddings
    .map(({ id }) => id)
    .sort(compareText);
  if (
    familyIds.length !== embeddingIds.length ||
    familyIds.some((id, index) => id !== embeddingIds[index])
  ) {
    throw new Error("Reference embedding IDs do not match the family index.");
  }
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const KEYWORD_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "asset",
  "for",
  "game",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
]);

const FAMILY_FIELD_WEIGHTS = {
  title: 4,
  pack: 1,
  category: 3,
  tags: 5,
} as const;

function weightedQueryTokens(query: ReferenceQuery) {
  const weighted = new Map<string, number>();
  addWeightedTokens(weighted, query.projectBrief, 1);
  addWeightedTokens(weighted, query.assetRequest, 3);
  addWeightedTokens(weighted, query.assetType, 2);
  if (query.settings) {
    for (const value of Object.values(query.settings)) {
      if (typeof value === "string") addWeightedTokens(weighted, value, 2);
    }
  }
  return weighted;
}

function addWeightedTokens(
  destination: Map<string, number>,
  value: string,
  weight: number,
) {
  for (const token of normalizedTokens(value)) {
    destination.set(token, Math.max(destination.get(token) ?? 0, weight));
  }
}

function scoreFamilyKeywords(
  family: ReferenceFamily,
  queryWeights: ReadonlyMap<string, number>,
): KeywordRankedReferenceFamily {
  let rawScore = 0;
  const matchedFields: KeywordRankedReferenceFamily["matchedFields"][number][] =
    [];
  const fields = {
    title: [family.title],
    pack: [family.pack],
    category: [family.category],
    tags: family.tags,
  } as const;

  for (const field of Object.keys(fields) as (keyof typeof fields)[]) {
    const tokens = new Set(fields[field].flatMap(normalizedTokens));
    let fieldScore = 0;
    for (const token of tokens) {
      fieldScore += queryWeights.get(token) ?? 0;
    }
    if (fieldScore > 0) {
      matchedFields.push(field);
      rawScore += fieldScore * FAMILY_FIELD_WEIGHTS[field];
    }
  }

  return {
    family,
    score: Math.round(Math.min(100, rawScore) * 1_000) / 1_000,
    matchedFields,
  };
}

function normalizedTokens(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((token) => token && !KEYWORD_STOP_WORDS.has(token));
}
