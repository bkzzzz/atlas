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

export type ReferenceRetrievalOutcome<FallbackResult> =
  | Readonly<{ mode: "semantic"; results: readonly RankedReferenceFamily[] }>
  | Readonly<{ mode: "keyword"; results: readonly FallbackResult[] }>;

export type SemanticRetrievalDependencies<FallbackResult> = Readonly<{
  loadIndexes: () => Promise<{
    families: ReferenceFamilyIndex;
    embeddings: ReferenceEmbeddingIndex;
  }>;
  embedQuery: (text: string) => Promise<readonly number[]>;
  keywordFallback: (query: ReferenceQuery) => readonly FallbackResult[];
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

export async function retrieveReferenceFamiliesWithFallback<FallbackResult>(
  query: ReferenceQuery,
  dependencies: SemanticRetrievalDependencies<FallbackResult>,
  topK = 6,
): Promise<ReferenceRetrievalOutcome<FallbackResult>> {
  try {
    const { families, embeddings } = await dependencies.loadIndexes();
    const queryVector = await dependencies.embedQuery(
      compileReferenceQueryText(query),
    );
    return {
      mode: "semantic",
      results: rankReferenceFamilies(families, embeddings, queryVector, topK),
    };
  } catch {
    return {
      mode: "keyword",
      results: dependencies.keywordFallback(query),
    };
  }
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
