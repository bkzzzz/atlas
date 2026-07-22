import { prisma } from "@/lib/prisma";

// This Route Handler returns one character. The [id] folder makes the id part
// of the URL, so /api/characters/abc loads the character whose id is "abc".
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const character = await prisma.character.findUnique({ where: { id } });

  if (!character) {
    return Response.json({ error: "Character not found." }, { status: 404 });
  }

  return Response.json(character);
}
