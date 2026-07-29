import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import {
  createReferenceEmbeddingIndex,
  isReferenceFamilyIndex,
  REFERENCE_EMBEDDING_DIMENSIONS,
  REFERENCE_EMBEDDING_MODEL,
  type ReferenceEmbedding,
} from "../../src/lib/reference-family";
import {
  MAX_REFERENCE_FAMILIES,
  MIN_REFERENCE_FAMILIES,
} from "./family-builder";

const FAMILY_INDEX_PATH = path.resolve(
  "data/reference-index/reference-families.json",
);
const EMBEDDING_INDEX_PATH = path.resolve(
  "data/reference-index/reference-embeddings.json",
);
const BATCH_SIZE = 100;

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate reference embeddings.");
  }

  const familyIndex = await readFamilyIndex();
  if (
    familyIndex.families.length < MIN_REFERENCE_FAMILIES ||
    familyIndex.families.length > MAX_REFERENCE_FAMILIES
  ) {
    throw new Error(
      `Expected ${MIN_REFERENCE_FAMILIES}–${MAX_REFERENCE_FAMILIES} families, received ${familyIndex.families.length}.`,
    );
  }

  const client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 0 });
  const embeddings: ReferenceEmbedding[] = [];
  let totalTokens = 0;

  for (let start = 0; start < familyIndex.families.length; start += BATCH_SIZE) {
    const batch = familyIndex.families.slice(start, start + BATCH_SIZE);
    const response = await client.embeddings.create({
      model: REFERENCE_EMBEDDING_MODEL,
      dimensions: REFERENCE_EMBEDDING_DIMENSIONS,
      encoding_format: "float",
      input: batch.map(({ embeddingText }) => embeddingText),
    });
    const ordered = [...response.data].sort((left, right) => left.index - right.index);
    if (ordered.length !== batch.length) {
      throw new Error("OpenAI returned an incomplete embedding batch.");
    }
    ordered.forEach((item, index) => {
      embeddings.push({ id: batch[index].id, vector: item.embedding });
    });
    totalTokens += response.usage.total_tokens;
  }

  const embeddingIndex = createReferenceEmbeddingIndex(
    familyIndex.families,
    embeddings,
  );
  const contents = `${JSON.stringify(embeddingIndex, null, 2)}\n`;
  const temporaryPath = `${EMBEDDING_INDEX_PATH}.tmp`;
  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, EMBEDDING_INDEX_PATH);

  process.stdout.write(
    [
      `Embedding model: ${REFERENCE_EMBEDDING_MODEL}`,
      `Dimensions: ${REFERENCE_EMBEDDING_DIMENSIONS}`,
      `Reference embeddings: ${embeddingIndex.embeddings.length}`,
      `Input tokens: ${totalTokens}`,
      `Output bytes: ${Buffer.byteLength(contents)}`,
      `Output: ${path.relative(process.cwd(), EMBEDDING_INDEX_PATH)}`,
    ].join("\n") + "\n",
  );
}

async function readFamilyIndex() {
  const value: unknown = JSON.parse(await readFile(FAMILY_INDEX_PATH, "utf8"));
  if (!isReferenceFamilyIndex(value)) {
    throw new Error("Reference family index is missing or invalid.");
  }
  return value;
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown embedding generation error.";
  process.stderr.write(`Reference embedding generation failed: ${message}\n`);
  process.exitCode = 1;
});
