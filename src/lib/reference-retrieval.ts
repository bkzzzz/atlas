import referenceLibraryJson from "@/data/reference-library.json";
import type { AssetType } from "@/lib/asset-generation-flow";
import type { StaticImageAssetSettings } from "@/lib/task-mode";

export type DetailDensity = "low" | "medium" | "high";

export type CuratedReference = Readonly<{
  id: string;
  title: string;
  imagePath: string;
  medium: readonly string[];
  perspective: readonly string[];
  genre: readonly string[];
  mood: readonly string[];
  palette: readonly string[];
  materials: readonly string[];
  subjectTags: readonly string[];
  detailDensity: DetailDensity;
  negativeTraits: readonly string[];
}>;

export type ReferenceQuery = Readonly<{
  projectBrief: string;
  assetRequest: string;
  assetType: AssetType;
  settings?: Partial<StaticImageAssetSettings>;
}>;

export type RetrievalResult = Readonly<{
  reference: CuratedReference;
  score: number;
  matchedFields: readonly string[];
}>;

export type KenneyReferenceSelection = Readonly<{
  kind: "kenney-family";
  id: string;
  title: string;
  previewUrl: string;
  pack: string;
  category: string;
  tags: readonly string[];
  source: "Kenney";
  author: "Kenney";
  license: "CC0-1.0";
}>;

export type SelectableReference =
  | CuratedReference
  | KenneyReferenceSelection;

export type ArtDirectionRetrievalResult = Readonly<{
  reference: SelectableReference;
  score: number;
  matchedFields: readonly string[];
}>;

type QuerySource = Readonly<{
  desiredText: string;
  desiredTokens: ReadonlySet<string>;
  excludedText: string;
  excludedTokens: ReadonlySet<string>;
  weight: number;
}>;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "art",
  "asset",
  "at",
  "by",
  "create",
  "for",
  "from",
  "game",
  "generate",
  "in",
  "into",
  "make",
  "of",
  "on",
  "or",
  "project",
  "style",
  "the",
  "to",
  "with",
]);

const NEGATORS = new Set(["avoid", "exclude", "no", "not", "without"]);

const ASSET_TYPE_TERMS: Record<AssetType, string> = {
  CHARACTER_SPRITE: "character sprite full body",
  PORTRAIT: "character portrait bust",
  ICON: "icon symbol emblem",
  PROP: "prop item object",
  UI_ASSET: "ui interface hud panel",
};

const VISUAL_STYLE_TERMS: Record<
  StaticImageAssetSettings["visualStyle"],
  string
> = {
  PIXEL_ART: "pixel art 2d sprite",
  VECTOR_STYLE: "flat illustration vector graphic",
  ILLUSTRATION: "illustration painted drawing",
};

const VIEW_TERMS: Record<StaticImageAssetSettings["viewAngle"], string> = {
  SIDE: "side view profile",
  FRONT: "front view",
  TOP_DOWN: "top down view overhead",
  ISOMETRIC: "isometric view",
  THREE_QUARTER: "three quarter view",
  UNSPECIFIED: "",
};

const DETAIL_TERMS: Record<StaticImageAssetSettings["pixelDetail"], string> = {
  LOW: "low simple sparse",
  MEDIUM: "medium balanced",
  HIGH: "high detailed intricate",
};

const FIELD_RULES = [
  { key: "title", weight: 1, limit: 1 },
  { key: "medium", weight: 6, limit: 1 },
  { key: "perspective", weight: 5, limit: 1 },
  { key: "genre", weight: 4, limit: 2 },
  { key: "mood", weight: 3, limit: 2 },
  { key: "palette", weight: 3, limit: 2 },
  { key: "materials", weight: 2, limit: 2 },
  { key: "subjectTags", weight: 6, limit: 2 },
  { key: "detailDensity", weight: 2, limit: 1 },
] as const;

function stringList(value: unknown, field: string) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((item) => typeof item === "string" && item.trim())
  ) {
    throw new Error(`Curated reference ${field} must be a non-empty string list.`);
  }
  return Object.freeze(value.map((item) => item.trim()));
}

