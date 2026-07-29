import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  artDirectionDraftChanged,
  createStyleSpec,
  type GameBrief,
  type ReferenceItem,
  type StyleSpec,
} from "@/lib/art-direction-core";
import { prisma } from "@/lib/prisma";
import { composeReferenceImages } from "@/lib/reference-compositor";
import { REFERENCE_LIBRARY } from "@/lib/reference-library";
import {
  assertWorkspaceNodePatchAllowed,
  hasWorkspaceImageSignature,
  MAX_WORKSPACE_ASSET_BYTES,
  MAX_WORKSPACE_NODES,
  MIN_NODE_SIZE,
  orderedNodeIdsAfterAction,
  parseReferenceIds,
  parseWorkspaceOperationParameters,
  parseWorkspaceNodeSnapshots,
  validateWorkspaceImageDimensions,
  WORKSPACE_IMAGE_TYPES,
  WORKSPACE_HEIGHT,
  WORKSPACE_ID,
  WORKSPACE_WIDTH,
  WorkspaceInputError,
  type WorkspaceAssetOperation,
  type WorkspaceNode,
  type WorkspaceNodePatch,
  type WorkspaceNodeSnapshot,
  type WorkspaceOperationParameters,
  type WorkspacePayload,
} from "@/lib/workspace-core";
import type { ForgeReferenceImage } from "@/lib/forge-request";

const nodeInclude = {
  asset: {
    select: {
      id: true,
      source: true,
      operation: true,
      operationParameters: true,
      parentAssetId: true,
      mimeType: true,
      pixelWidth: true,
      pixelHeight: true,
    },
  },
} as const;

type StoredNode = {
  id: string;
  assetId: string | null;
  asset: {
    id: string;
    source: string;
    operation: string | null;
    operationParameters: string | null;
    parentAssetId: string | null;
    mimeType: string;
    pixelWidth: number;
    pixelHeight: number;
  } | null;
  kind: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  color: string;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  aspectLocked: boolean;
  styleSpecId: string | null;
  referenceIds: string;
};

type StoredStyleSpec = {
  id: string;
  styleName: string;
  palette: string;
  lineStyle: string;
  lighting: string;
  materials: string;
  shapeLanguage: string;
  detailLevel: string;
  compositionNotes: string;
  referenceIds: string;
};

type StoredReference = {
  id: string;
  assetId: string | null;
  sourceKey: string;
  title: string;
  sourceName: string;
  sourceUrl: string | null;
  license: string | null;
  imageUrl: string | null;
  palette: string;
  traits: string;
  description: string;
};

function stringList(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((item) => {
      if (typeof item !== "string") return [];
      const normalized = item.trim();
      if (!normalized || seen.has(normalized)) return [];
      seen.add(normalized);
      return [normalized];
    });
  } catch {
    return [];
  }
}

function styleSpecDto(row: StoredStyleSpec): StyleSpec {
  return {
    id: row.id,
    styleName: row.styleName,
    palette: stringList(row.palette),
    lineStyle: row.lineStyle,
    lighting: row.lighting,
    materials: stringList(row.materials),
    shapeLanguage: row.shapeLanguage,
    detailLevel: row.detailLevel,
    compositionNotes: stringList(row.compositionNotes),
    referenceIds: stringList(row.referenceIds),
  };
}

function storedAssetOperation(value: string | null) {
  if (
    value === "REPLACE" ||
    value === "CROP" ||
    value === "REMOVE_SOLID_BACKGROUND"
  ) {
    return value satisfies WorkspaceAssetOperation;
  }
  return null;
}

function storedOperationParameters(
  operationValue: string | null,
  value: string | null,
) {
  const operation = storedAssetOperation(operationValue);
  if (!operation || !value) return null;
  try {
    return parseWorkspaceOperationParameters(operation, JSON.parse(value));
  } catch {
    return null;
  }
}

function customReferenceDto(row: StoredReference): ReferenceItem {
  return {
    id: row.sourceKey,
    title: row.title,
    imageUrl:
      row.assetId !== null
        ? `/api/workspace/assets/${encodeURIComponent(row.assetId)}/file`
        : (row.imageUrl ?? ""),
    sourceName: row.sourceName,
    ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
    ...(row.license ? { license: row.license } : {}),
    palette: stringList(row.palette),
    traits: stringList(row.traits),
    description: row.description,
    styleHints: {
      lineStyle: "Follow the uploaded reference’s contour and edge treatment",
      lighting: "Follow the uploaded reference’s dominant lighting structure",
      materials: ["materials visible in the uploaded reference"],
      shapeLanguage: "Follow the uploaded reference’s dominant shape language",
      detailLevel: "Match the uploaded reference’s apparent level of detail",
      compositionNotes: [
        "Use the uploaded image as visual guidance without reproducing it verbatim.",
      ],
    },
  };
}

