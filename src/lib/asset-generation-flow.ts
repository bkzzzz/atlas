import type { ParsedStaticImageTask } from "@/lib/task-schema";
import {
  MAX_NATURAL_LANGUAGE_REQUEST_LENGTH,
  type StaticImageAssetSettings,
} from "@/lib/task-mode";
import {
  type SelectableReference,
} from "@/lib/reference-retrieval";

export const ASSET_TYPES = [
  { value: "CHARACTER_SPRITE", label: "Character sprite", phrase: "a character sprite" },
  { value: "PORTRAIT", label: "Portrait", phrase: "a character portrait" },
  { value: "ICON", label: "Icon", phrase: "an icon" },
  { value: "PROP", label: "Prop", phrase: "a game prop" },
  { value: "UI_ASSET", label: "UI asset", phrase: "a game UI asset" },
] as const;

export type AssetType = (typeof ASSET_TYPES)[number]["value"];

export const ASSET_WORKFLOWS = [
  { value: "STATIC_IMAGE", label: "Static image", executable: true },
  { value: "VECTOR_ASSET", label: "Vector asset", executable: false },
  { value: "IDLE_ANIMATION", label: "Idle animation", executable: false },
  { value: "WALK_ANIMATION", label: "Walk animation", executable: false },
] as const;

export const OUTPUT_FORMATS = [
  { value: "PNG", label: "PNG", executable: true },
  { value: "SVG", label: "SVG", executable: false },
] as const;

export type ParseTaskResult = {
  parsedTask: ParsedStaticImageTask;
  compilerInstructions: string[];
  compiledPrompt: string;
  generationToken: string | null;
  refinementMode?: "deterministic-merge";
  referenceProvenance?: Array<{
    id: string;
    pack: string;
    source: "Kenney";
    author: "Kenney";
    license: "CC0-1.0";
  }>;
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
  selectedReferences: readonly SelectableReference[];
};

export type ProductCompilationInput = {
  characterId: string;
  draftStyleSpec: ParsedStaticImageTask;
  referenceIds: readonly string[];
  styleSourceCharacterId: string | null;
};

export type JsonRequester = (url: string, body: unknown) => Promise<unknown>;

export function buildProductArtRequest({
  characterName,
  assetType,
  artDirection,
}: Pick<ProductGenerationInput, "characterName" | "assetType" | "artDirection"> &
  Partial<Pick<ProductGenerationInput, "selectedReferences">>) {
  const asset = ASSET_TYPES.find(({ value }) => value === assetType);
  if (!asset) throw new Error("Choose a valid asset type.");

  const direction = artDirection.trim();
  const base = `Create ${asset.phrase} for ${characterName.trim()}.`;
  const request = direction
    ? `${base} Additional art direction: ${direction}`
    : base;
  if (request.length > MAX_NATURAL_LANGUAGE_REQUEST_LENGTH) {
    throw new Error("Shorten the project brief or asset request before continuing.");
  }
  return request;
}

export async function runProductGeneration(
  input: ProductGenerationInput,
  requestJson: JsonRequester,
): Promise<ProductGenerationResult> {
  const draft = await runProductParse(input, requestJson);
  const parseResult = await runProductCompile(
    {
      characterId: input.characterId,
      draftStyleSpec: draft.parsedTask,
      referenceIds: input.selectedReferences.map(({ id }) => id),
      styleSourceCharacterId: input.styleSourceCharacterId,
    },
    requestJson,
  );

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

export async function runProductCompile(
  input: ProductCompilationInput,
  requestJson: JsonRequester,
): Promise<ParseTaskResult> {
  return (await requestJson(
    `/api/characters/${input.characterId}/compile-task`,
    {
      draftStyleSpec: input.draftStyleSpec,
      referenceIds: [...input.referenceIds],
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