function curatedReference(value: unknown, index: number): CuratedReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Curated reference ${index} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)
  ) {
    throw new Error(`Curated reference ${index} has an invalid id.`);
  }
  if (typeof record.title !== "string" || !record.title.trim()) {
    throw new Error(`Curated reference ${record.id} has an invalid title.`);
  }
  if (
    typeof record.imagePath !== "string" ||
    !/^\/references\/[a-z0-9-]+\.webp$/.test(record.imagePath)
  ) {
    throw new Error(`Curated reference ${record.id} has an invalid image path.`);
  }
  if (
    record.detailDensity !== "low" &&
    record.detailDensity !== "medium" &&
    record.detailDensity !== "high"
  ) {
    throw new Error(`Curated reference ${record.id} has invalid detail density.`);
  }

  return Object.freeze({
    id: record.id,
    title: record.title.trim(),
    imagePath: record.imagePath,
    medium: stringList(record.medium, "medium"),
    perspective: stringList(record.perspective, "perspective"),
    genre: stringList(record.genre, "genre"),
    mood: stringList(record.mood, "mood"),
    palette: stringList(record.palette, "palette"),
    materials: stringList(record.materials, "materials"),
    subjectTags: stringList(record.subjectTags, "subject tags"),
    detailDensity: record.detailDensity,
    negativeTraits: stringList(record.negativeTraits, "negative traits"),
  });
}

export const REFERENCE_LIBRARY: readonly CuratedReference[] = Object.freeze(
  (referenceLibraryJson as unknown[]).map(curatedReference),
);

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function meaningful(tokens: readonly string[]) {
  return tokens.filter((token) => token && !STOP_WORDS.has(token));
}

function splitIntent(value: string) {
  const desired: string[] = [];
  const excluded: string[] = [];
  let exclusionBudget = 0;

  for (const token of normalize(value).split(" ")) {
    if (!token) continue;
    if (NEGATORS.has(token)) {
      exclusionBudget = 3;
      continue;
    }
    if (STOP_WORDS.has(token)) continue;
    if (exclusionBudget > 0) {
      excluded.push(token);
      exclusionBudget -= 1;
    } else {
      desired.push(token);
    }
  }

  return {
    desiredText: desired.join(" "),
    desiredTokens: new Set(desired),
    excludedText: excluded.join(" "),
    excludedTokens: new Set(excluded),
  };
}

function querySource(value: string, weight: number): QuerySource | null {
  const intent = splitIntent(value);
  if (!intent.desiredTokens.size && !intent.excludedTokens.size) return null;
  return { ...intent, weight };
}

