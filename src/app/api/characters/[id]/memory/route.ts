import { prisma } from "@/lib/prisma";

const memoryFields = [
  "visualStyle",
  "lore",
  "designRules",
  "approvedSummary",
  "rejectedSummary",
  "preferredPrompt",
] as const;

function parseMemoryInput(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const data = Object.fromEntries(
    memoryFields.filter((field) => field in input).map((field) => [field, input[field]]),
  );

  if (Object.values(data).some((value) => value !== null && typeof value !== "string")) {
    return null;
  }

  return Object.fromEntries(
    Object.entries(data).map(([field, value]) => [
      field,
      typeof value === "string" ? value.trim() || null : value,
    ]),
  );
}

// This resource is nested under its character because a memory cannot exist
// without its one owning character.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: characterId } = await context.params;
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) return Response.json({ error: "Character not found." }, { status: 404 });

  const memory = await prisma.characterMemory.findUnique({ where: { characterId } });
  return Response.json(memory);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: characterId } = await context.params;
    const data = parseMemoryInput(await request.json());
    if (!data) return Response.json({ error: "Memory fields must be strings or null." }, { status: 400 });

    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) return Response.json({ error: "Character not found." }, { status: 404 });

    const existingMemory = await prisma.characterMemory.findUnique({ where: { characterId } });
    if (existingMemory) return Response.json({ error: "Character memory already exists." }, { status: 400 });

    const memory = await prisma.characterMemory.create({ data: { characterId, ...data } });
    return Response.json(memory, { status: 201 });
  } catch (error) {
    console.error("Failed to create character memory", error);
    return Response.json({ error: "Unexpected error while creating memory." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: characterId } = await context.params;
    const data = parseMemoryInput(await request.json());
    if (!data || Object.keys(data).length === 0) {
      return Response.json({ error: "Provide at least one valid memory field." }, { status: 400 });
    }

    const memory = await prisma.characterMemory.findUnique({ where: { characterId } });
    if (!memory) return Response.json({ error: "Character memory not found." }, { status: 404 });

    const updatedMemory = await prisma.characterMemory.update({ where: { characterId }, data });
    return Response.json(updatedMemory);
  } catch (error) {
    console.error("Failed to update character memory", error);
    return Response.json({ error: "Unexpected error while updating memory." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: characterId } = await context.params;
    const memory = await prisma.characterMemory.findUnique({ where: { characterId } });
    if (!memory) return Response.json({ error: "Character memory not found." }, { status: 404 });

    await prisma.characterMemory.delete({ where: { characterId } });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete character memory", error);
    return Response.json({ error: "Unexpected error while deleting memory." }, { status: 500 });
  }
}
