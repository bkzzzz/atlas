import { ASSET_TYPES } from "@/lib/asset-generation-flow";
import type { ReferenceFamily } from "@/lib/reference-family";
import {
  retrieveReferenceFamiliesWithFallback,
  type SemanticRetrievalDependencies,
} from "@/lib/reference-family-retrieval";
import {
  type ArtDirectionRetrievalResult,
  type KenneyReferenceSelection,
  type ReferenceQuery,
} from "@/lib/reference-retrieval";
import { isStaticImageAssetSettings } from "@/lib/task-mode";

const MAX_REFERENCE_QUERY_FIELD_LENGTH = 8_000;
const ASSET_TYPE_VALUES = new Set(ASSET_TYPES.map(({ value }) => value));

export type ReferenceRetrievalHandlerDependencies =
  SemanticRetrievalDependencies;

export function createReferenceRetrievalHandler(
  dependencies: ReferenceRetrievalHandlerDependencies,
) {
  return async function postReferenceRetrieval(request: Request) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidQueryResponse();
    }

    const query = validatedQuery(body);
    if (!query) return invalidQueryResponse();

    let mode: "semantic" | "keyword";
    let results: readonly ArtDirectionRetrievalResult[];
    try {
      const outcome = await retrieveReferenceFamiliesWithFallback(
        query,
        dependencies,
      );
      mode = outcome.mode;
      results =
        outcome.mode === "semantic"
          ? outcome.results.map(({ family, similarity }) => ({
              reference: clientReference(family),
              score: similarityScore(similarity),
              matchedFields: [],
            }))
          : outcome.results.map(({ family, score, matchedFields }) => ({
              reference: clientReference(family),
              score,
              matchedFields,
            }));
    } catch {
      return Response.json(
        { error: "The reference library is temporarily unavailable." },
        { status: 503 },
      );
    }
    return Response.json({ mode, results });
  };
}

function clientReference(
  family: ReferenceFamily,
): KenneyReferenceSelection {
  return {
    kind: "kenney-family",
    id: family.id,
    title: family.title,
    previewUrl: `/api/references/image?id=${encodeURIComponent(family.id)}`,
    pack: family.pack,
    category: family.category,
    tags: family.tags,
    source: family.source,
    author: family.author,
    license: family.license,
  };
}

function similarityScore(similarity: number) {
  return (
    Math.round(Math.max(0, Math.min(1, similarity)) * 100_000) / 1_000
  );
}

function validatedQuery(value: unknown): ReferenceQuery | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["query"])) return null;
  const query = value.query;
  if (
    !isRecord(query) ||
    !hasOnlyKeys(query, [
      "projectBrief",
      "assetRequest",
      "assetType",
      "settings",
    ])
  ) {
    return null;
  }

  const projectBrief = boundedText(query.projectBrief);
  const assetRequest = boundedText(query.assetRequest);
  if (
    !projectBrief ||
    !assetRequest ||
    typeof query.assetType !== "string" ||
    !ASSET_TYPE_VALUES.has(
      query.assetType as (typeof ASSET_TYPES)[number]["value"],
    ) ||
    (query.settings !== undefined &&
      !isStaticImageAssetSettings(query.settings))
  ) {
    return null;
  }

  return {
    projectBrief,
    assetRequest,
    assetType: query.assetType as ReferenceQuery["assetType"],
    ...(query.settings ? { settings: query.settings } : {}),
  };
}

function invalidQueryResponse() {
  return Response.json(
    { error: "Add a valid project brief, asset request, and asset type." },
    { status: 400 },
  );
}

function boundedText(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length <= MAX_REFERENCE_QUERY_FIELD_LENGTH ? trimmed : "";
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
