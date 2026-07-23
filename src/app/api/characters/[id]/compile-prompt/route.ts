import { buildCharacterMetadata } from "@/lib/metadata-builder";
import { getProviderAdapter } from "@/lib/providers";
import { PROVIDERS, type ProviderProfile, type RikaAnimationOptions } from "@/lib/providers/types";
import { prisma } from "@/lib/prisma";

function parseRikaOptions(value: unknown): RikaAnimationOptions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const options = value as Record<string, unknown>;
  if (
    typeof options.animationType !== "string" ||
    !options.animationType.trim() ||
    typeof options.frameCount !== "number" ||
    !Number.isInteger(options.frameCount) ||
    options.frameCount < 1 ||
    typeof options.cameraMovementAllowed !== "boolean" ||
    typeof options.projectileAllowed !== "boolean" ||
    (options.playback !== "LOOP" && options.playback !== "ONE_SHOT") ||
    typeof options.constraints !== "string"
  ) return null;

  return {
    animationType: options.animationType.trim(),
    frameCount: options.frameCount,
    cameraMovementAllowed: options.cameraMovementAllowed,
    projectileAllowed: options.projectileAllowed,
    playback: options.playback,
    constraints: options.constraints.trim(),
  };
}

// This endpoint compiles deterministic text only. It never sends data to an AI
// provider, which keeps the preview safe to inspect and reproduce.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: characterId } = await context.params;
    const body = await request.json();
    if (!body || typeof body.provider !== "string" || !PROVIDERS.includes(body.provider)) {
      return Response.json({ error: "Provider is invalid." }, { status: 400 });
    }
    if (typeof body.userRequest !== "string" || !body.userRequest.trim()) {
      return Response.json({ error: "User request is required." }, { status: 400 });
    }

    const provider = body.provider as ProviderProfile;
    const rikaOptions = provider === "RIKA_ANIMATION" ? parseRikaOptions(body.rikaOptions) : undefined;
    if (provider === "RIKA_ANIMATION" && !rikaOptions) {
      return Response.json({ error: "Valid Rika animation options are required." }, { status: 400 });
    }

    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) return Response.json({ error: "Character not found." }, { status: 404 });
    const [memory, assets] = await Promise.all([
      prisma.characterMemory.findUnique({ where: { characterId } }),
      prisma.imageAsset.findMany({ where: { characterId, status: { in: ["APPROVED", "REJECTED"] } }, orderBy: { createdAt: "desc" } }),
    ]);

    const metadata = buildCharacterMetadata({ character, memory, assets });
    const compiled = getProviderAdapter(provider).compile({ metadata, userRequest: body.userRequest, rikaOptions: rikaOptions ?? undefined });
    return Response.json({ metadata, ...compiled });
  } catch (error) {
    console.error("Failed to compile prompt", error);
    return Response.json({ error: "Unexpected error while compiling prompt." }, { status: 500 });
  }
}
