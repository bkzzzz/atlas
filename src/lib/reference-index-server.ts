import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import {
  isReferenceEmbeddingIndex,
  isReferenceFamilyIndex,
  REFERENCE_EMBEDDING_DIMENSIONS,
  REFERENCE_EMBEDDING_MODEL,
} from "@/lib/reference-family";

const FAMILY_INDEX_PATH = path.resolve(
  "data/reference-index/reference-families.json",
);
const EMBEDDING_INDEX_PATH = path.resolve(
  "data/reference-index/reference-embeddings.json",
);

export async function loadReferenceFamilyIndex() {
  const value: unknown = JSON.parse(await readFile(FAMILY_INDEX_PATH, "utf8"));
  if (
    !isReferenceFamilyIndex(value) ||
    value.families.length < 100 ||
    value.families.length > 250
  ) {
    throw new Error("Reference family index is missing or invalid.");
  }
  return value;
}

export async function loadReferenceIndexes() {
  const [families, embeddingValue] = await Promise.all([
    loadReferenceFamilyIndex(),
    readFile(EMBEDDING_INDEX_PATH, "utf8").then(
      (contents): unknown => JSON.parse(contents),
    ),
  ]);
  if (!isReferenceEmbeddingIndex(embeddingValue)) {
    throw new Error("Reference embedding index is missing or invalid.");
  }
  return { families, embeddings: embeddingValue };
}

export async function embedReferenceQuery(text: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");

  const client = new OpenAI({
    apiKey,
    timeout: 30_000,
    maxRetries: 0,
  });
  const response = await client.embeddings.create({
    model: REFERENCE_EMBEDDING_MODEL,
    dimensions: REFERENCE_EMBEDDING_DIMENSIONS,
    encoding_format: "float",
    input: text,
  });
  const vector = response.data[0]?.embedding;
  if (
    response.data.length !== 1 ||
    !vector ||
    vector.length !== REFERENCE_EMBEDDING_DIMENSIONS ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error("OpenAI returned an invalid query embedding.");
  }
  return vector;
}
