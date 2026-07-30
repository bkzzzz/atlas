import { createAssetItemHandler } from "@/lib/asset-handler";
import { deleteReferenceImage } from "@/lib/image-storage";
import { prisma } from "@/lib/prisma";

const handler = createAssetItemHandler({
  findAsset: (assetId) =>
    prisma.imageAsset.findUnique({ where: { id: assetId } }),
  updateAsset: (assetId, data) =>
    prisma.imageAsset.update({
      where: { id: assetId },
      data,
    }),
  deleteAsset: async (assetId) => {
    await prisma.imageAsset.delete({ where: { id: assetId } });
  },
  deleteReferenceImage,
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await context.params;
    return await handler.PATCH(request, assetId);
  } catch (error) {
    console.error("Failed to update image asset", error);
    return Response.json(
      { error: "Unexpected error while updating asset." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await context.params;
    return await handler.DELETE(assetId);
  } catch (error) {
    console.error("Failed to delete image asset", error);
    return Response.json(
      { error: "Unexpected error while deleting asset." },
      { status: 500 },
    );
  }
}
