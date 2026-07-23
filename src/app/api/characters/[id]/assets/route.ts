import { prisma } from "@/lib/prisma";

const requiredFields = ["name", "imageUrl", "type", "provider", "status"] as const;

// Assets are nested under a character because creating or listing an asset
// always happens in the context of its owner.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: characterId } = await context.params;
  const assets = await prisma.imageAsset.findMany({
    where: { characterId },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(assets);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: characterId } = await context.params;
  const body = await request.json();

  if (requiredFields.some((field) => typeof body[field] !== "string" || !body[field].trim())) {
    return Response.json(
      { error: "Name, image URL, type, provider, and status are required." },
      { status: 400 },
    );
  }

  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) {
    return Response.json({ error: "Character not found." }, { status: 404 });
  }

  const asset = await prisma.imageAsset.create({
    data: {
      characterId,
      name: body.name.trim(),
      imageUrl: body.imageUrl.trim(),
      type: body.type.trim(),
      provider: body.provider.trim(),
      status: body.status.trim(),
    },
  });

  return Response.json(asset, { status: 201 });
}
