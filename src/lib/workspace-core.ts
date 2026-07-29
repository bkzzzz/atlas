import type {
  GameBrief,
  ReferenceItem,
  StyleSpec,
} from "@/lib/art-direction-core";

export const WORKSPACE_ID = "atlas-default-workspace";
export const WORKSPACE_WIDTH = 1600;
export const WORKSPACE_HEIGHT = 1000;
export const MIN_NODE_SIZE = 24;
export const MAX_WORKSPACE_ASSET_BYTES = 10 * 1024 * 1024;
export const MAX_WORKSPACE_NODES = 200;
export const MAX_WORKSPACE_IMAGE_DIMENSION = 8192;
export const MAX_WORKSPACE_IMAGE_PIXELS = 16_000_000;
export const MAX_WORKSPACE_OPERATION_PARAMETERS_LENGTH = 2048;
export const WORKSPACE_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type WorkspaceNodeKind = "IMAGE" | "RECTANGLE";
export type WorkspaceAssetOperation =
  | "REPLACE"
  | "CROP"
  | "REMOVE_SOLID_BACKGROUND";
export type WorkspaceOperationParameters =
  | { fit: "contain" }
  | { x: number; y: number; width: number; height: number }
  | {
      method: "border-flood-fill";
      tolerance: number;
      removedPixelCount: number;
      borderMatchRatio: number;
      backgroundColor: string | null;
    };
export type WorkspaceLayerAction =
  | "BRING_FORWARD"
  | "BRING_TO_FRONT"
  | "SEND_BACKWARD"
  | "SEND_TO_BACK";

export type WorkspaceNode = {
  id: string;
  assetId: string | null;
  assetUrl: string | null;
  assetSource: string | null;
  assetOperation: WorkspaceAssetOperation | null;
  parentAssetId: string | null;
  mimeType: string | null;
  operationParameters: WorkspaceOperationParameters | null;
  pixelWidth: number;
  pixelHeight: number;
  kind: WorkspaceNodeKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  // Rotation remains in the stored shape so older workspaces render faithfully,
  // but the current product does not expose rotation editing.
  rotation: number;
  opacity: number;
  color: string;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  aspectLocked: boolean;
  styleSpecId: string | null;
  referenceIds: string[];
};

export type WorkspaceMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  nodeId: string | null;
  createdAt: string;
};

export type WorkspacePayload = {
  id: string;
  name: string;
  width: number;
  height: number;
  brief: GameBrief;
  selectedReferenceIds: string[];
  references: ReferenceItem[];
  styleSpecs: StyleSpec[];
  currentStyleSpecId: string | null;
  nodes: WorkspaceNode[];
  messages: WorkspaceMessage[];
  developmentFeatures: {
    solidBackgroundRemoval: boolean;
  };
};

export type WorkspaceNodePatch = Partial<
  Pick<
    WorkspaceNode,
    | "x"
    | "y"
    | "width"
    | "height"
    | "opacity"
    | "color"
    | "name"
    | "locked"
    | "visible"
    | "aspectLocked"
    | "styleSpecId"
    | "referenceIds"
  >
> & {
  layerAction?: WorkspaceLayerAction;
};

export type WorkspaceNodeSnapshot = Pick<
  WorkspaceNode,
  | "id"
  | "assetId"
  | "kind"
  | "name"
  | "x"
  | "y"
  | "width"
  | "height"
  | "rotation"
  | "opacity"
  | "color"
  | "zIndex"
  | "locked"
  | "visible"
  | "aspectLocked"
  | "styleSpecId"
  | "referenceIds"
>;

export class WorkspaceInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 | 413 | 415 = 400,
  ) {
    super(message);
  }
}

const PATCH_FIELDS = new Set([
  "x",
  "y",
  "width",
  "height",
  "opacity",
  "color",
  "name",
  "locked",
  "visible",
  "aspectLocked",
  "styleSpecId",
  "referenceIds",
  "layerAction",
]);

const LAYER_ACTIONS = new Set<WorkspaceLayerAction>([
  "BRING_FORWARD",
  "BRING_TO_FRONT",
  "SEND_BACKWARD",
  "SEND_TO_BACK",
]);

const SNAPSHOT_FIELDS = new Set([
  "id",
  "assetId",
  "kind",
  "name",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "opacity",
  "color",
  "zIndex",
  "locked",
  "visible",
  "aspectLocked",
  "styleSpecId",
  "referenceIds",
]);

function finiteNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WorkspaceInputError(`${field} must be a finite number.`);
  }
  return value;
}

