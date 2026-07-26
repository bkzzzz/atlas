// The selected mode is deliberately explicit. Atlas currently executes only
// one still image flow; the other labels are UI choices, not future pipelines.
export const TASK_MODES = [
  "STATIC_IMAGE",
  "ANIMATION",
  "EDIT_IMAGE",
  "ASSET_SET",
  "THREE_D_ASSET",
] as const;

export type TaskMode = (typeof TASK_MODES)[number];

export const MAX_NATURAL_LANGUAGE_REQUEST_LENGTH = 4_000;

export const STATIC_IMAGE_VISUAL_STYLES = [
  "PIXEL_ART",
  "VECTOR_STYLE",
  "ILLUSTRATION",
] as const;
export const STATIC_IMAGE_VIEW_ANGLES = [
  "SIDE",
  "FRONT",
  "TOP_DOWN",
  "ISOMETRIC",
  "THREE_QUARTER",
  "UNSPECIFIED",
] as const;
export const STATIC_IMAGE_BACKGROUNDS = [
  "TRANSPARENT",
  "WHITE",
  "SIMPLE_SOLID",
  "UNSPECIFIED",
] as const;
export const PIXEL_ART_DETAILS = ["LOW", "MEDIUM", "HIGH"] as const;
export const GROUND_SHADOW_OPTIONS = ["ALLOW", "NONE"] as const;

export type StaticImageVisualStyle = (typeof STATIC_IMAGE_VISUAL_STYLES)[number];
export type StaticImageViewAngle = (typeof STATIC_IMAGE_VIEW_ANGLES)[number];
export type StaticImageBackground = (typeof STATIC_IMAGE_BACKGROUNDS)[number];
export type PixelArtDetail = (typeof PIXEL_ART_DETAILS)[number];
export type GroundShadowOption = (typeof GROUND_SHADOW_OPTIONS)[number];

// These are explicit creation constraints, not model-selected metadata. The
// browser sends them with the request and the deterministic compiler gives
// them priority over any conflicting wording in the natural-language input.
export type StaticImageAssetSettings = {
  visualStyle: StaticImageVisualStyle;
  viewAngle: StaticImageViewAngle;
  background: StaticImageBackground;
  pixelDetail: PixelArtDetail;
  groundShadow: GroundShadowOption;
};

export const DEFAULT_STATIC_IMAGE_ASSET_SETTINGS: StaticImageAssetSettings = {
  visualStyle: "ILLUSTRATION",
  viewAngle: "UNSPECIFIED",
  background: "TRANSPARENT",
  pixelDetail: "MEDIUM",
  groundShadow: "NONE",
};

const unsupportedMessages: Record<Exclude<TaskMode, "STATIC_IMAGE">, string> = {
  ANIMATION: "Animation generation is not supported yet.",
  EDIT_IMAGE: "Image editing is not supported yet.",
  ASSET_SET: "Asset-set generation is not supported yet.",
  THREE_D_ASSET: "3D generation is not supported yet.",
};

export function isTaskMode(value: unknown): value is TaskMode {
  return typeof value === "string" && (TASK_MODES as readonly string[]).includes(value);
}

export function isSupportedTaskMode(mode: TaskMode): mode is "STATIC_IMAGE" {
  return mode === "STATIC_IMAGE";
}

export function unsupportedMessageForTaskMode(mode: TaskMode): string | null {
  return isSupportedTaskMode(mode) ? null : unsupportedMessages[mode];
}

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

export function isStaticImageAssetSettings(value: unknown): value is StaticImageAssetSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return (
    Object.keys(settings).length === 5 &&
    isOneOf(settings.visualStyle, STATIC_IMAGE_VISUAL_STYLES) &&
    isOneOf(settings.viewAngle, STATIC_IMAGE_VIEW_ANGLES) &&
    isOneOf(settings.background, STATIC_IMAGE_BACKGROUNDS) &&
    isOneOf(settings.pixelDetail, PIXEL_ART_DETAILS) &&
    isOneOf(settings.groundShadow, GROUND_SHADOW_OPTIONS)
  );
}

export type StaticImageModeResult<T> =
  | { supported: true; value: T }
  | { supported: false; error: string };

// This is the single executable-mode gate used by the parse route. Keeping
// the callback here makes the zero-work behavior of unsupported modes easy to
// verify without introducing parsers, adapters, or routes for future modes.
export async function runStaticImageMode<T>(
  mode: TaskMode,
  runStaticImageFlow: () => Promise<T>,
): Promise<StaticImageModeResult<T>> {
  const error = unsupportedMessageForTaskMode(mode);
  if (error) return { supported: false, error };

  return { supported: true, value: await runStaticImageFlow() };
}

export type ValidParseTaskRequest = {
  selectedMode: TaskMode;
  request: string;
  assetSettings: StaticImageAssetSettings;
  styleSourceCharacterId: string | null;
};

export type ParseTaskRequestValidation =
  | { valid: true; value: ValidParseTaskRequest }
  | { valid: false; error: string };

// This pure boundary runs before database or provider work so unsupported
// modes and malformed requests cannot accidentally start an external call.
export function validateParseTaskRequest(value: unknown): ParseTaskRequestValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, error: "A valid mode and natural-language request are required." };
  }

  const body = value as Record<string, unknown>;
  if (!isTaskMode(body.selectedMode)) {
    return { valid: false, error: "Select a valid creation mode." };
  }
  if (typeof body.request !== "string") {
    return { valid: false, error: "A natural-language art request is required." };
  }
  if (!isStaticImageAssetSettings(body.assetSettings)) {
    return { valid: false, error: "Choose valid static image asset settings." };
  }
  if (
    body.styleSourceCharacterId !== undefined &&
    body.styleSourceCharacterId !== null &&
    (typeof body.styleSourceCharacterId !== "string" || !body.styleSourceCharacterId.trim())
  ) {
    return { valid: false, error: "Choose a valid style source character." };
  }

  const request = body.request.trim();
  if (!request || request.length > MAX_NATURAL_LANGUAGE_REQUEST_LENGTH) {
    return { valid: false, error: "Enter a non-empty art request within the supported length." };
  }

  return {
    valid: true,
    value: {
      selectedMode: body.selectedMode,
      request,
      assetSettings: body.assetSettings,
      styleSourceCharacterId:
        typeof body.styleSourceCharacterId === "string"
          ? body.styleSourceCharacterId.trim()
          : null,
    },
  };
}
