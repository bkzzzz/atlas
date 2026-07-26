import { createUpdateCharacterHandler } from "@/lib/character-handler";
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

// PATCH changes only fields supplied by the caller. This makes the endpoint
// reusable for a future inline editor as well as the full edit dialog.
export const PATCH = createUpdateCharacterHandler({
  updateCharacter: (id, data) => prisma.character.update({ where: { id }, data }),
});

// DELETE permanently removes one character. The UI asks for confirmation
// before calling this endpoint because the current model has no soft-delete.
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const existingCharacter = await prisma.character.findUnique({ where: { id } });

  if (!existingCharacter) {
    return Response.json({ error: "Character not found." }, { status: 404 });
  }

  await prisma.character.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
