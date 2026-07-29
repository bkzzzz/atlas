export const WORKSPACE_ID = "atlas-default-workspace";
export const WORKSPACE_WIDTH = 1600;
export const WORKSPACE_HEIGHT = 1000;
export const MIN_NODE_SIZE = 24;
export const MAX_WORKSPACE_ASSET_BYTES = 10 * 1024 * 1024;
export const WORKSPACE_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type WorkspaceNodeKind = "IMAGE" | "RECTANGLE";
export type WorkspaceLayerAction =
  | "BRING_FORWARD"
  | "BRING_TO_FRONT"
  | "SEND_BACKWARD"
  | "SEND_TO_BACK";

export type WorkspaceNode = {
  id: string;
  assetId: string | null;
  assetUrl: string | null;
  kind: WorkspaceNodeKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  color: string;
  zIndex: number;
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
  nodes: WorkspaceNode[];
  messages: WorkspaceMessage[];
};

export type WorkspaceNodePatch = Partial<
  Pick<
    WorkspaceNode,
    "x" | "y" | "width" | "height" | "rotation" | "opacity" | "color"
  >
> & {
  layerAction?: WorkspaceLayerAction;
};

export class WorkspaceInputError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 413 | 415 = 400,
  ) {
    super(message);
  }
}

const PATCH_FIELDS = new Set([
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "opacity",
  "color",
  "layerAction",
]);

const LAYER_ACTIONS = new Set<WorkspaceLayerAction>([
  "BRING_FORWARD",
  "BRING_TO_FRONT",
  "SEND_BACKWARD",
  "SEND_TO_BACK",
]);

function finiteNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WorkspaceInputError(`${field} must be a finite number.`);
  }
  return value;
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
  if ("width" in input) {
    patch.width = finiteNumber(input.width, "width");
    if (patch.width < MIN_NODE_SIZE || patch.width > WORKSPACE_WIDTH) {
      throw new WorkspaceInputError(
        `width must be between ${MIN_NODE_SIZE} and ${WORKSPACE_WIDTH}.`,
      );
    }
  }
  if ("height" in input) {
    patch.height = finiteNumber(input.height, "height");
    if (patch.height < MIN_NODE_SIZE || patch.height > WORKSPACE_HEIGHT) {
      throw new WorkspaceInputError(
        `height must be between ${MIN_NODE_SIZE} and ${WORKSPACE_HEIGHT}.`,
      );
    }
  }
  if ("rotation" in input) {
    patch.rotation = finiteNumber(input.rotation, "rotation");
    if (patch.rotation < -180 || patch.rotation > 180) {
      throw new WorkspaceInputError("rotation must be between -180 and 180.");
    }
  }
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
  if (!encoded || !/^[a-z0-9+/]+={0,2}$/iu.test(encoded)) {
    throw new WorkspaceInputError("The generated image response was invalid.");
  }
  return Uint8Array.from(Buffer.from(encoded, "base64"));
}
