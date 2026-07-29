import { prisma } from "@/lib/prisma";
import { WORKSPACE_ID } from "@/lib/workspace-core";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await context.params;
  const asset = await prisma.workspaceAsset.findFirst({
    where: { id: assetId, documentId: WORKSPACE_ID },
    select: { bytes: true, mimeType: true },
  });
  if (!asset) {
    return Response.json({ error: "Asset not found." }, { status: 404 });
  }
  return new Response(Uint8Array.from(asset.bytes), {
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
