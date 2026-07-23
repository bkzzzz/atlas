import { prisma } from "@/lib/prisma";
import { ASSET_STATUSES } from "@/lib/assets";

const editableFields = ["name", "type", "provider", "status", "prompt", "feedback"] as const;

// PATCH performs a partial update: callers only send the asset fields they
// want to change, and status is checked at this API boundary.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await context.params;
    const body: unknown = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Request body must be an object." }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const data = Object.fromEntries(
      editableFields
        .filter((field) => field in input)
        .map((field) => [field, input[field]]),
    );

    if (Object.keys(data).length === 0) {
      return Response.json({ error: "Provide at least one editable asset field." }, { status: 400 });
    }

    if ("status" in data && !ASSET_STATUSES.includes(data.status as typeof ASSET_STATUSES[number])) {
      return Response.json({ error: "Asset status is invalid." }, { status: 400 });
    }

    for (const field of ["name", "type", "provider"] as const) {
      if (field in data && (typeof data[field] !== "string" || !data[field].trim())) {
        return Response.json({ error: `${field} must be a non-empty string.` }, { status: 400 });
      }
    }

    for (const field of ["prompt", "feedback"] as const) {
      if (field in data && data[field] !== null && typeof data[field] !== "string") {
        return Response.json({ error: `${field} must be a string or null.` }, { status: 400 });
      }
    }

    const asset = await prisma.imageAsset.findUnique({ where: { id: assetId } });
    if (!asset) return Response.json({ error: "Asset not found." }, { status: 404 });

    const updatedAsset = await prisma.imageAsset.update({
      where: { id: assetId },
      data: Object.fromEntries(
        Object.entries(data).map(([field, value]) => [
          field,
          typeof value === "string" ? value.trim() : value,
        ]),
      ),
    });

    return Response.json(updatedAsset);
  } catch (error) {
    console.error("Failed to update image asset", error);
    return Response.json({ error: "Unexpected error while updating asset." }, { status: 500 });
  }
}

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
