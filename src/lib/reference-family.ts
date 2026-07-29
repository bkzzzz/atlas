import { createHash } from "node:crypto";

export const REFERENCE_INDEX_SCHEMA_VERSION = 1;
export const REFERENCE_EMBEDDING_MODEL = "text-embedding-3-small";
export const REFERENCE_EMBEDDING_DIMENSIONS = 512;

export type ReferenceFamily = Readonly<{
  id: string;
  title: string;
  pack: string;
  category: string;
  tags: readonly string[];
  source: "Kenney";
  author: "Kenney";
  license: "CC0-1.0";
  representativeImagePath: string;
  memberImagePaths: readonly string[];
  embeddingText: string;
}>;

export type ReferenceFamilyIndex = Readonly<{
  schemaVersion: 1;
  sourceRoot: "data/reference-source/Kenney";
  selectedPacks: readonly string[];
  families: readonly ReferenceFamily[];
}>;

export type ReferenceEmbedding = Readonly<{
  id: string;
  vector: readonly number[];
}>;

export type ReferenceEmbeddingIndex = Readonly<{
  schemaVersion: 1;
  model: typeof REFERENCE_EMBEDDING_MODEL;
  dimensions: typeof REFERENCE_EMBEDDING_DIMENSIONS;
  familyFingerprint: string;
  embeddings: readonly ReferenceEmbedding[];
}>;

export function fingerprintReferenceFamilies(
  families: readonly Pick<ReferenceFamily, "id" | "embeddingText">[],
) {
  const hash = createHash("sha256");
  for (const family of [...families].sort(compareFamilyId)) {
    hash.update(family.id);
    hash.update("\0");
    hash.update(family.embeddingText);
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function createReferenceEmbeddingIndex(
  families: readonly ReferenceFamily[],
  embeddings: readonly ReferenceEmbedding[],
): ReferenceEmbeddingIndex {
  const sortedFamilies = [...families].sort(compareFamilyId);
  const sortedEmbeddings = [...embeddings].sort((left, right) =>
    compareText(left.id, right.id),
  );
  if (
    sortedFamilies.length !== sortedEmbeddings.length ||
    sortedFamilies.some((family, index) => family.id !== sortedEmbeddings[index]?.id)
  ) {
    throw new Error("Embedding IDs must match the reference family IDs exactly.");
  }

  for (const embedding of sortedEmbeddings) {
    if (
      embedding.vector.length !== REFERENCE_EMBEDDING_DIMENSIONS ||
      embedding.vector.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Embedding ${embedding.id} must contain ${REFERENCE_EMBEDDING_DIMENSIONS} finite values.`,
      );
    }
  }

  return Object.freeze({
    schemaVersion: REFERENCE_INDEX_SCHEMA_VERSION,
    model: REFERENCE_EMBEDDING_MODEL,
    dimensions: REFERENCE_EMBEDDING_DIMENSIONS,
    familyFingerprint: fingerprintReferenceFamilies(sortedFamilies),
    embeddings: Object.freeze(
      sortedEmbeddings.map((embedding) =>
        Object.freeze({
          id: embedding.id,
          vector: Object.freeze([...embedding.vector]),
        }),
      ),
    ),
  });
}

export function isReferenceFamilyIndex(value: unknown): value is ReferenceFamilyIndex {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (value.sourceRoot !== "data/reference-source/Kenney") return false;
  if (!isStringList(value.selectedPacks) || !Array.isArray(value.families)) return false;
  return value.families.every(isReferenceFamily);
}

export function isReferenceEmbeddingIndex(
  value: unknown,
): value is ReferenceEmbeddingIndex {
  if (
    !isRecord(value) ||
    value.schemaVersion !== REFERENCE_INDEX_SCHEMA_VERSION ||
    value.model !== REFERENCE_EMBEDDING_MODEL ||
    value.dimensions !== REFERENCE_EMBEDDING_DIMENSIONS ||
    typeof value.familyFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.familyFingerprint) ||
    !Array.isArray(value.embeddings)
  ) {
    return false;
  }
  return value.embeddings.every(
    (embedding) =>
      isRecord(embedding) &&
      typeof embedding.id === "string" &&
      Array.isArray(embedding.vector) &&
      embedding.vector.length === REFERENCE_EMBEDDING_DIMENSIONS &&
      embedding.vector.every((item) => typeof item === "number" && Number.isFinite(item)),
  );
}

function isReferenceFamily(value: unknown): value is ReferenceFamily {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    /^kenney-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value.id) &&
    typeof value.title === "string" &&
    typeof value.pack === "string" &&
    typeof value.category === "string" &&
    isStringList(value.tags) &&
    value.source === "Kenney" &&
    value.author === "Kenney" &&
    value.license === "CC0-1.0" &&
    typeof value.representativeImagePath === "string" &&
    value.representativeImagePath.toLocaleLowerCase("en-US").endsWith(".png") &&
    isStringList(value.memberImagePaths) &&
    typeof value.embeddingText === "string" &&
    Boolean(value.embeddingText.trim())
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function compareFamilyId(
  left: Pick<ReferenceFamily, "id">,
  right: Pick<ReferenceFamily, "id">,
) {
  return compareText(left.id, right.id);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
