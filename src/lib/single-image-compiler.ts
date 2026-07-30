import type { CharacterMetadata } from "@/lib/metadata-builder";
import type { ParsedStaticImageTask } from "@/lib/task-schema";
import type { StaticImageAssetSettings } from "@/lib/task-mode";

export type CompiledStaticImagePrompt = {
  compilerInstructions: string[];
  compiledPrompt: string;
};

function formatMetadataContext(metadata: CharacterMetadata) {
  const memory = metadata.memory;
  const visualReferences = metadata.visualReferences.length
    ? metadata.visualReferences
        .map((asset) => `${asset.name} (${asset.type}, ${asset.provider})`)
        .join("; ")
    : "None";

  return [
    `Character: ${metadata.character.name}`,
    `Species: ${metadata.character.species}`,
    `Description: ${metadata.character.description}`,
    `Personality: ${metadata.character.personality}`,
    `Lore: ${memory?.lore ?? "Not specified"}`,
    `Design rules: ${memory?.designRules ?? "Not specified"}`,
    `Preferred prompt context: ${memory?.preferredPrompt ?? "Not specified"}`,
    `Visual references: ${visualReferences}`,
  ];
}

function formatStyleSourceContext(styleSource: CharacterMetadata | null) {
  if (!styleSource) {
    return ["Style source: Create a new style for this asset."];
  }

  const visualReferences = styleSource.visualReferences.length
    ? styleSource.visualReferences
        .map((asset) => `${asset.name} (${asset.type}, ${asset.provider})`)
        .join("; ")
    : "None";

  return [
    `Style source: Inherit ${styleSource.character.name}'s style/theme.`,
    `Inherited visual style: ${styleSource.memory?.visualStyle ?? "Not specified"}`,
    `Inherited design rules: ${styleSource.memory?.designRules ?? "Not specified"}`,
    `Inherited prompt context: ${styleSource.memory?.preferredPrompt ?? "Not specified"}`,
    `Inherited visual references: ${visualReferences}`,
  ];
}

function formatList(items: string[]) {
  return items.length ? items.join("; ") : "None";
}

function assetSettingInstructions(settings: StaticImageAssetSettings): string[] {
  const instructions = [
    {
      PIXEL_ART:
        "Pixel-art game asset with hard pixel edges, no anti-aliasing, and no smooth vector gradients.",
      VECTOR_STYLE:
        "Clean vector-style game asset with simple geometric shapes, crisp contours, and flat fills. Raster image output, not SVG.",
      ILLUSTRATION:
        "Illustrated game asset with a clear readable silhouette and cohesive rendered color.",
    }[settings.visualStyle],
  ];

  if (settings.visualStyle === "PIXEL_ART") {
    instructions.push(
      {
        LOW: "Very low-resolution pixel-art appearance with large visible pixels and minimal detail.",
        MEDIUM: "Moderate pixel-art detail with clear pixel clusters.",
        HIGH: "Detailed pixel art while preserving crisp hard-edged pixels.",
      }[settings.pixelDetail],
    );
  }

  const viewInstruction = {
    SIDE: "Strict side view, camera level with the subject, no top-down perspective and no three-quarter perspective.",
    FRONT: "Strict front-facing view.",
    TOP_DOWN: "Strict top-down view.",
    ISOMETRIC: "Isometric view with a consistent game-asset perspective.",
    THREE_QUARTER: "Three-quarter view.",
    UNSPECIFIED: null,
  }[settings.viewAngle];
  if (viewInstruction) instructions.push(viewInstruction);

  const backgroundInstruction = {
    TRANSPARENT: "Isolated subject on a transparent background.",
    WHITE: "Isolated subject on a plain white background.",
    SIMPLE_SOLID: "Isolated subject on a simple solid-color background.",
    UNSPECIFIED: null,
  }[settings.background];
  if (backgroundInstruction) instructions.push(backgroundInstruction);

  if (settings.groundShadow === "NONE") {
    instructions.push("No ground shadow, no cast shadow beneath the subject.");
  }

  return instructions;
}

// This is intentionally the only deterministic prompt compiler for the MVP.
// The selected-mode route calls it only after STATIC_IMAGE parsing succeeds.
export function compileSingleStaticImageTask(
  task: ParsedStaticImageTask,
  metadata: CharacterMetadata,
  styleSource: CharacterMetadata | null = null,
): CompiledStaticImagePrompt {
  const explicitAssetInstructions = assetSettingInstructions(task.assetSettings);
  const compilerInstructions = [
    "Create exactly one coherent still image.",
    "Preserve character identity, memory, and visual-reference guidance.",
  ];
  const compiledPrompt = [
    "Create one still game asset.",
    ...formatMetadataContext(metadata),
    ...formatStyleSourceContext(styleSource),
    `User request: ${task.userRequest.trim()}`,
    `Asset kind: ${task.assetKind}`,
    `Visual subject: ${task.visualSubject}`,
    ...(task.assetSettings.viewAngle === "UNSPECIFIED"
      ? [`Composition: ${task.composition}`]
      : []),
    `Dimensions: ${task.dimensions}`,
    ...(task.assetSettings.background === "UNSPECIFIED"
      ? [`Background: ${task.background}`]
      : []),
    `Positive constraints: ${formatList(task.positiveConstraints)}`,
    `Negative constraints: ${formatList(task.negativeConstraints)}`,
    ...(task.referenceAssets.length
      ? [`Additional reference notes: ${formatList(task.referenceAssets)}`]
      : []),
    `Assumptions: ${formatList(task.assumptions)}`,
    "The explicit asset settings below override conflicting wording in the user request.",
    ...explicitAssetInstructions,
    `Compiler rules: ${compilerInstructions.join(" ")}`,
  ].join("\n");

  return { compilerInstructions, compiledPrompt };
}
