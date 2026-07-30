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

function pixelArtInstructions(settings: StaticImageAssetSettings): string[] {
  const detailInstruction = {
    LOW: "Use large, deliberate pixel clusters with minimal detail.",
    MEDIUM: "Use moderately sized, deliberate pixel clusters with controlled detail.",
    HIGH: "Use smaller, deliberate pixel clusters with richer detail while keeping every edge hard.",
  }[settings.pixelDetail];
  const viewInstruction = settings.viewAngle === "UNSPECIFIED"
    ? "Use a strict front-facing orthographic view with no perspective."
    : "Use the explicitly selected camera/view below; it overrides the default front view.";

  return [
    "RENDERING MODE: PIXEL_ART",
    "PIXEL ART OUTPUT:",
    "- Create an authentic, production-ready pixel art game sprite, not a smooth digital illustration.",
    "PIXEL CONSTRUCTION:",
    "- Use crisp square pixels and a nearest-neighbor appearance.",
    "- Use hard pixel boundaries with no anti-aliasing, no subpixel smoothing, and no blurred edges.",
    "- Use no smooth gradients and no painterly rendering.",
    "- Use a limited color palette and simple, readable shading made from intentional color clusters.",
    `- ${detailInstruction}`,
    "SPRITE READABILITY:",
    "- Keep a clean silhouette and make the sprite readable at both 32×32 and 64×64.",
    `- ${viewInstruction}`,
    "PIXEL-ART PRIORITY:",
    "- These pixel-art constraints override all generic illustration, rendering, lighting, and detail wording elsewhere in the request.",
  ];
}

function pixelArtReferenceInstructions(): string[] {
  return [
    "PIXEL ART REFERENCE ROLE:",
    "- Treat all input images primarily as visual style references.",
    "- Preserve their pixel density, outline thickness, palette complexity, shading style, and camera angle.",
    "- Do not copy the reference subject, object identity, silhouette, or decorations.",
  ];
}

function assetSettingInstructions(settings: StaticImageAssetSettings): string[] {
  const instructions = settings.visualStyle === "PIXEL_ART"
    ? pixelArtInstructions(settings)
    : [
        {
          VECTOR_STYLE:
            "Clean vector-style game asset with simple geometric shapes, crisp contours, and flat fills. Raster image output, not SVG.",
          ILLUSTRATION:
            "Illustrated game asset with a clear readable silhouette and cohesive rendered color.",
        }[settings.visualStyle],
      ];

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
  const hasVisualReferences =
    metadata.visualReferences.length > 0 ||
    (styleSource?.visualReferences.length ?? 0) > 0;
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
    ...(task.assetSettings.visualStyle === "PIXEL_ART" && hasVisualReferences
      ? pixelArtReferenceInstructions()
      : []),
    `Compiler rules: ${compilerInstructions.join(" ")}`,
  ].join("\n");

  return { compilerInstructions, compiledPrompt };
}