function boundedSize(value: unknown, field: "width" | "height") {
  const parsed = finiteNumber(value, field);
  const maximum = field === "width" ? WORKSPACE_WIDTH : WORKSPACE_HEIGHT;
  if (parsed < MIN_NODE_SIZE || parsed > maximum) {
    throw new WorkspaceInputError(
      `${field} must be between ${MIN_NODE_SIZE} and ${maximum}.`,
    );
  }
  return parsed;
}

function booleanValue(value: unknown, field: string) {
  if (typeof value !== "boolean") {
    throw new WorkspaceInputError(`${field} must be true or false.`);
  }
  return value;
}

function nullableId(value: unknown, field: string) {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new WorkspaceInputError(`${field} must be a valid ID or null.`);
  }
  const id = value.trim();
  if (id.length < 1 || id.length > 120) {
    throw new WorkspaceInputError(`${field} must be a valid ID or null.`);
  }
  return id;
}

function strictObject(
  value: unknown,
  expectedFields: readonly string[],
  label: string,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspaceInputError(`${label} must be a JSON object.`);
  }
  const input = value as Record<string, unknown>;
  const actualFields = Object.keys(input).sort();
  const sortedExpected = [...expectedFields].sort();
  if (
    actualFields.length !== sortedExpected.length ||
    actualFields.some((field, index) => field !== sortedExpected[index])
  ) {
    throw new WorkspaceInputError(
      `${label} must contain exactly: ${expectedFields.join(", ")}.`,
    );
  }
  return input;
}

function parameterNumber(
  value: unknown,
  field: string,
  options: {
    integer?: boolean;
    minimum: number;
    maximum?: number;
  },
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (options.integer && !Number.isInteger(value)) ||
    value < options.minimum ||
    (options.maximum !== undefined && value > options.maximum)
  ) {
    const maximum =
      options.maximum === undefined ? "" : ` and ${options.maximum}`;
    throw new WorkspaceInputError(
      `${field} must be ${options.integer ? "an integer" : "a number"} between ${options.minimum}${maximum}.`,
    );
  }
  return value;
}

export function parseWorkspaceOperationParameters(
  operation: WorkspaceAssetOperation,
  value: unknown,
): WorkspaceOperationParameters {
  if (operation === "REPLACE") {
    const input = strictObject(value, ["fit"], "Replace parameters");
    if (input.fit !== "contain") {
      throw new WorkspaceInputError('Replace fit must be "contain".');
    }
    return { fit: "contain" };
  }

  if (operation === "CROP") {
    const input = strictObject(
      value,
      ["x", "y", "width", "height"],
      "Crop parameters",
    );
    const x = parameterNumber(input.x, "Crop x", {
      minimum: 0,
      maximum: 1,
    });
    const y = parameterNumber(input.y, "Crop y", {
      minimum: 0,
      maximum: 1,
    });
    const width = parameterNumber(input.width, "Crop width", {
      minimum: Number.EPSILON,
      maximum: 1,
    });
    const height = parameterNumber(input.height, "Crop height", {
      minimum: Number.EPSILON,
      maximum: 1,
    });
    if (x + width > 1 + Number.EPSILON || y + height > 1 + Number.EPSILON) {
      throw new WorkspaceInputError(
        "Crop parameters must stay within the source image.",
      );
    }
    const normalizedWidth = Math.min(width, 1 - x);
    const normalizedHeight = Math.min(height, 1 - y);
    if (normalizedWidth <= 0 || normalizedHeight <= 0) {
      throw new WorkspaceInputError(
        "Crop parameters must cover a positive area within the source image.",
      );
    }
    return {
      x,
      y,
      width: normalizedWidth,
      height: normalizedHeight,
    };
  }

  const input = strictObject(
    value,
    [
      "method",
      "tolerance",
      "removedPixelCount",
      "borderMatchRatio",
      "backgroundColor",
    ],
    "Background-removal parameters",
  );
  if (input.method !== "border-flood-fill") {
    throw new WorkspaceInputError(
      'Background-removal method must be "border-flood-fill".',
    );
  }
  const tolerance = parameterNumber(input.tolerance, "Tolerance", {
    integer: true,
    minimum: 0,
    maximum: 255,
  });
  const removedPixelCount = parameterNumber(
    input.removedPixelCount,
    "Removed pixel count",
    {
      integer: true,
      minimum: 0,
      maximum: MAX_WORKSPACE_IMAGE_PIXELS,
    },
  );
  const borderMatchRatio = parameterNumber(
    input.borderMatchRatio,
    "Border match ratio",
    { minimum: 0, maximum: 1 },
  );
  if (
    input.backgroundColor !== null &&
    (typeof input.backgroundColor !== "string" ||
      !/^#[0-9a-f]{6}$/iu.test(input.backgroundColor))
  ) {
    throw new WorkspaceInputError(
      "Background color must be a six-digit hex value or null.",
    );
  }
  return {
    method: "border-flood-fill",
    tolerance,
    removedPixelCount,
    borderMatchRatio,
    backgroundColor:
      typeof input.backgroundColor === "string"
        ? input.backgroundColor.toLowerCase()
        : null,
  };
}

export function assertWorkspaceNodePatchAllowed(
  locked: boolean,
  patch: WorkspaceNodePatch,
) {
  if (!locked) return;
  const allowed = Object.keys(patch).every(
    (field) =>
      field === "visible" ||
      (field === "locked" && patch.locked === false),
  );
  if (!allowed) {
    throw new WorkspaceInputError(
      "Unlock the layer before changing it.",
      409,
    );
  }
}

export function parseReferenceIds(value: unknown, maximum = 3) {
  if (!Number.isInteger(maximum) || maximum < 0) {
    throw new RangeError("The reference limit must be a non-negative integer.");
  }
  if (!Array.isArray(value) || value.length > maximum) {
    throw new WorkspaceInputError(`Choose at most ${maximum} reference sources.`);
  }
  const ids = value.map((item) => {
    if (typeof item !== "string") {
      throw new WorkspaceInputError("Reference IDs must be valid strings.");
    }
    const id = item.trim();
    if (id.length < 1 || id.length > 120) {
      throw new WorkspaceInputError("Reference IDs must be valid strings.");
    }
    return id;
  });
  if (new Set(ids).size !== ids.length) {
    throw new WorkspaceInputError("Reference IDs must be unique.");
  }
  return ids;
}

export function validateWorkspaceImageDimensions(
  width: unknown,
  height: unknown,
) {
  const dimensions = [
    ["width", width],
    ["height", height],
  ] as const;
  for (const [name, value] of dimensions) {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > MAX_WORKSPACE_IMAGE_DIMENSION
    ) {
      throw new WorkspaceInputError(
        `The image ${name} must be between 1 and ${MAX_WORKSPACE_IMAGE_DIMENSION} pixels.`,
      );
    }
  }
  const pixelWidth = width as number;
  const pixelHeight = height as number;
  if (pixelWidth * pixelHeight > MAX_WORKSPACE_IMAGE_PIXELS) {
    throw new WorkspaceInputError(
      `Images may contain at most ${MAX_WORKSPACE_IMAGE_PIXELS.toLocaleString("en-US")} pixels.`,
    );
  }
  return { pixelWidth, pixelHeight };
}

