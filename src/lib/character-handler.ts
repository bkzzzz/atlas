type CreateCharacterInput = {
  name: string;
  description: string;
  personality: string;
  species: string;
};

type CharacterHandlerDependencies = {
  createCharacter: (data: CreateCharacterInput) => Promise<unknown>;
};

type UpdateCharacterHandlerDependencies = {
  updateCharacter: (id: string, data: Partial<CreateCharacterInput>) => Promise<unknown>;
};

type CharacterRouteContext = {
  params: Promise<{ id: string }>;
};

export function createCharacterHandler({ createCharacter }: CharacterHandlerDependencies) {
  return async function POST(request: Request) {
    const body = await request.json();
    const fields = ["name", "description", "personality", "species"] as const;

    if (fields.some((field) => typeof body[field] !== "string" || !body[field].trim())) {
      return Response.json(
        { error: "Name, description, personality, and species are required." },
        { status: 400 },
      );
    }

    const name = body.name.trim();
    if (name.length > 60) {
      return Response.json(
        { error: "Name must be no longer than 60 characters." },
        { status: 400 },
      );
    }

    const character = await createCharacter({
      name,
      description: body.description.trim(),
      personality: body.personality.trim(),
      species: body.species.trim(),
    });

    return Response.json(character, { status: 201 });
  };
}

export function createUpdateCharacterHandler({
  updateCharacter,
}: UpdateCharacterHandlerDependencies) {
  return async function PATCH(request: Request, context: CharacterRouteContext) {
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

    const trimmedData = Object.fromEntries(
      Object.entries(data).map(([field, value]) => [field, (value as string).trim()]),
    ) as Partial<CreateCharacterInput>;

    if (trimmedData.name && trimmedData.name.length > 60) {
      return Response.json(
        { error: "Name must be no longer than 60 characters." },
        { status: 400 },
      );
    }

    return Response.json(await updateCharacter(id, trimmedData));
  };
}
