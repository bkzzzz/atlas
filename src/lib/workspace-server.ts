import "server-only";
import { prisma } from "@/lib/prisma";
import {
  MIN_NODE_SIZE,
  orderedNodeIdsAfterAction,
  WORKSPACE_HEIGHT,
  WORKSPACE_ID,
  WORKSPACE_WIDTH,
  type WorkspaceNode,
  type WorkspaceNodePatch,
  type WorkspacePayload,
} from "@/lib/workspace-core";

const nodeInclude = {
  asset: { select: { id: true } },
} as const;

type StoredNode = Awaited<ReturnType<typeof prisma.workspaceNode.findFirstOrThrow>> & {
  asset?: { id: string } | null;
};

export async function ensureWorkspace() {
  return prisma.workspaceDocument.upsert({
    where: { id: WORKSPACE_ID },
    update: {},
    create: { id: WORKSPACE_ID, name: "Untitled game" },
  });
}

export function workspaceNodeDto(node: StoredNode): WorkspaceNode {
  return {
    id: node.id,
    assetId: node.assetId,
    assetUrl: node.assetId
      ? `/api/workspace/assets/${encodeURIComponent(node.assetId)}/file`
      : null,
    kind: node.kind === "IMAGE" ? "IMAGE" : "RECTANGLE",
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    rotation: node.rotation,
    opacity: node.opacity,
    color: node.color,
    zIndex: node.zIndex,
  };
}

export async function readWorkspace(): Promise<WorkspacePayload> {
  await ensureWorkspace();
  const document = await prisma.workspaceDocument.findUniqueOrThrow({
    where: { id: WORKSPACE_ID },
    include: {
      nodes: { include: nodeInclude, orderBy: { zIndex: "asc" } },
      messages: { orderBy: [{ createdAt: "asc" }, { role: "desc" }] },
    },
  });

  return {
    id: document.id,
    name: document.name,
    width: WORKSPACE_WIDTH,
    height: WORKSPACE_HEIGHT,
    nodes: document.nodes.map(workspaceNodeDto),
    messages: document.messages.map((message) => ({
      id: message.id,
      role: message.role === "ASSISTANT" ? "ASSISTANT" : "USER",
      content: message.content,
      nodeId: message.nodeId,
      createdAt: message.createdAt.toISOString(),
    })),
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
      ...placement,
    },
    include: nodeInclude,
  });
  return workspaceNodeDto(node);
}

export async function createImageNode(input: {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  source: "UPLOAD" | "AI";
  prompt?: string | null;
  conversation?: {
    user: string;
    assistant: string;
  };
}) {
  const placement = await nextNodePlacement();
  const longest = Math.max(input.width, input.height);
  const scale = longest > 360 ? 360 / longest : 1;
  const width = Math.max(MIN_NODE_SIZE, Math.round(input.width * scale));
  const height = Math.max(MIN_NODE_SIZE, Math.round(input.height * scale));

  return prisma.$transaction(async (transaction) => {
    const asset = await transaction.workspaceAsset.create({
      data: {
        documentId: WORKSPACE_ID,
        name: input.name,
        mimeType: input.mimeType,
        bytes: Uint8Array.from(input.bytes),
        source: input.source,
        prompt: input.prompt ?? null,
      },
    });
    const node = await transaction.workspaceNode.create({
      data: {
        documentId: WORKSPACE_ID,
        assetId: asset.id,
        kind: "IMAGE",
        name: input.name,
        width,
        height,
        color: "#ffffff",
        opacity: 1,
        rotation: 0,
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
        role: message.role === "ASSISTANT" ? ("ASSISTANT" as const) : ("USER" as const),
        content: message.content,
        nodeId: message.nodeId,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  });
}

export async function updateWorkspaceNode(id: string, patch: WorkspaceNodePatch) {
  await ensureWorkspace();
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.workspaceNode.findFirst({
      where: { id, documentId: WORKSPACE_ID },
    });
    if (!current) return null;

    if (patch.layerAction) {
      const siblings = await transaction.workspaceNode.findMany({
        where: { documentId: WORKSPACE_ID },
        select: { id: true },
        orderBy: { zIndex: "asc" },
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
    const data = {
      ...(patch.width !== undefined ? { width: patch.width } : {}),
      ...(patch.height !== undefined ? { height: patch.height } : {}),
      ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}),
      ...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
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
    };
    const updated = await transaction.workspaceNode.update({
      where: { id },
      data,
      include: nodeInclude,
    });
    return workspaceNodeDto(updated);
  });
}

export async function deleteWorkspaceNode(id: string) {
  await ensureWorkspace();
  const node = await prisma.workspaceNode.findFirst({
    where: { id, documentId: WORKSPACE_ID },
    select: { id: true, assetId: true },
  });
  if (!node) return false;

  await prisma.$transaction(async (transaction) => {
    await transaction.workspaceNode.delete({ where: { id } });
    if (node.assetId) {
      const remainingUses = await transaction.workspaceNode.count({
        where: { assetId: node.assetId },
      });
      if (remainingUses === 0) {
        await transaction.workspaceAsset.delete({ where: { id: node.assetId } });
      }
    }
    const remaining = await transaction.workspaceNode.findMany({
      where: { documentId: WORKSPACE_ID },
      select: { id: true },
      orderBy: { zIndex: "asc" },
    });
    await Promise.all(
      remaining.map((item, zIndex) =>
        transaction.workspaceNode.update({
          where: { id: item.id },
          data: { zIndex },
        }),
      ),
    );
  });
  return true;
}