export function parseWorkspaceNodePatch(value: unknown): WorkspaceNodePatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspaceInputError("Send a JSON object with the properties to update.");
  }

  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length === 0) {
    throw new WorkspaceInputError("Choose at least one property to update.");
  }
  for (const key of keys) {
    if (!PATCH_FIELDS.has(key)) {
      throw new WorkspaceInputError(`Unsupported workspace property: ${key}.`);
    }
  }

  const patch: WorkspaceNodePatch = {};
  if ("x" in input) patch.x = finiteNumber(input.x, "x");
  if ("y" in input) patch.y = finiteNumber(input.y, "y");
  if ("width" in input) patch.width = boundedSize(input.width, "width");
  if ("height" in input) patch.height = boundedSize(input.height, "height");
  if ("opacity" in input) {
    patch.opacity = finiteNumber(input.opacity, "opacity");
    if (patch.opacity < 0 || patch.opacity > 1) {
      throw new WorkspaceInputError("opacity must be between 0 and 1.");
    }
  }
  if ("color" in input) {
    if (typeof input.color !== "string" || !/^#[0-9a-f]{6}$/iu.test(input.color)) {
      throw new WorkspaceInputError("color must be a six-digit hex value.");
    }
    patch.color = input.color.toLowerCase();
  }
  if ("name" in input) {
    if (typeof input.name !== "string") {
      throw new WorkspaceInputError("Layer name must be text.");
    }
    const name = input.name.trim();
    if (!name || name.length > 80) {
      throw new WorkspaceInputError("Layer name must be 1–80 characters.");
    }
    patch.name = name;
  }
  if ("locked" in input) patch.locked = booleanValue(input.locked, "locked");
  if ("visible" in input) patch.visible = booleanValue(input.visible, "visible");
  if ("aspectLocked" in input) {
    patch.aspectLocked = booleanValue(input.aspectLocked, "aspectLocked");
  }
  if ("styleSpecId" in input) {
    patch.styleSpecId = nullableId(input.styleSpecId, "styleSpecId");
  }
  if ("referenceIds" in input) patch.referenceIds = parseReferenceIds(input.referenceIds);
  if ("layerAction" in input) {
    if (
      typeof input.layerAction !== "string" ||
      !LAYER_ACTIONS.has(input.layerAction as WorkspaceLayerAction)
    ) {
      throw new WorkspaceInputError("Choose a supported layer action.");
    }
    patch.layerAction = input.layerAction as WorkspaceLayerAction;
  }
  return patch;
}

