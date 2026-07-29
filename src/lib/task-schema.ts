import {
  isStaticImageAssetSettings,
  type StaticImageAssetSettings,
} from "@/lib/task-mode";

export type ReferenceGuidance = {
  id: string;
  title: string;
  pack: string;
  category: string;
  tags: string[];
};

// This is the strict shape returned by the parser for the only executable
// Atlas mode: one static image. Top-level mode selection stays with the user.
export type ParsedStaticImageTask = {
  assetKind: string;
  visualSubject: string;
  visualStyle: string;
  composition: string;
  dimensions: string;
  background: string;
  positiveConstraints: string[];
  negativeConstraints: string[];
  referenceAssets: string[];
  assumptions: string[];
  assetSettings: StaticImageAssetSettings;
  // The compiler retains the original request so stated details are never
  // lost while the structured fields remain available for review.
  userRequest: string;
  // Retrieval guidance is attached only after strict model-output validation.
  // It is intentionally absent from the Structured Outputs schema below.
  referenceGuidance: ReferenceGuidance[];
};

// Strict Structured Outputs requires every property to be required. Empty
// arrays represent details the request did not specify.
export const staticImageTaskSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    assetKind: { type: "string" },
    visualSubject: { type: "string" },
    visualStyle: { type: "string" },
    composition: { type: "string" },
    dimensions: { type: "string" },
    background: { type: "string" },
    positiveConstraints: { type: "array", items: { type: "string" } },
    negativeConstraints: { type: "array", items: { type: "string" } },
    referenceAssets: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
  },
  required: [
    "assetKind",
    "visualSubject",
    "visualStyle",
    "composition",
    "dimensions",
    "background",
    "positiveConstraints",
    "negativeConstraints",
    "referenceAssets",
    "assumptions",
  ],
} as const;

const modelKeys = [
  "assetKind",
  "visualSubject",
  "visualStyle",
  "composition",
  "dimensions",
  "background",
  "positiveConstraints",
  "negativeConstraints",
  "referenceAssets",
  "assumptions",
];

const draftKeys = [
  ...modelKeys,
  "assetSettings",
  "userRequest",
  "referenceGuidance",
];

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isExactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  return Object.keys(object).length === keys.length && Object.keys(object).every((key) => keys.includes(key));
}

function clean(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}

// Structured Outputs is validated locally as well. This prevents malformed
// provider data from reaching the deterministic compiler.
export function validateParsedStaticImageTask(
  value: unknown,
  originalRequest: string,
  assetSettings: unknown,
): ParsedStaticImageTask | null {
  if (!isStaticImageAssetSettings(assetSettings)) return null;
  if (!isExactObject(value, modelKeys)) return null;
  const task = value;
  if (
    ![
      task.assetKind,
      task.visualSubject,
      task.visualStyle,
      task.composition,
      task.dimensions,
      task.background,
    ].every(nonEmptyString)
  ) {
    return null;
  }
  if (
    !isStringList(task.positiveConstraints) ||
    !isStringList(task.negativeConstraints) ||
    !isStringList(task.referenceAssets) ||
    !isStringList(task.assumptions)
  ) {
    return null;
  }

  return {
    assetKind: (task.assetKind as string).trim(),
    visualSubject: (task.visualSubject as string).trim(),
    visualStyle: (task.visualStyle as string).trim(),
    composition: (task.composition as string).trim(),
    dimensions: (task.dimensions as string).trim(),
    background: (task.background as string).trim(),
    positiveConstraints: clean(task.positiveConstraints),
    negativeConstraints: clean(task.negativeConstraints),
    referenceAssets: clean(task.referenceAssets),
    assumptions: clean(task.assumptions),
    assetSettings,
    userRequest: originalRequest.trim(),
    referenceGuidance: [],
  };
}

// The compile boundary accepts only the exact internal Draft produced after
// strict model validation. Retrieval metadata is never accepted from clients.
export function validateDraftStaticImageTask(
  value: unknown,
): ParsedStaticImageTask | null {
  if (!isExactObject(value, draftKeys)) return null;
  if (!nonEmptyString(value.userRequest)) return null;
  if (
    !Array.isArray(value.referenceGuidance) ||
    value.referenceGuidance.length !== 0
  ) {
    return null;
  }

  return validateParsedStaticImageTask(
    {
      assetKind: value.assetKind,
      visualSubject: value.visualSubject,
      visualStyle: value.visualStyle,
      composition: value.composition,
      dimensions: value.dimensions,
      background: value.background,
      positiveConstraints: value.positiveConstraints,
      negativeConstraints: value.negativeConstraints,
      referenceAssets: value.referenceAssets,
      assumptions: value.assumptions,
    },
    value.userRequest,
    value.assetSettings,
  );
}
