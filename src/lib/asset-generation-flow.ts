import type { ParsedStaticImageTask } from "@/lib/task-schema";
import type { StaticImageAssetSettings } from "@/lib/task-mode";

export const ASSET_TYPES = [
  { value: "CHARACTER_SPRITE", label: "Character sprite", phrase: "a character sprite" },
  { value: "PORTRAIT", label: "Portrait", phrase: "a character portrait" },
  { value: "ICON", label: "Icon", phrase: "an icon" },
  { value: "PROP", label: "Prop", phrase: "a game prop" },
  { value: "UI_ASSET", label: "UI asset", phrase: "a game UI asset" },
] as const;

export type AssetType = (typeof ASSET_TYPES)[number]["value"];

export const ASSET_WORKFLOWS = [
  { value: "STATIC_IMAGE", label: "Static image", description: "Raster PNG", executable: true },
  { value: "IDLE_ANIMATION", label: "Idle animation", description: "Unavailable", executable: false },
  { value: "WALK_ANIMATION", label: "Walk animation", description: "Unavailable", executable: false },
] as const;

export type ParseTaskResult = {
  parsedTask: ParsedStaticImageTask;
  compilerInstructions: string[];
  compiledPrompt: string;
  generationToken: string | null;
  parser?: {
    model: string;
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
    };
  };
};

export type GeneratedImage = {
  imageUrl: string;
  model: string;
  compiledPrompt: string;
  createdAt: string;
  assetId?: string;
};

export type ProductGenerationResult = {
  parseResult: ParseTaskResult;
  image: GeneratedImage;
};

export type ProductGenerationInput = {
  characterId: string;
  characterName: string;
  assetType: AssetType;
  artDirection: string;
  assetSettings: StaticImageAssetSettings;
  styleSourceCharacterId: string | null;
};

export type JsonRequester = (url: string, body: unknown) => Promise<unknown>;

export function buildProductArtRequest({
  characterName,
  assetType,
  artDirection,
}: Pick<ProductGenerationInput, "characterName" | "assetType" | "artDirection">) {
  const asset = ASSET_TYPES.find(({ value }) => value === assetType);
  if (!asset) throw new Error("Choose a valid asset type.");

  const direction = artDirection.trim();
  const base = `Create ${asset.phrase} for ${characterName.trim()}.`;
  return direction ? `${base} Additional art direction: ${direction}` : base;
}

export async function runProductGeneration(
  input: ProductGenerationInput,
  requestJson: JsonRequester,
): Promise<ProductGenerationResult> {
  const parseResult = await runProductParse(input, requestJson);

  if (!parseResult.generationToken) {
    throw new Error("The compiled request did not include a generation token.");
  }

  const image = await generateCompiledProduct(parseResult.generationToken, requestJson);

  return {
    parseResult: { ...parseResult, generationToken: null },
    image,
  };
}

export async function runProductParse(
  input: ProductGenerationInput,
  requestJson: JsonRequester,
): Promise<ParseTaskResult> {
  return (await requestJson(
    `/api/characters/${input.characterId}/parse-task`,
    {
      selectedMode: "STATIC_IMAGE",
      request: buildProductArtRequest(input),
      assetSettings: input.assetSettings,
      styleSourceCharacterId: input.styleSourceCharacterId,
    },
  )) as ParseTaskResult;
}

export async function generateCompiledProduct(
  generationToken: string,
  requestJson: JsonRequester,
): Promise<GeneratedImage> {
  const generation = (await requestJson("/api/generate-image", {
    generationToken,
  })) as { image: GeneratedImage };
  return generation.image;
}
