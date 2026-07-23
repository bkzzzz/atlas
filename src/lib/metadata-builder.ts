type MetadataAsset = {
  id: string;
  name: string;
  imageUrl: string;
  type: string;
  provider: string;
  status: string;
  prompt: string | null;
  feedback: string | null;
  createdAt: Date | string;
};

export type CharacterMetadata = {
  version: "1.0";
  character: {
    id: string;
    name: string;
    description: string;
    personality: string;
    species: string;
  };
  memory: {
    visualStyle: string | null;
    lore: string | null;
    designRules: string | null;
    approvedSummary: string | null;
    rejectedSummary: string | null;
    preferredPrompt: string | null;
  } | null;
  approvedAssets: Array<{
    id: string;
    name: string;
    imageUrl: string;
    type: string;
    provider: string;
    prompt: string | null;
    createdAt: string;
  }>;
  rejectedAssets: Array<{
    id: string;
    name: string;
    imageUrl: string;
    type: string;
    provider: string;
    feedback: string | null;
    createdAt: string;
  }>;
};

// This pure builder is the single place that defines the context future
// prompt-compilation and AI workflows will receive. It does not generate text.
export function buildCharacterMetadata({
  character,
  memory,
  assets,
}: {
  character: CharacterMetadata["character"];
  memory: (NonNullable<CharacterMetadata["memory"]> & { id?: string; characterId?: string }) | null;
  assets: MetadataAsset[];
}): CharacterMetadata {
  const toIsoString = (value: Date | string) =>
    typeof value === "string" ? value : value.toISOString();

  return {
    version: "1.0",
    character: {
      id: character.id,
      name: character.name,
      description: character.description,
      personality: character.personality,
      species: character.species,
    },
    memory: memory && {
      visualStyle: memory.visualStyle,
      lore: memory.lore,
      designRules: memory.designRules,
      approvedSummary: memory.approvedSummary,
      rejectedSummary: memory.rejectedSummary,
      preferredPrompt: memory.preferredPrompt,
    },
    approvedAssets: assets
      .filter((asset) => asset.status === "APPROVED")
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        imageUrl: asset.imageUrl,
        type: asset.type,
        provider: asset.provider,
        prompt: asset.prompt,
        createdAt: toIsoString(asset.createdAt),
      })),
    rejectedAssets: assets
      .filter((asset) => asset.status === "REJECTED")
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        imageUrl: asset.imageUrl,
        type: asset.type,
        provider: asset.provider,
        feedback: asset.feedback,
        createdAt: toIsoString(asset.createdAt),
      })),
  };
}
