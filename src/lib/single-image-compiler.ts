import type { CharacterMetadata } from "@/lib/metadata-builder";
import type { ParsedStaticImageTask } from "@/lib/task-schema";
import type { StaticImageAssetSettings } from "@/lib/task-mode";

export type CompiledStaticImagePrompt = {
  compilerInstructions: string[];
  compiledPrompt: string;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function unique(items: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return items.map(clean).filter((item) => {
    if (!item) return false;
    const key = normalized(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sentence(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function withIndefiniteArticle(value: string) {
  return `${/^[aeiou]/i.test(value) ? "an" : "a"} ${value}`;
}

function section(title: string, lines: Array<string | null | undefined>) {
  const content = unique(lines);
  return content.length ? `${title}:\n${content.map(sentence).join(" ")}` : null;
}

function listSentence(lead: string, items: string[]) {
  const content = unique(items);
  return content.length ? `${lead} ${content.join("; ")}` : null;
}

function selectedStyle(settings: StaticImageAssetSettings) {
  return {
    PIXEL_ART: "Use a native pixel-art visual style",
    VECTOR_STYLE:
      "Use a clean vector-inspired style with simple geometric shapes, crisp contours, and flat fills",
    ILLUSTRATION:
      "Use a cohesive illustrated style with a clear, readable silhouette and rendered color",
  }[settings.visualStyle];
}

function compositionDirection(task: ParsedStaticImageTask) {
  const view = {
    SIDE: "from the side",
    FRONT: "primarily from the front",
    TOP_DOWN: "from a top-down camera angle",
    ISOMETRIC: "from a consistent isometric perspective",
    THREE_QUARTER: "from a three-quarter angle",
    UNSPECIFIED: "",
  }[task.assetSettings.viewAngle];

  if (!view) return `Compose the image as ${task.composition}`;
  if (task.assetKind.toLocaleLowerCase().includes("sprite")) {
    return `Show the subject ${view} in a relaxed, natural pose suitable for a game sprite`;
  }
  return `Show the subject ${view} in a natural composition suitable for a ${task.assetKind}`;
}

function backgroundDirection(task: ParsedStaticImageTask) {
  return {
    TRANSPARENT: "Place the isolated subject on a transparent background",
    WHITE: "Place the isolated subject on a plain white background",
    SIMPLE_SOLID: "Place the isolated subject on a simple solid-color background",
    UNSPECIFIED: `Use ${task.background}`,
  }[task.assetSettings.background];
}

function pixelArtRequirements(settings: StaticImageAssetSettings) {
  if (settings.visualStyle !== "PIXEL_ART") return [];

  const detail = {
    LOW: "Keep the pixel detail intentionally simple",
    MEDIUM: "Use a moderate level of pixel detail",
    HIGH: "Use detailed pixel work while maintaining a consistent pixel scale",
  }[settings.pixelDetail];

  return [
    "Render as native pixel art with a consistent pixel scale, deliberate pixel clusters, a limited palette, and no painterly smoothing",
    detail,
  ];
}

function referenceGuidance(
  task: ParsedStaticImageTask,
  metadata: CharacterMetadata,
  styleSource: CharacterMetadata | null,
) {
  const guidance: string[] = [];

  if (metadata.approvedAssets.length) {
    guidance.push(
      `Use ${metadata.approvedAssets.map((asset) => asset.name).join(", ")} to inform visual style, palette, costume language, shape language, and theme without copying another character's identity`,
    );
  }
  if (task.referenceAssets.length) {
    guidance.push(
      `Use the requested references ${unique(task.referenceAssets).join(", ")} for relevant visual style, palette, costume language, shape language, and theme only`,
    );
  }
  if (styleSource) {
    const sourceDetails = unique([
      styleSource.memory?.visualStyle,
      styleSource.memory?.designRules,
      styleSource.memory?.preferredPrompt,
    ]);
    guidance.push(
      `Draw style and theme from ${styleSource.character.name}${sourceDetails.length ? `, especially ${sourceDetails.join("; ")}` : ""}, while preserving ${metadata.character.name}'s identity`,
    );
    if (styleSource.approvedAssets.length) {
      guidance.push(
        `Use ${styleSource.approvedAssets.map((asset) => asset.name).join(", ")} as supporting style references, not as character identity references`,
      );
    }
  }

  return guidance;
}

// This remains the only deterministic prompt compiler for the MVP.
// It translates validated structured data directly into a concise creative brief.
export function compileSingleStaticImageTask(
  task: ParsedStaticImageTask,
  metadata: CharacterMetadata,
  styleSource: CharacterMetadata | null = null,
): CompiledStaticImagePrompt {
  const memory = metadata.memory;
  const compilerInstructions = [
    "Create exactly one coherent still image.",
    "Preserve character identity, memory, and approved references.",
    "Avoid rejected-reference feedback.",
  ];
  const userRequest = clean(task.userRequest);
  const subjectAlreadyStated = normalized(userRequest).includes(normalized(task.visualSubject));

  const sections = [
    section("Creative Brief", [
      `Create one ${task.assetKind}${subjectAlreadyStated ? "" : ` featuring ${task.visualSubject}`}`,
      `Design ${metadata.character.name}, ${withIndefiniteArticle(metadata.character.species)}, with this defining appearance: ${metadata.character.description}`,
      clean(metadata.character.personality)
        ? `The character should feel ${metadata.character.personality}`
        : null,
      userRequest ? `User direction: ${userRequest}` : null,
      memory?.lore ? `Honor this established lore: ${memory.lore}` : null,
      listSentence("Work from these stated assumptions:", task.assumptions),
    ]),
    section("Art Direction", [
      selectedStyle(task.assetSettings),
      compositionDirection(task),
      memory?.visualStyle ? `Carry forward the established visual language: ${memory.visualStyle}` : null,
      memory?.designRules ? `Follow these established design principles: ${memory.designRules}` : null,
      memory?.preferredPrompt ? memory.preferredPrompt : null,
      memory?.approvedSummary ? `Preserve what is already working: ${memory.approvedSummary}` : null,
      memory?.rejectedSummary ? `Do not repeat these prior problems: ${memory.rejectedSummary}` : null,
      listSentence("Include:", task.positiveConstraints),
      listSentence("Avoid:", [
        ...task.negativeConstraints,
        ...metadata.rejectedAssets.map((asset) =>
          asset.feedback ? `${asset.name}: ${asset.feedback}` : asset.name
        ),
      ]),
    ]),
    section("Asset Requirements", [
      backgroundDirection(task),
      task.assetSettings.groundShadow === "NONE"
        ? "Do not include a ground shadow or cast shadow beneath the subject"
        : null,
    ]),
    section("Technical Requirements", [
      `Output one still raster image at ${task.dimensions}`,
      ...pixelArtRequirements(task.assetSettings),
      task.assetSettings.visualStyle === "VECTOR_STYLE"
        ? "The output must be a raster image, not SVG"
        : null,
    ]),
    section("Reference Guidance", referenceGuidance(task, metadata, styleSource)),
  ].filter((value): value is string => Boolean(value));

  return { compilerInstructions, compiledPrompt: sections.join("\n\n") };
}
