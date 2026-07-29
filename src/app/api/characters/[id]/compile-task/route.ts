import { createGenerationToken } from "@/lib/generation-session";
import { buildCharacterMetadata } from "@/lib/metadata-builder";
import { prisma } from "@/lib/prisma";
import { loadReferenceFamilyIndex } from "@/lib/reference-index-server";
import {
  createCompileTaskHandler,
  type CompilationContextResult,
} from "@/lib/static-image-compilation";

async function loadCompilationContext(
  characterId: string,
  styleSourceCharacterId: string | null,
): Promise<CompilationContextResult> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });
  if (!character) {
    return { ok: false, status: 404, error: "Character not found." };
  }

  const [memory, assets] = await Promise.all([
    prisma.characterMemory.findUnique({ where: { characterId } }),
    prisma.imageAsset.findMany({
      where: {
        characterId,
        status: { in: ["APPROVED", "REJECTED"] },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const metadata = buildCharacterMetadata({ character, memory, assets });
  if (!styleSourceCharacterId) {
    return { ok: true, metadata, styleSourceMetadata: null };
  }

  const [styleCharacter, styleMemory, styleAssets] = await Promise.all([
    prisma.character.findUnique({
      where: { id: styleSourceCharacterId },
    }),
    prisma.characterMemory.findUnique({
      where: { characterId: styleSourceCharacterId },
    }),
    prisma.imageAsset.findMany({
      where: {
        characterId: styleSourceCharacterId,
        status: { in: ["APPROVED", "REJECTED"] },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!styleCharacter) {
    return {
      ok: false,
      status: 404,
      error: "Style source character not found.",
    };
  }

  return {
    ok: true,
    metadata,
    styleSourceMetadata: buildCharacterMetadata({
      character: styleCharacter,
      memory: styleMemory,
      assets: styleAssets,
    }),
  };
}

const postCompileTask = createCompileTaskHandler({
  loadReferenceFamilyIndex,
  loadCompilationContext,
  createGenerationToken,
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return postCompileTask(request, id);
}