export async function ensureWorkspace() {
  return prisma.workspaceDocument.upsert({
    where: { id: WORKSPACE_ID },
    update: {},
    create: { id: WORKSPACE_ID, name: "Untitled game" },
  });
}

export function workspaceNodeDto(node: StoredNode): WorkspaceNode {
  if (node.kind !== "IMAGE" && node.kind !== "RECTANGLE") {
    throw new Error(`Unsupported stored workspace layer kind: ${node.kind}.`);
  }
  return {
    id: node.id,
    assetId: node.assetId,
    assetUrl: node.asset
      ? `/api/workspace/assets/${encodeURIComponent(node.asset.id)}/file`
      : null,
    assetSource: node.asset?.source ?? null,
    assetOperation: storedAssetOperation(node.asset?.operation ?? null),
    parentAssetId: node.asset?.parentAssetId ?? null,
    mimeType: node.asset?.mimeType ?? null,
    operationParameters: storedOperationParameters(
      node.asset?.operation ?? null,
      node.asset?.operationParameters ?? null,
    ),
    pixelWidth: node.asset?.pixelWidth ?? 0,
    pixelHeight: node.asset?.pixelHeight ?? 0,
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
    referenceIds: stringList(node.referenceIds),
  };
}

export async function readWorkspace(): Promise<WorkspacePayload> {
  await ensureWorkspace();
  const document = await prisma.workspaceDocument.findUniqueOrThrow({
    where: { id: WORKSPACE_ID },
    include: {
      nodes: {
        include: nodeInclude,
        orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      },
      messages: { orderBy: [{ createdAt: "asc" }, { role: "desc" }] },
      references: { orderBy: { createdAt: "asc" } },
      styleSpecs: { orderBy: { createdAt: "asc" } },
    },
  });
  const references = [
    ...REFERENCE_LIBRARY,
    ...document.references.map(customReferenceDto),
  ];
  const knownReferenceIds = new Set(references.map((item) => item.id));

  return {
    id: document.id,
    name: document.name,
    width: WORKSPACE_WIDTH,
    height: WORKSPACE_HEIGHT,
    brief: {
      description: document.gameDescription,
      genre: document.genre,
      mood: document.mood,
      targetPlatform: document.targetPlatform,
      assetType: document.assetType,
    },
    selectedReferenceIds: stringList(document.selectedReferenceIds).filter((id) =>
      knownReferenceIds.has(id),
    ),
    references,
    styleSpecs: document.styleSpecs.map(styleSpecDto),
    currentStyleSpecId: document.styleSpecs.some(
      (styleSpec) => styleSpec.id === document.currentStyleSpecId,
    )
      ? document.currentStyleSpecId
      : null,
    nodes: document.nodes.map(workspaceNodeDto),
    messages: document.messages.map((message) => ({
      id: message.id,
      role: message.role === "ASSISTANT" ? "ASSISTANT" : "USER",
      content: message.content,
      nodeId: message.nodeId,
      createdAt: message.createdAt.toISOString(),
    })),
    developmentFeatures: {
      solidBackgroundRemoval: process.env.NODE_ENV === "development",
    },
  };
}

function insertionPoint(count: number) {
  const offset = (count % 8) * 28;
  return { x: 180 + offset, y: 120 + offset };
}

async function nextNodePlacement() {
  await ensureWorkspace();
  const [count, highest] = await Promise.all([
    prisma.workspaceNode.count({ where: { documentId: WORKSPACE_ID } }),
    prisma.workspaceNode.aggregate({
      where: { documentId: WORKSPACE_ID },
      _max: { zIndex: true },
    }),
  ]);
  if (count >= MAX_WORKSPACE_NODES) {
    throw new WorkspaceInputError(
      `A workspace may contain at most ${MAX_WORKSPACE_NODES} layers.`,
    );
  }
  return { ...insertionPoint(count), zIndex: (highest._max.zIndex ?? -1) + 1 };
}

