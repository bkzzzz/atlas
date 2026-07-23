import { buildCharacterMetadata } from "@/lib/metadata-builder";
import { prisma } from "@/lib/prisma";

// The endpoint reads persisted context and delegates its stable JSON shape to
// the reusable metadata builder. No AI provider or prompt generation is used.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: characterId } = await context.params;
    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) return Response.json({ error: "Character not found." }, { status: 404 });

    const [memory, assets] = await Promise.all([
      prisma.characterMemory.findUnique({ where: { characterId } }),
      prisma.imageAsset.findMany({
        where: { characterId, status: { in: ["APPROVED", "REJECTED"] } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return Response.json(buildCharacterMetadata({ character, memory, assets }));
  } catch (error) {
    console.error("Failed to build character metadata", error);
    return Response.json({ error: "Unexpected error while building metadata." }, { status: 500 });
  }
}