function settingsTerms(settings: Partial<StaticImageAssetSettings> | undefined) {
  if (!settings) return "";
  return [
    settings.visualStyle ? VISUAL_STYLE_TERMS[settings.visualStyle] : "",
    settings.viewAngle ? VIEW_TERMS[settings.viewAngle] : "",
    settings.visualStyle === "PIXEL_ART" && settings.pixelDetail
      ? DETAIL_TERMS[settings.pixelDetail]
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function querySources(query: ReferenceQuery) {
  return [
    querySource(query.projectBrief, 1),
    querySource(query.assetRequest, 1.5),
    querySource(ASSET_TYPE_TERMS[query.assetType], 1.5),
    querySource(settingsTerms(query.settings), 2),
  ].filter((source): source is QuerySource => Boolean(source));
}

function matchStrength(
  value: string,
  text: string,
  tokens: ReadonlySet<string>,
) {
  const normalized = normalize(value);
  const valueTokens = meaningful(normalized.split(" "));
  if (!valueTokens.length || !tokens.size) return 0;
  if (` ${text} `.includes(` ${valueTokens.join(" ")} `)) return 1;

  const matches = valueTokens.filter((token) => tokens.has(token)).length;
  if (matches === valueTokens.length) return 0.85;
  if (!matches) return 0;
  return 0.5 * (matches / valueTokens.length);
}

function bestSourceMatch(
  value: string,
  sources: readonly QuerySource[],
  intent: "desired" | "excluded",
) {
  return sources.reduce((best, source) => {
    const text =
      intent === "desired" ? source.desiredText : source.excludedText;
    const tokens =
      intent === "desired" ? source.desiredTokens : source.excludedTokens;
    return Math.max(best, source.weight * matchStrength(value, text, tokens));
  }, 0);
}

function bestMatches(
  values: readonly string[],
  sources: readonly QuerySource[],
  intent: "desired" | "excluded",
  limit: number,
) {
  return values
    .map((value) => bestSourceMatch(value, sources, intent))
    .sort((left, right) => right - left)
    .slice(0, limit)
    .reduce((total, value) => total + value, 0);
}

function fieldValues(
  reference: CuratedReference,
  key: (typeof FIELD_RULES)[number]["key"],
) {
  const value = reference[key];
  return typeof value === "string" ? [value] : value;
}

function scoreReference(
  reference: CuratedReference,
  sources: readonly QuerySource[],
): RetrievalResult {
  let score = 0;
  const matchedFields: string[] = [];

  for (const rule of FIELD_RULES) {
    const values = fieldValues(reference, rule.key);
    const positive =
      rule.weight *
      bestMatches(values, sources, "desired", rule.limit);
    const excluded =
      rule.weight *
      bestMatches(values, sources, "excluded", rule.limit);
    score += positive - excluded;
    if (positive > 0) matchedFields.push(rule.key);
  }

  score -=
    8 * bestMatches(reference.negativeTraits, sources, "desired", 2);
  score +=
    2 * bestMatches(reference.negativeTraits, sources, "excluded", 2);

  return {
    reference,
    score: Math.round(Math.min(100, Math.max(0, score)) * 1000) / 1000,
    matchedFields: Object.freeze(matchedFields),
  };
}

export function retrieveReferences(
  query: ReferenceQuery,
  library: readonly CuratedReference[] = REFERENCE_LIBRARY,
  topK = 6,
): RetrievalResult[] {
  const sources = querySources(query);
  const limit = Math.max(0, Math.min(Math.floor(topK), library.length));
  return [...library]
    .map((reference) => scoreReference(reference, sources))
    .filter((result) => result.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (left.reference.id < right.reference.id ? -1 : 1),
    )
    .slice(0, limit);
}

export function isKenneyReference(
  reference: SelectableReference,
): reference is KenneyReferenceSelection {
  return "kind" in reference && reference.kind === "kenney-family";
}

export function referencePreviewUrl(reference: SelectableReference) {
  return isKenneyReference(reference) ? reference.previewUrl : reference.imagePath;
}

function compareReferenceId(left: SelectableReference, right: SelectableReference) {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export function formatReferenceContext(
  selected: readonly SelectableReference[],
) {
  if (selected.length < 1 || selected.length > 3) {
    throw new Error("Choose one to three curated references.");
  }
  if (new Set(selected.map((item) => item.id)).size !== selected.length) {
    throw new Error("Choose unique curated references.");
  }

  const lines = [...selected].sort(compareReferenceId).map((item) => {
    if (isKenneyReference(item)) {
      return [
        `- ${item.title}`,
        `pack: ${item.pack}`,
        `category: ${item.category}`,
        `tags: ${item.tags.slice(0, 12).join(", ")}`,
        `source: ${item.source}`,
        `author: ${item.author}`,
        `license: ${item.license}`,
      ].join("; ");
    }
    return [
      `- ${item.title}`,
      `medium: ${item.medium.join(", ")}`,
      `perspective: ${item.perspective.join(", ")}`,
      `genre: ${item.genre.join(", ")}`,
      `mood: ${item.mood.join(", ")}`,
      `palette: ${item.palette.join(", ")}`,
      `materials: ${item.materials.join(", ")}`,
      `subjects: ${item.subjectTags.join(", ")}`,
      `detail density: ${item.detailDensity}`,
      `Avoid carrying over: ${item.negativeTraits.join(", ")}`,
    ].join("; ");
  });

  return [
    "Selected curated reference metadata.",
    "Metadata guidance only; reference images are not visual inputs.",
    ...lines,
  ].join("\n");
}
