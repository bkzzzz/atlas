import "server-only";
import { prisma } from "@/lib/prisma";
import {
  createWorkspaceAssetReader,
} from "@/lib/workspace-assets-core";

export const listGeneratedWorkspaceAssets = createWorkspaceAssetReader({
  findAssets: (anonymousOwnerKey, limit) =>
    prisma.imageAsset.findMany({
      where: { anonymousOwnerKey, kind: "GENERATED" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        name: true,
        imageUrl: true,
        mimeType: true,
        byteSize: true,
        type: true,
        model: true,
        createdAt: true,
        character: { select: { name: true } },
      },
    }),
});
