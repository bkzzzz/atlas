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

  const request = body.request.trim();
  if (!request || request.length > MAX_NATURAL_LANGUAGE_REQUEST_LENGTH) {
    return { valid: false, error: "Enter a non-empty art request within the supported length." };
  }

  return { valid: true, value: { selectedMode: body.selectedMode, request } };
}
