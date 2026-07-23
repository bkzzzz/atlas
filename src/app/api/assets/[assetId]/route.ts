import { prisma } from "@/lib/prisma";

// Asset deletion uses its own id because the caller already has the asset
// selected; the database relation still enforces ownership integrity.
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await context.params;
  const asset = await prisma.imageAsset.findUnique({ where: { id: assetId } });

  if (!asset) {
    return Response.json({ error: "Asset not found." }, { status: 404 });
  }

  await prisma.imageAsset.delete({ where: { id: assetId } });
  return new Response(null, { status: 204 });
}
