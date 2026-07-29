import type { ReferenceFamily } from "@/lib/reference-family";
import type {
  ParsedStaticImageTask,
  ReferenceGuidance,
} from "@/lib/task-schema";

export type StyleSpecMergeErrorCode =
  | "invalid_count"
  | "duplicate_id"
  | "unknown_id"
  | "nonempty_draft_guidance";

const MERGE_ERROR_MESSAGES: Record<StyleSpecMergeErrorCode, string> = {
  invalid_count: "Select between one and three references.",
  duplicate_id: "Reference IDs must be unique.",
  unknown_id: "One or more unknown reference IDs were selected.",
  nonempty_draft_guidance: "Draft StyleSpec reference guidance must be empty.",
};

export class StyleSpecMergeError extends Error {
  readonly code: StyleSpecMergeErrorCode;

  constructor(code: StyleSpecMergeErrorCode) {
    super(MERGE_ERROR_MESSAGES[code]);
    this.name = "StyleSpecMergeError";
    this.code = code;
  }
}

export type ReferenceProvenance = {
  id: string;
  pack: string;
  source: ReferenceFamily["source"];
  author: ReferenceFamily["author"];
  license: ReferenceFamily["license"];
};

export type MergedStyleSpec = {
  task: ParsedStaticImageTask;
  referenceProvenance: ReferenceProvenance[];
};

function normalizeText(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function comparisonKey(value: string) {
  return normalizeText(value).toLocaleLowerCase("en-US");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalValue(value: string, values: Map<string, string>) {
  const normalized = normalizeText(value);
  const key = comparisonKey(normalized);
  const existing = values.get(key);
  if (existing !== undefined) return existing;
  values.set(key, normalized);
  return normalized;
}

// Retrieval metadata enters the executable task only through this pure
// trusted-index merge. The parsed Draft remains authoritative.
export function mergeStyleSpecWithReferences(
  draft: ParsedStaticImageTask,
  selectedReferenceIds: readonly string[],
  trustedFamilies: readonly ReferenceFamily[],
): MergedStyleSpec {
  if (draft.referenceGuidance.length !== 0) {
    throw new StyleSpecMergeError("nonempty_draft_guidance");
  }
  if (selectedReferenceIds.length < 1 || selectedReferenceIds.length > 3) {
    throw new StyleSpecMergeError("invalid_count");
  }
  if (new Set(selectedReferenceIds).size !== selectedReferenceIds.length) {
    throw new StyleSpecMergeError("duplicate_id");
  }

  const familyById = new Map(
    trustedFamilies.map((family) => [family.id, family] as const),
  );
  const selectedFamilies = [...selectedReferenceIds]
    .sort(compareText)
    .map((id) => {
      const family = familyById.get(id);
      if (!family) throw new StyleSpecMergeError("unknown_id");
      return family;
    });

  const titles = new Map<string, string>();
  const packs = new Map<string, string>();
  const categories = new Map<string, string>();
  const tags = new Set<string>();
  const referenceGuidance: ReferenceGuidance[] = selectedFamilies.map((family) => ({
    id: family.id,
    title: canonicalValue(family.title, titles),
    pack: canonicalValue(family.pack, packs),
    category: canonicalValue(family.category, categories),
    tags: family.tags.flatMap((tag) => {
      const normalized = normalizeText(tag);
      const key = comparisonKey(normalized);
      if (!key || tags.has(key)) return [];
      tags.add(key);
      return [normalized];
    }),
  }));

  return {
    task: {
      ...draft,
      positiveConstraints: [...draft.positiveConstraints],
      negativeConstraints: [...draft.negativeConstraints],
      referenceAssets: [...draft.referenceAssets],
      assumptions: [...draft.assumptions],
      assetSettings: { ...draft.assetSettings },
      referenceGuidance,
    },
    referenceProvenance: selectedFamilies.map((family) => ({
      id: family.id,
      pack: canonicalValue(family.pack, packs),
      source: family.source,
      author: family.author,
      license: family.license,
    })),
  };
}
