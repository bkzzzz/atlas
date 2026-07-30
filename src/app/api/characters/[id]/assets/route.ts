import { createAssetCollectionHandler } from "@/lib/asset-handler";
import {
  deleteReferenceImage,
  putReferenceImage,
} from "@/lib/image-storage";
import { prisma } from "@/lib/prisma";

const handler = createAssetCollectionHandler({
  listAssets: (characterId) =>
    prisma.imageAsset.findMany({
      where: { characterId },
      orderBy: { createdAt: "desc" },
    }),
  findCharacter: (characterId) =>
    prisma.character.findUnique({ where: { id: characterId } }),
  createAsset: (data) =>
    prisma.imageAsset.create({
      data: data as Parameters<typeof prisma.imageAsset.create>[0]["data"],
    }),
  putReferenceImage,
  deleteReferenceImage,
});

// Assets are nested under a character because creating or listing an asset
// always happens in the context of its owner.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: characterId } = await context.params;
  return handler.GET(characterId);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: characterId } = await context.params;
  return handler.POST(request, characterId);
}
