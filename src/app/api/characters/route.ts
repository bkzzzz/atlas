import { createCharacterHandler } from "@/lib/character-handler";
import { prisma } from "@/lib/prisma";

// Route Handlers are server-side endpoints. This one lists characters and
// accepts a new character without exposing the database to the browser.
export async function GET() {
  const characters = await prisma.character.findMany({
    orderBy: { createdAt: "desc" },
  });

  return Response.json(characters);
}

export const POST = createCharacterHandler({
  createCharacter: (data) => prisma.character.create({ data }),
});