export function orderedNodeIdsAfterAction(
  orderedIds: string[],
  targetId: string,
  action: WorkspaceLayerAction,
) {
  const currentIndex = orderedIds.indexOf(targetId);
  if (currentIndex === -1) {
    throw new WorkspaceInputError("The selected layer no longer exists.", 404);
  }

  const result = orderedIds.filter((id) => id !== targetId);
  if (action === "SEND_TO_BACK") {
    result.unshift(targetId);
  } else if (action === "BRING_TO_FRONT") {
    result.push(targetId);
  } else if (action === "SEND_BACKWARD") {
    result.splice(Math.max(0, currentIndex - 1), 0, targetId);
  } else {
    result.splice(Math.min(result.length, currentIndex + 1), 0, targetId);
  }
  return result;
}

export function workspaceNodeSnapshot(node: WorkspaceNode): WorkspaceNodeSnapshot {
  return {
    id: node.id,
    assetId: node.assetId,
    kind: node.kind,
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    rotation: node.rotation,
    opacity: node.opacity,
    color: node.color,
    zIndex: node.zIndex,
    locked: node.locked,
    visible: node.visible,
    aspectLocked: node.aspectLocked,
    styleSpecId: node.styleSpecId,
    referenceIds: [...node.referenceIds],
  };
}

export function parseWorkspaceNodeSnapshots(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_WORKSPACE_NODES) {
    throw new WorkspaceInputError(
      `A workspace may contain at most ${MAX_WORKSPACE_NODES} layers.`,
    );
  }
  const seen = new Set<string>();
  return value.map((item, index): WorkspaceNodeSnapshot => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new WorkspaceInputError("Every workspace layer must be an object.");
    }
    const node = item as Record<string, unknown>;
    for (const field of Object.keys(node)) {
      if (!SNAPSHOT_FIELDS.has(field)) {
        throw new WorkspaceInputError(
          `Unsupported stored workspace property: ${field}.`,
        );
      }
    }
    const id = nullableId(node.id, "id");
    if (!id || seen.has(id)) {
      throw new WorkspaceInputError("Every workspace layer must have a unique ID.");
    }
    seen.add(id);
    if (node.kind !== "IMAGE" && node.kind !== "RECTANGLE") {
      throw new WorkspaceInputError("Choose a supported workspace layer kind.");
    }
    const patch = parseWorkspaceNodePatch({
      name: node.name,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      opacity: node.opacity,
      color: node.color,
      locked: node.locked,
      visible: node.visible,
      aspectLocked: node.aspectLocked,
      styleSpecId: node.styleSpecId,
      referenceIds: node.referenceIds,
    });
    const rotation = finiteNumber(node.rotation, "rotation");
    if (rotation < -180 || rotation > 180) {
      throw new WorkspaceInputError("Stored rotation must be between -180 and 180.");
    }
    const assetId = nullableId(node.assetId, "assetId");
    if (node.kind === "IMAGE" && !assetId) {
      throw new WorkspaceInputError("Image layers must reference a stored asset.");
    }
    if (node.kind === "RECTANGLE" && assetId) {
      throw new WorkspaceInputError("Rectangle layers cannot reference image assets.");
    }
    return {
      id,
      assetId,
      kind: node.kind,
      name: patch.name!,
      x: patch.x!,
      y: patch.y!,
      width: patch.width!,
      height: patch.height!,
      rotation,
      opacity: patch.opacity!,
      color: patch.color!,
      zIndex: index,
      locked: patch.locked!,
      visible: patch.visible!,
      aspectLocked: patch.aspectLocked!,
      styleSpecId: patch.styleSpecId ?? null,
      referenceIds: patch.referenceIds!,
    };
  });
}

export function hasWorkspaceImageSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  return false;
}

export function generatedPngBytes(imageUrl: string) {
  const prefix = "data:image/png;base64,";
  if (!imageUrl.startsWith(prefix)) {
    throw new WorkspaceInputError("The generated image response was not a PNG.");
  }
  const encoded = imageUrl.slice(prefix.length);
  if (
    !encoded ||
    encoded.length % 4 !== 0 ||
    !/^(?:[a-z0-9+/]{4})*(?:[a-z0-9+/]{2}==|[a-z0-9+/]{3}=)?$/iu.test(
      encoded,
    )
  ) {
    throw new WorkspaceInputError("The generated image response was invalid.");
  }
  const bytes = Uint8Array.from(Buffer.from(encoded, "base64"));
  if (!hasWorkspaceImageSignature(bytes, "image/png")) {
    throw new WorkspaceInputError("The generated image response was not a valid PNG.");
  }
  return bytes;
}
