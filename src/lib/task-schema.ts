import type { ProviderProfile, RikaAnimationOptions } from "@/lib/providers/types";

export type TaskOperation = "generate" | "edit" | "animate";

export type AnimationSpecification = {
  animationType: string;
  frameCount: number;
  looping: boolean;
  cameraMovementAllowed: boolean;
  projectileAllowed: boolean;
  motionDescription: string;
};

// This is deliberately limited to art-production intent. It does not model
// code, game-project knowledge, retrieval, collaboration, or database state.
export type ParsedTask = {
  provider: ProviderProfile;
  operation: TaskOperation;
  assetKind: string;
  visualSubject: string;
  visualStyle: string;
  composition: string;
  dimensions: string;
  background: string;
  animationSpecification: AnimationSpecification | null;
  positiveConstraints: string[];
  negativeConstraints: string[];
  referenceAssets: string[];
  outputVariants: number;
  assumptions: string[];
  // These two fields are derived locally, not trusted model output. They keep
  // the existing deterministic provider-adapter contract stable.
  userRequest: string;
  rikaOptions: RikaAnimationOptions | null;
};

const animationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    animationType: { type: "string" },
    frameCount: { type: "integer", minimum: 1 },
    looping: { type: "boolean" },
    cameraMovementAllowed: { type: "boolean" },
    projectileAllowed: { type: "boolean" },
    motionDescription: { type: "string" },
  },
  required: ["animationType", "frameCount", "looping", "cameraMovementAllowed", "projectileAllowed", "motionDescription"],
} as const;

// Strict Structured Outputs schema. Every property is required by OpenAI's
// strict mode; fields that do not apply are represented as null or an empty list.
export const taskSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    provider: { type: "string", enum: ["GENERIC_IMAGE", "RIKA_ANIMATION"] },
    operation: { type: "string", enum: ["generate", "edit", "animate"] },
    assetKind: { type: "string" },
    visualSubject: { type: "string" },
    visualStyle: { type: "string" },
    composition: { type: "string" },
    dimensions: { type: "string" },
    background: { type: "string" },
    animationSpecification: { anyOf: [{ type: "null" }, animationSchema] },
    positiveConstraints: { type: "array", items: { type: "string" } },
    negativeConstraints: { type: "array", items: { type: "string" } },
    referenceAssets: { type: "array", items: { type: "string" } },
    outputVariants: { type: "integer", minimum: 1, maximum: 8 },
    assumptions: { type: "array", items: { type: "string" } },
  },
  required: ["provider", "operation", "assetKind", "visualSubject", "visualStyle", "composition", "dimensions", "background", "animationSpecification", "positiveConstraints", "negativeConstraints", "referenceAssets", "outputVariants", "assumptions"],
} as const;

const modelKeys = ["provider", "operation", "assetKind", "visualSubject", "visualStyle", "composition", "dimensions", "background", "animationSpecification", "positiveConstraints", "negativeConstraints", "referenceAssets", "outputVariants", "assumptions"];
const animationKeys = ["animationType", "frameCount", "looping", "cameraMovementAllowed", "projectileAllowed", "motionDescription"];

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

// Validate once more locally. It protects deterministic compilation if an
// upstream response is malformed or this function is called from a new route.
export function validateParsedTask(value: unknown, originalRequest: string): ParsedTask | null {
  if (!isExactObject(value, modelKeys)) return null;
  const task = value;
  if ((task.provider !== "GENERIC_IMAGE" && task.provider !== "RIKA_ANIMATION") || (task.operation !== "generate" && task.operation !== "edit" && task.operation !== "animate")) return null;
  if (![task.assetKind, task.visualSubject, task.visualStyle, task.composition, task.dimensions, task.background].every(nonEmptyString)) return null;
  if (!isStringList(task.positiveConstraints) || !isStringList(task.negativeConstraints) || !isStringList(task.referenceAssets) || !isStringList(task.assumptions)) return null;
  if (typeof task.outputVariants !== "number" || !Number.isInteger(task.outputVariants) || task.outputVariants < 1 || task.outputVariants > 8) return null;

  let animationSpecification: AnimationSpecification | null = null;
  if (task.animationSpecification !== null) {
    if (!isExactObject(task.animationSpecification, animationKeys)) return null;
    const animation = task.animationSpecification;
    if (!nonEmptyString(animation.animationType) || typeof animation.frameCount !== "number" || !Number.isInteger(animation.frameCount) || animation.frameCount < 1 || typeof animation.looping !== "boolean" || typeof animation.cameraMovementAllowed !== "boolean" || typeof animation.projectileAllowed !== "boolean" || !nonEmptyString(animation.motionDescription)) return null;
    animationSpecification = {
      animationType: animation.animationType.trim(), frameCount: animation.frameCount, looping: animation.looping,
      cameraMovementAllowed: animation.cameraMovementAllowed, projectileAllowed: animation.projectileAllowed,
      motionDescription: animation.motionDescription.trim(),
    };
  }

  if (task.provider === "RIKA_ANIMATION" && (task.operation !== "animate" || !animationSpecification)) return null;
  if (task.provider === "GENERIC_IMAGE" && animationSpecification) return null;
  const clean = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);
  const rikaOptions = animationSpecification ? {
    animationType: animationSpecification.animationType,
    frameCount: animationSpecification.frameCount,
    cameraMovementAllowed: animationSpecification.cameraMovementAllowed,
    projectileAllowed: animationSpecification.projectileAllowed,
    playback: animationSpecification.looping ? "LOOP" as const : "ONE_SHOT" as const,
    constraints: [...clean(task.positiveConstraints), ...clean(task.negativeConstraints).map((item) => `Avoid: ${item}`), animationSpecification.motionDescription].join("; "),
  } : null;

  return {
    provider: task.provider, operation: task.operation, assetKind: (task.assetKind as string).trim(), visualSubject: (task.visualSubject as string).trim(), visualStyle: (task.visualStyle as string).trim(), composition: (task.composition as string).trim(), dimensions: (task.dimensions as string).trim(), background: (task.background as string).trim(), animationSpecification,
    positiveConstraints: clean(task.positiveConstraints), negativeConstraints: clean(task.negativeConstraints), referenceAssets: clean(task.referenceAssets), outputVariants: task.outputVariants, assumptions: clean(task.assumptions),
    userRequest: originalRequest.trim(), rikaOptions,
  };
}
