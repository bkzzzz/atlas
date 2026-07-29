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

function withoutLeadingArticle(value: string) {
  return normalized(value).replace(/^(?:a|an|the)\s+/, "");
}

function includesConcept(container: string, value: string) {
  const concept = withoutLeadingArticle(value);
  return Boolean(concept) && withoutLeadingArticle(container).includes(concept);
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

const STYLE_FRAGMENTS: Record<StaticImageAssetSettings["visualStyle"], string> = {
  PIXEL_ART: [
    "TRUE 2D PIXEL ART GAME ASSET.",
    "The rendering method is fixed and every instruction below must follow it.",
    "Create the artwork directly as pixel art from the beginning.",
    "Do not create a high-resolution digital painting and pixelate it afterward.",
    "Use visible square pixel clusters, hard edges, a limited color palette, simplified forms, and deliberate pixel-level shading.",
    "No anti-aliasing, smooth gradients, soft painterly shading, realistic skin rendering, photorealism, 3D rendering, or high-frequency texture.",
    "Omit details that cannot be represented cleanly at the selected sprite scale.",
    "The final result must read clearly as a production-ready 2D game sprite.",
  ].join(" "),
  VECTOR_STYLE:
    "FLAT VECTOR-INSPIRED 2D GAME ASSET. Build the image from simple geometric shapes, crisp contours, clean flat fills, controlled color separation, and a highly readable silhouette. Keep edges sharp and graphic. Return a raster image, not SVG.",
  ILLUSTRATION:
    "POLISHED 2D ILLUSTRATED GAME ASSET. Use a cohesive illustrative rendering style, a clear readable silhouette, intentional color and lighting, and controlled detail suitable for production game art.",
};

const PIXEL_DETAIL_FRAGMENTS: Record<StaticImageAssetSettings["pixelDetail"], string> = {
  LOW:
    "Use an approximate logical sprite scale of 24x48 to 32x64 pixels. Build forms with large pixel clusters, highly simplified facial features and clothing, approximately 8–16 colors, and very limited shading.",
  MEDIUM:
    "Use an approximate logical sprite scale of 32x64 to 48x96 pixels. Build forms with medium-sized pixel clusters, readable but simplified facial features, approximately 16–32 colors, and controlled two-to-four-step shading. Do not add tiny decorative noise.",
  HIGH:
    "Use an approximate logical sprite scale of 64x96 to 96x144 pixels. Use smaller but still visibly deliberate pixel clusters and richer costume detail while preserving pixel readability, a limited palette, and hard-edged shading. Never allow semi-realistic painting or anti-aliased edges.",
};

const VIEW_FRAGMENTS: Record<StaticImageAssetSettings["viewAngle"], string> = {
  SIDE:
    "Use a strict orthographic side profile with the camera level to the subject. Do not rotate toward a three-quarter view.",
  FRONT:
    "Use a strict front-facing orthographic view. Keep the stance relaxed and natural rather than rigid or mannequin-like.",
  TOP_DOWN:
    "Use a strict top-down game-asset view with the camera directly above the subject and a consistent readable orientation.",
  ISOMETRIC:
    "Use a clean isometric game-asset view with consistent projection and clearly readable forms.",
  THREE_QUARTER:
    "Use a readable three-quarter game-character view that clearly communicates the face, silhouette, and costume.",
  UNSPECIFIED:
    "Choose the clearest game-asset presentation for the subject, prioritizing silhouette and immediate readability.",
};

const BACKGROUND_FRAGMENTS: Record<StaticImageAssetSettings["background"], string | null> = {
  TRANSPARENT:
    "Isolate the character on a transparent background with no scenery, backdrop, or floor plane.",
  WHITE:
    "Isolate the character on a pure white background with no scenery or environmental backdrop.",
  SIMPLE_SOLID:
    "Isolate the character against one simple, flat solid-color background with no environmental scenery.",
  UNSPECIFIED: null,
};

const SHADOW_FRAGMENTS: Record<StaticImageAssetSettings["groundShadow"], string> = {
  NONE:
    "Do not include a cast shadow, contact shadow, floor ellipse, or glow beneath the character.",
  ALLOW:
    "A restrained ground shadow may be used only when it improves grounding and does not obscure the asset silhouette.",
};

function compositionDirection(task: ParsedStaticImageTask) {
  return unique([
    VIEW_FRAGMENTS[task.assetSettings.viewAngle],
    task.assetSettings.viewAngle === "UNSPECIFIED"
      ? `Use the parsed composition as supporting direction: ${task.composition}`
      : null,
  ]).join(" ");
}

function referenceGuidance(
  task: ParsedStaticImageTask,
  metadata: CharacterMetadata,
  styleSource: CharacterMetadata | null,
) {
  const guidance: string[] = [];

  if (task.referenceGuidance.length) {
    const titles = listSentence(
      "Selected reference families:",
      task.referenceGuidance.map((reference) => reference.title),
    );
    const categories = listSentence(
      "Categories:",
      task.referenceGuidance.map((reference) => reference.category),
    );
    const tags = listSentence(
      "Objective tags:",
      task.referenceGuidance.flatMap((reference) => reference.tags),
    );
    if (titles) guidance.push(titles);
    if (categories) guidance.push(categories);
    if (tags) guidance.push(tags);
    guidance.push(
      "Use these as supporting visual direction only, without copying identity or assuming unlisted traits",
      "Preserve the requested subject, composition, dimensions, background, asset settings, and explicit constraints",
    );
  }
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
  const subjectAlreadyStated = includesConcept(userRequest, task.visualSubject);
  const appearanceAlreadyStated =
    includesConcept(userRequest, metadata.character.description) ||
    includesConcept(task.visualSubject, metadata.character.description);
  const background =
    BACKGROUND_FRAGMENTS[task.assetSettings.background] ??
    `Use this requested background direction: ${task.background}`;
  const finalExclusions = unique([
    ...(task.assetSettings.visualStyle === "PIXEL_ART"
      ? [
          "Do not soften, upscale-paint, post-process, or filter the result into a smooth illustration",
          "anti-aliased edges, smooth gradients, photorealistic materials, realistic skin rendering, 3D rendering, and painterly texture",
        ]
      : []),
    ...task.negativeConstraints,
    ...metadata.rejectedAssets.map((asset) =>
      asset.feedback ? `${asset.name}: ${asset.feedback}` : asset.name
    ),
  ]);

  const sections = [
    STYLE_FRAGMENTS[task.assetSettings.visualStyle],
    section("Asset and Subject", [
      `Create one ${task.assetKind}${subjectAlreadyStated ? "" : ` featuring ${task.visualSubject}`}`,
      userRequest ? `User description: ${userRequest}` : null,
      `Design ${metadata.character.name} as ${withIndefiniteArticle(metadata.character.species)}`,
      appearanceAlreadyStated
        ? null
        : `Use this defining appearance: ${metadata.character.description}`,
      clean(metadata.character.personality)
        ? `The character should feel ${metadata.character.personality}`
        : null,
      memory?.lore ? `Honor this established lore: ${memory.lore}` : null,
      memory?.visualStyle ? `Carry forward this established visual language within the selected rendering method: ${memory.visualStyle}` : null,
      memory?.designRules ? `Follow these established design principles: ${memory.designRules}` : null,
      memory?.preferredPrompt ? memory.preferredPrompt : null,
      memory?.approvedSummary ? `Preserve what is already working: ${memory.approvedSummary}` : null,
      listSentence("Work from these stated assumptions:", task.assumptions),
      listSentence("Include:", task.positiveConstraints),
      `Return one still raster image at ${task.dimensions}`,
    ]),
    section("Composition and Camera", [
      compositionDirection(task),
    ]),
    section("Detail-Level Constraints", [
      task.assetSettings.visualStyle === "PIXEL_ART"
        ? PIXEL_DETAIL_FRAGMENTS[task.assetSettings.pixelDetail]
        : null,
      task.assetSettings.visualStyle === "PIXEL_ART"
        ? "The logical sprite scale controls visual density and pixel language; it does not request a tiny physical API output"
        : null,
    ]),
    section("Background and Shadow Constraints", [
      background,
      SHADOW_FRAGMENTS[task.assetSettings.groundShadow],
    ]),
    section("Reference Guidance", referenceGuidance(task, metadata, styleSource)),
    section("Final Exclusion Rules", [
      memory?.rejectedSummary ? `Do not repeat these prior problems: ${memory.rejectedSummary}` : null,
      listSentence("Exclude:", finalExclusions),
    ]),
  ].filter((value): value is string => Boolean(value));

  return { compilerInstructions, compiledPrompt: sections.join("\n\n") };
}
