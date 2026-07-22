import { prisma } from "@/lib/prisma";

// Route Handlers are server-side endpoints. This one lists characters and
// accepts a new character without exposing the database to the browser.
export async function GET() {
  const characters = await prisma.character.findMany({
    orderBy: { createdAt: "desc" },
  });

  return Response.json(characters);
}

export async function POST(request: Request) {
  const body = await request.json();
  const fields = ["name", "description", "personality", "species"] as const;

  if (fields.some((field) => typeof body[field] !== "string" || !body[field].trim())) {
    return Response.json(
      { error: "Name, description, personality, and species are required." },
      { status: 400 },
    );
  }

  const character = await prisma.character.create({
    data: {
      name: body.name.trim(),
      description: body.description.trim(),
      personality: body.personality.trim(),
      species: body.species.trim(),
    },
  });

  return Response.json(character, { status: 201 });
}