export async function createRectangleNode() {
  const placement = await nextNodePlacement();
  const node = await prisma.workspaceNode.create({
    data: {
      documentId: WORKSPACE_ID,
      kind: "RECTANGLE",
      name: "Rectangle",
      width: 240,
      height: 180,
      color: "#6d5dfc",
      opacity: 1,
      rotation: 0,
      locked: false,
      visible: true,
      aspectLocked: false,
      referenceIds: "[]",
      ...placement,
    },
    include: nodeInclude,
  });
  return workspaceNodeDto(node);
}

type WorkspaceImageBytesInput = {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
};

type WorkspacePixelDimensions =
  | {
      pixelWidth: number;
      pixelHeight: number;
      width?: never;
      height?: never;
    }
  | {
      width: number;
      height: number;
      pixelWidth?: never;
      pixelHeight?: never;
    };

type CreateImageNodeInput = WorkspaceImageBytesInput &
  WorkspacePixelDimensions & {
  source: "UPLOAD" | "AI";
  prompt?: string | null;
  styleSpecId?: string | null;
  referenceIds?: string[];
  conversation?: {
    user: string;
    assistant: string;
  };
};

function validatedImageBytes(input: WorkspaceImageBytesInput) {
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
    throw new WorkspaceInputError("The image is empty.");
  }
  if (input.bytes.byteLength > MAX_WORKSPACE_ASSET_BYTES) {
    throw new WorkspaceInputError("Images must be 10 MB or smaller.", 413);
  }
  if (!(WORKSPACE_IMAGE_TYPES as readonly string[]).includes(input.mimeType)) {
    throw new WorkspaceInputError("Use a PNG, JPEG, or WebP image.", 415);
  }
  if (!hasWorkspaceImageSignature(input.bytes, input.mimeType)) {
    throw new WorkspaceInputError("The selected file is not a valid image.");
  }
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new WorkspaceInputError("The image must have a name.");
  return {
    name,
    mimeType: input.mimeType,
    bytes: Uint8Array.from(input.bytes),
  };
}

function pixelDimensionsFromInput(input: WorkspacePixelDimensions) {
  return validateWorkspaceImageDimensions(
    input.pixelWidth ?? input.width,
    input.pixelHeight ?? input.height,
  );
}

