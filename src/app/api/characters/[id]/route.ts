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
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json();
  const fields = ["name", "description", "personality", "species"] as const;
  const data = Object.fromEntries(
    fields
      .filter((field) => field in body)
      .map((field) => [field, body[field]]),
  );

  if (
    Object.keys(data).length === 0 ||
    Object.values(data).some((value) => typeof value !== "string" || !value.trim())
  ) {
    return Response.json(
      { error: "Provide at least one non-empty character field to update." },
      { status: 400 },
    );
  }

  const character = await prisma.character.update({
    where: { id },
    data: Object.fromEntries(
      Object.entries(data).map(([field, value]) => [field, (value as string).trim()]),
    ),
  });

  return Response.json(character);
}

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