export async function createImageNode(input: CreateImageNodeInput) {
  const image = validatedImageBytes(input);
  const { pixelWidth, pixelHeight } = pixelDimensionsFromInput(input);
  await validateNodeAssociations({
    ...(input.styleSpecId !== undefined
      ? { styleSpecId: input.styleSpecId }
      : {}),
    ...(input.referenceIds !== undefined
      ? { referenceIds: input.referenceIds }
      : {}),
  });
  const placement = await nextNodePlacement();
  const longest = Math.max(pixelWidth, pixelHeight);
  const scale = longest > 360 ? 360 / longest : 1;
  const width = Math.max(MIN_NODE_SIZE, Math.round(pixelWidth * scale));
  const height = Math.max(MIN_NODE_SIZE, Math.round(pixelHeight * scale));

  return prisma.$transaction(async (transaction) => {
    const asset = await transaction.workspaceAsset.create({
      data: {
        documentId: WORKSPACE_ID,
        name: image.name,
        mimeType: image.mimeType,
        bytes: image.bytes,
        source: input.source,
        prompt: input.prompt ?? null,
        pixelWidth,
        pixelHeight,
      },
    });
    const node = await transaction.workspaceNode.create({
      data: {
        documentId: WORKSPACE_ID,
        assetId: asset.id,
        kind: "IMAGE",
        name: image.name,
        width,
        height,
        color: "#ffffff",
        opacity: 1,
        rotation: 0,
        locked: false,
        visible: true,
        aspectLocked: true,
        styleSpecId: input.styleSpecId ?? null,
        referenceIds: JSON.stringify(input.referenceIds ?? []),
        ...placement,
      },
      include: nodeInclude,
    });
    const messages = input.conversation
      ? [
          await transaction.workspaceMessage.create({
            data: {
              documentId: WORKSPACE_ID,
              assetId: asset.id,
              nodeId: node.id,
              role: "USER",
              content: input.conversation.user,
            },
          }),
          await transaction.workspaceMessage.create({
            data: {
              documentId: WORKSPACE_ID,
              assetId: asset.id,
              nodeId: node.id,
              role: "ASSISTANT",
              content: input.conversation.assistant,
            },
          }),
        ]
      : [];
    return {
      assetId: asset.id,
      node: workspaceNodeDto(node),
      messages: messages.map((message) => ({
        id: message.id,
        role:
          message.role === "ASSISTANT"
            ? ("ASSISTANT" as const)
            : ("USER" as const),
        content: message.content,
        nodeId: message.nodeId,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  });
}

function boundedBrief(input: unknown): GameBrief {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("A game brief is required.");
  }
  const source = input as Record<string, unknown>;
  const limits = {
    description: 600,
    genre: 80,
    mood: 80,
    targetPlatform: 80,
    assetType: 80,
  } as const;
  for (const field of Object.keys(source)) {
    if (!(field in limits)) {
      throw new WorkspaceInputError(`Unsupported game brief property: ${field}.`);
    }
  }
  return Object.fromEntries(
    Object.entries(limits).map(([field, maximum]) => {
      const value = source[field];
      const normalized =
        typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : null;
      if (normalized === null || normalized.length > maximum) {
        throw new WorkspaceInputError(
          `${field} must be ${maximum} characters or fewer.`,
        );
      }
      return [field, normalized];
    }),
  ) as GameBrief;
}

async function allWorkspaceReferences() {
  const custom = await prisma.workspaceReference.findMany({
    where: { documentId: WORKSPACE_ID },
    orderBy: { createdAt: "asc" },
  });
  return [...REFERENCE_LIBRARY, ...custom.map(customReferenceDto)];
}

export async function saveArtDirectionDraft(input: {
  brief: unknown;
  referenceIds: unknown;
}) {
  await ensureWorkspace();
  const brief = boundedBrief(input.brief);
  const referenceIds = parseReferenceIds(input.referenceIds);
  const references = await allWorkspaceReferences();
  const known = new Set(references.map((item) => item.id));
  if (referenceIds.some((id) => !known.has(id))) {
    throw new WorkspaceInputError(
      "One or more selected references are unavailable.",
    );
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const document = await prisma.workspaceDocument.findUniqueOrThrow({
      where: { id: WORKSPACE_ID },
      select: {
        gameDescription: true,
        genre: true,
        mood: true,
        targetPlatform: true,
        assetType: true,
        selectedReferenceIds: true,
        currentStyleSpecId: true,
        directionRevision: true,
      },
    });
    const changed = artDirectionDraftChanged(
      {
        description: document.gameDescription,
        genre: document.genre,
        mood: document.mood,
        targetPlatform: document.targetPlatform,
        assetType: document.assetType,
      },
      stringList(document.selectedReferenceIds),
      brief,
      referenceIds,
    );
    if (!changed) {
      return {
        brief,
        referenceIds,
        currentStyleSpecId: document.currentStyleSpecId,
        directionRevision: document.directionRevision,
      };
    }
    const updated = await prisma.workspaceDocument.updateMany({
      where: {
        id: WORKSPACE_ID,
        directionRevision: document.directionRevision,
      },
      data: {
        gameDescription: brief.description,
        genre: brief.genre,
        mood: brief.mood,
        targetPlatform: brief.targetPlatform,
        assetType: brief.assetType,
        selectedReferenceIds: JSON.stringify(referenceIds),
        currentStyleSpecId: null,
        directionRevision: { increment: 1 },
      },
    });
    if (updated.count === 1) {
      return {
        brief,
        referenceIds,
        currentStyleSpecId: null,
        directionRevision: document.directionRevision + 1,
      };
    }
  }
  throw new WorkspaceInputError(
    "The art-direction draft changed concurrently. Try saving it again.",
    409,
  );
}

export async function buildAndSaveStyleSpec(input: {
  brief: unknown;
  referenceIds: unknown;
}) {
  const { brief, referenceIds, directionRevision } =
    await saveArtDirectionDraft(input);
  const references = await allWorkspaceReferences();
  const byId = new Map(references.map((item) => [item.id, item]));
  const selected = referenceIds.map((id) => byId.get(id)).filter(Boolean) as ReferenceItem[];
  const styleSpec = createStyleSpec(brief, selected);
  await prisma.$transaction(async (transaction) => {
    await transaction.workspaceStyleSpec.upsert({
      where: { id: styleSpec.id },
      update: {},
      create: {
        id: styleSpec.id,
        documentId: WORKSPACE_ID,
        styleName: styleSpec.styleName,
        palette: JSON.stringify(styleSpec.palette),
        lineStyle: styleSpec.lineStyle,
        lighting: styleSpec.lighting,
        materials: JSON.stringify(styleSpec.materials),
        shapeLanguage: styleSpec.shapeLanguage,
        detailLevel: styleSpec.detailLevel,
        compositionNotes: JSON.stringify(styleSpec.compositionNotes),
        referenceIds: JSON.stringify(styleSpec.referenceIds),
      },
    });
    const activated = await transaction.workspaceDocument.updateMany({
      where: {
        id: WORKSPACE_ID,
        directionRevision,
        gameDescription: brief.description,
        genre: brief.genre,
        mood: brief.mood,
        targetPlatform: brief.targetPlatform,
        assetType: brief.assetType,
        selectedReferenceIds: JSON.stringify(referenceIds),
      },
      data: { currentStyleSpecId: styleSpec.id },
    });
    if (activated.count !== 1) {
      throw new WorkspaceInputError(
        "The art-direction draft changed while its StyleSpec was being built. Rebuild it before generating.",
        409,
      );
    }
  });
  return styleSpec;
}

export async function createCustomReference(input: {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
}) {
  const image = validatedImageBytes(input);
  const { pixelWidth, pixelHeight } = validateWorkspaceImageDimensions(
    input.pixelWidth,
    input.pixelHeight,
  );
  await ensureWorkspace();
  const id = `custom-${randomUUID()}`;
  const title =
    image.name.replace(/\.[^.]+$/u, "").trim().slice(0, 80) || "My reference";
  return prisma.$transaction(async (transaction) => {
    const asset = await transaction.workspaceAsset.create({
      data: {
        documentId: WORKSPACE_ID,
        name: image.name,
        mimeType: image.mimeType,
        bytes: image.bytes,
        source: "REFERENCE",
        pixelWidth,
        pixelHeight,
      },
    });
    const reference = await transaction.workspaceReference.create({
      data: {
        id,
        documentId: WORKSPACE_ID,
        assetId: asset.id,
        sourceKey: id,
        title,
        sourceName: "User upload",
        license: "User supplied",
        palette: "[]",
        traits: JSON.stringify(["user-supplied visual direction"]),
        description:
          "A user-supplied visual reference. Atlas uses its visible shapes, palette, materials, and lighting as art-direction guidance.",
      },
    });
    return customReferenceDto(reference);
  });
}

async function validateNodeAssociations(patch: WorkspaceNodePatch) {
  if (patch.styleSpecId) {
    const exists = await prisma.workspaceStyleSpec.count({
      where: { id: patch.styleSpecId, documentId: WORKSPACE_ID },
    });
    if (!exists) {
      throw new WorkspaceInputError("The selected StyleSpec no longer exists.");
    }
  }
  if (patch.referenceIds) {
    const known = new Set((await allWorkspaceReferences()).map((item) => item.id));
    if (patch.referenceIds.some((id) => !known.has(id))) {
      throw new WorkspaceInputError(
        "One or more reference sources no longer exist.",
      );
    }
  }
}

async function validateSnapshotAssociations(
  snapshots: readonly WorkspaceNodeSnapshot[],
) {
  const styleSpecIds = [
    ...new Set(
      snapshots
        .map((node) => node.styleSpecId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (styleSpecIds.length) {
    const available = await prisma.workspaceStyleSpec.findMany({
      where: {
        id: { in: styleSpecIds },
        documentId: WORKSPACE_ID,
      },
      select: { id: true },
    });
    if (available.length !== styleSpecIds.length) {
      throw new WorkspaceInputError(
        "History references a StyleSpec that no longer exists.",
      );
    }
  }

  const referenceIds = [
    ...new Set(snapshots.flatMap((node) => node.referenceIds)),
  ];
  if (referenceIds.length) {
    const known = new Set(
      (await allWorkspaceReferences()).map((reference) => reference.id),
    );
    if (referenceIds.some((id) => !known.has(id))) {
      throw new WorkspaceInputError(
        "History references a source reference that no longer exists.",
      );
    }
  }
}

export async function updateWorkspaceNode(id: string, patch: WorkspaceNodePatch) {
  await ensureWorkspace();
  const existing = await prisma.workspaceNode.findFirst({
    where: { id, documentId: WORKSPACE_ID },
    select: { locked: true },
  });
  if (!existing) return null;
  assertWorkspaceNodePatchAllowed(existing.locked, patch);
  await validateNodeAssociations(patch);
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.workspaceNode.findFirst({
      where: { id, documentId: WORKSPACE_ID },
    });
    if (!current) return null;
    assertWorkspaceNodePatchAllowed(current.locked, patch);

    if (patch.layerAction) {
      const siblings = await transaction.workspaceNode.findMany({
        where: { documentId: WORKSPACE_ID },
        select: { id: true },
        orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      });
      const orderedIds = orderedNodeIdsAfterAction(
        siblings.map((node) => node.id),
        id,
        patch.layerAction,
      );
      await Promise.all(
        orderedIds.map((nodeId, zIndex) =>
          transaction.workspaceNode.update({
            where: { id: nodeId },
            data: { zIndex },
          }),
        ),
      );
    }

    const width = patch.width ?? current.width;
    const height = patch.height ?? current.height;
    const updated = await transaction.workspaceNode.update({
      where: { id },
      data: {
        ...(patch.width !== undefined ? { width: patch.width } : {}),
        ...(patch.height !== undefined ? { height: patch.height } : {}),
        ...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.locked !== undefined ? { locked: patch.locked } : {}),
        ...(patch.visible !== undefined ? { visible: patch.visible } : {}),
        ...(patch.aspectLocked !== undefined
          ? { aspectLocked: patch.aspectLocked }
          : {}),
        ...(patch.styleSpecId !== undefined
          ? { styleSpecId: patch.styleSpecId }
          : {}),
        ...(patch.referenceIds !== undefined
          ? { referenceIds: JSON.stringify(patch.referenceIds) }
          : {}),
        ...(patch.x !== undefined
          ? { x: Math.min(Math.max(0, patch.x), WORKSPACE_WIDTH - width) }
          : patch.width !== undefined
            ? { x: Math.min(current.x, WORKSPACE_WIDTH - width) }
            : {}),
        ...(patch.y !== undefined
          ? { y: Math.min(Math.max(0, patch.y), WORKSPACE_HEIGHT - height) }
          : patch.height !== undefined
            ? { y: Math.min(current.y, WORKSPACE_HEIGHT - height) }
            : {}),
      },
      include: nodeInclude,
    });
    return workspaceNodeDto(updated);
  });
}

export async function duplicateWorkspaceNode(id: string) {
  await ensureWorkspace();
  const [source, count, highest] = await Promise.all([
    prisma.workspaceNode.findFirst({
      where: { id, documentId: WORKSPACE_ID },
    }),
    prisma.workspaceNode.count({ where: { documentId: WORKSPACE_ID } }),
    prisma.workspaceNode.aggregate({
      where: { documentId: WORKSPACE_ID },
      _max: { zIndex: true },
    }),
  ]);
  if (!source) return null;
  if (count >= MAX_WORKSPACE_NODES) {
    throw new WorkspaceInputError(
      `A workspace may contain at most ${MAX_WORKSPACE_NODES} layers.`,
    );
  }
  const width = source.width;
  const height = source.height;
  const duplicate = await prisma.workspaceNode.create({
    data: {
      documentId: WORKSPACE_ID,
      assetId: source.assetId,
      kind: source.kind,
      name: `${source.name} copy`.slice(0, 80),
      x: Math.min(source.x + 24, WORKSPACE_WIDTH - width),
      y: Math.min(source.y + 24, WORKSPACE_HEIGHT - height),
      width,
      height,
      rotation: source.rotation,
      opacity: source.opacity,
      color: source.color,
      zIndex: (highest._max.zIndex ?? -1) + 1,
      locked: false,
      visible: true,
      aspectLocked: source.aspectLocked,
      styleSpecId: source.styleSpecId,
      referenceIds: source.referenceIds,
    },
    include: nodeInclude,
  });
  return workspaceNodeDto(duplicate);
}

// Deletion removes only the placement. Immutable asset bytes are retained so
// client history can restore a deleted layer without losing its source.
export async function deleteWorkspaceNode(id: string) {
  await ensureWorkspace();
  return prisma.$transaction(async (transaction) => {
    const node = await transaction.workspaceNode.findFirst({
      where: { id, documentId: WORKSPACE_ID },
      select: { id: true, locked: true },
    });
    if (!node) return false;
    if (node.locked) {
      throw new WorkspaceInputError(
        "Unlock the layer before deleting it.",
        409,
      );
    }
    await transaction.workspaceNode.delete({ where: { id } });
    const remaining = await transaction.workspaceNode.findMany({
      where: { documentId: WORKSPACE_ID },
      select: { id: true },
      orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    await Promise.all(
      remaining.map((item, zIndex) =>
        transaction.workspaceNode.update({
          where: { id: item.id },
          data: { zIndex },
        }),
      ),
    );
    return true;
  });
}

export async function syncWorkspaceNodes(snapshots: WorkspaceNodeSnapshot[]) {
  await ensureWorkspace();
  const normalizedSnapshots = parseWorkspaceNodeSnapshots(snapshots);
  await validateSnapshotAssociations(normalizedSnapshots);
  const assetIds = [...new Set(
    normalizedSnapshots
      .map((node) => node.assetId)
      .filter((id): id is string => Boolean(id)),
  )];
  if (assetIds.length) {
    const available = await prisma.workspaceAsset.findMany({
      where: { id: { in: assetIds }, documentId: WORKSPACE_ID },
      select: { id: true },
    });
    if (available.length !== assetIds.length) {
      throw new WorkspaceInputError(
        "History references an asset that no longer exists.",
      );
    }
  }

  const snapshotIds = normalizedSnapshots.map((node) => node.id);
  if (snapshotIds.length) {
    const collisions = await prisma.workspaceNode.findMany({
      where: {
        id: { in: snapshotIds },
        documentId: { not: WORKSPACE_ID },
      },
      select: { id: true },
    });
    if (collisions.length) {
      throw new WorkspaceInputError(
        "History contains a layer ID owned by another workspace.",
      );
    }
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.workspaceNode.deleteMany({
      where: {
        documentId: WORKSPACE_ID,
        ...(snapshotIds.length ? { id: { notIn: snapshotIds } } : {}),
      },
    });
    for (const [zIndex, node] of normalizedSnapshots.entries()) {
      const data = {
        documentId: WORKSPACE_ID,
        assetId: node.assetId,
        kind: node.kind,
        name: node.name,
        x: Math.min(Math.max(0, node.x), WORKSPACE_WIDTH - node.width),
        y: Math.min(Math.max(0, node.y), WORKSPACE_HEIGHT - node.height),
        width: node.width,
        height: node.height,
        rotation: node.rotation,
        opacity: node.opacity,
        color: node.color,
        zIndex,
        locked: node.locked,
        visible: node.visible,
        aspectLocked: node.aspectLocked,
        styleSpecId: node.styleSpecId,
        referenceIds: JSON.stringify(node.referenceIds),
      };
      await transaction.workspaceNode.upsert({
        where: { id: node.id },
        update: data,
        create: { id: node.id, ...data },
      });
    }
  });

  const nodes = await prisma.workspaceNode.findMany({
    where: { documentId: WORKSPACE_ID },
    include: nodeInclude,
    orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  return nodes.map(workspaceNodeDto);
}

export async function replaceWorkspaceNodeAsset(input: {
  nodeId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  operation: WorkspaceAssetOperation;
  operationParameters: WorkspaceOperationParameters;
  displayWidth?: number;
  displayHeight?: number;
}) {
  const image = validatedImageBytes(input);
  const { pixelWidth, pixelHeight } = validateWorkspaceImageDimensions(
    input.pixelWidth,
    input.pixelHeight,
  );
  if (
    input.operation !== "REPLACE" &&
    input.operation !== "CROP" &&
    input.operation !== "REMOVE_SOLID_BACKGROUND"
  ) {
    throw new WorkspaceInputError("Choose a supported image operation.");
  }
  const operationParameters = parseWorkspaceOperationParameters(
    input.operation,
    input.operationParameters,
  );
  if (
    (input.displayWidth === undefined) !==
    (input.displayHeight === undefined)
  ) {
    throw new WorkspaceInputError(
      "Image display width and height must be updated together.",
    );
  }
  if (
    input.displayWidth !== undefined &&
    (!Number.isFinite(input.displayWidth) ||
      input.displayWidth < MIN_NODE_SIZE ||
      input.displayWidth > WORKSPACE_WIDTH)
  ) {
    throw new WorkspaceInputError(
      `Image display width must be between ${MIN_NODE_SIZE} and ${WORKSPACE_WIDTH}.`,
    );
  }
  if (
    input.displayHeight !== undefined &&
    (!Number.isFinite(input.displayHeight) ||
      input.displayHeight < MIN_NODE_SIZE ||
      input.displayHeight > WORKSPACE_HEIGHT)
  ) {
    throw new WorkspaceInputError(
      `Image display height must be between ${MIN_NODE_SIZE} and ${WORKSPACE_HEIGHT}.`,
    );
  }
  await ensureWorkspace();
  return prisma.$transaction(async (transaction) => {
    const node = await transaction.workspaceNode.findFirst({
      where: { id: input.nodeId, documentId: WORKSPACE_ID, kind: "IMAGE" },
    });
    if (!node) return null;
    if (node.locked) {
      throw new WorkspaceInputError(
        "Unlock the layer before replacing its image.",
        409,
      );
    }
    const asset = await transaction.workspaceAsset.create({
      data: {
        documentId: WORKSPACE_ID,
        name: image.name,
        mimeType: image.mimeType,
        bytes: image.bytes,
        source: "DERIVED",
        pixelWidth,
        pixelHeight,
        parentAssetId: node.assetId,
        operation: input.operation,
        operationParameters: JSON.stringify(operationParameters),
      },
    });
    const width = input.displayWidth ?? node.width;
    const height = input.displayHeight ?? node.height;
    const updated = await transaction.workspaceNode.update({
      where: { id: node.id },
      data: {
        assetId: asset.id,
        width,
        height,
        x: Math.max(0, Math.min(node.x, WORKSPACE_WIDTH - width)),
        y: Math.max(0, Math.min(node.y, WORKSPACE_HEIGHT - height)),
      },
      include: nodeInclude,
    });
    return workspaceNodeDto(updated);
  });
}

export async function artDirectionForGeneration(styleSpecId: string) {
  await ensureWorkspace();
  const [document, specRow, references] = await Promise.all([
    prisma.workspaceDocument.findUniqueOrThrow({ where: { id: WORKSPACE_ID } }),
    prisma.workspaceStyleSpec.findFirst({
      where: { id: styleSpecId, documentId: WORKSPACE_ID },
    }),
    allWorkspaceReferences(),
  ]);
  if (document.currentStyleSpecId !== styleSpecId) {
    throw new WorkspaceInputError(
      "The requested StyleSpec is no longer active. Rebuild the art direction before generating.",
      409,
    );
  }
  if (!specRow) return null;
  const styleSpec = styleSpecDto(specRow);
  const byId = new Map(references.map((item) => [item.id, item]));
  const selectedReferences = styleSpec.referenceIds
    .map((id) => byId.get(id))
    .filter(Boolean) as ReferenceItem[];
  if (selectedReferences.length !== styleSpec.referenceIds.length) {
    throw new WorkspaceInputError(
      "One or more references in the active StyleSpec are no longer available. Rebuild the art direction before generating.",
      409,
    );
  }
  return {
    brief: {
      description: document.gameDescription,
      genre: document.genre,
      mood: document.mood,
      targetPlatform: document.targetPlatform,
      assetType: document.assetType,
    } satisfies GameBrief,
    styleSpec,
    references: selectedReferences,
  };
}

export async function generationReferenceImage(
  references: ReferenceItem[],
): Promise<ForgeReferenceImage> {
  if (references.length < 1 || references.length > 3) {
    throw new WorkspaceInputError(
      "The active StyleSpec must have one to three available references.",
      409,
    );
  }
  const customIds = references
    .filter((reference) => reference.id.startsWith("custom-"))
    .map((reference) => reference.id);
  const customRows = customIds.length
    ? await prisma.workspaceReference.findMany({
        where: {
          sourceKey: { in: customIds },
          documentId: WORKSPACE_ID,
        },
        include: { asset: { select: { bytes: true, mimeType: true } } },
      })
    : [];
  const customById = new Map(
    customRows.map((reference) => [reference.sourceKey, reference]),
  );
  const imageBytes = await Promise.all(
    references.map(async (reference) => {
      if (reference.id.startsWith("custom-")) {
        const custom = customById.get(reference.id);
        if (
          !custom?.asset ||
          !["image/png", "image/jpeg", "image/webp"].includes(
            custom.asset.mimeType,
          )
        ) {
          throw new WorkspaceInputError(
            `Reference "${reference.title}" is no longer available.`,
            409,
          );
        }
        return Uint8Array.from(custom.asset.bytes);
      }
      if (!reference.imageUrl.startsWith("/references/")) {
        throw new WorkspaceInputError(
          `Reference "${reference.title}" cannot be loaded for generation.`,
          409,
        );
      }
      try {
        return Uint8Array.from(
          await readFile(
            path.join(
              process.cwd(),
              "public",
              reference.imageUrl.replace(/^\/+/u, ""),
            ),
          ),
        );
      } catch {
        throw new WorkspaceInputError(
          `Reference "${reference.title}" is no longer available.`,
          409,
        );
      }
    }),
  );
  const bytes = await composeReferenceImages(imageBytes);
  return {
    bytes: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
    mimeType: "image/png",
  };
}
