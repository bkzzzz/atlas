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
    "PRODUCTION-READY 2D GAME ASSET. Keep the subject simple, isolated, and immediately readable at gameplay scale. Use a clear silhouette, controlled detail, clean separation from the background, and no unnecessary decorative complexity.",
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
    "Isolate the subject on a transparent background with no scenery, backdrop, or floor plane.",
  WHITE:
    "Isolate the subject on a pure white background with no scenery or environmental backdrop.",
  SIMPLE_SOLID:
    "Isolate the subject against one simple, flat solid-color background with no environmental scenery.",
  UNSPECIFIED: null,
};

const SHADOW_FRAGMENTS: Record<StaticImageAssetSettings["groundShadow"], string> = {
  NONE:
    "Do not include a cast shadow, contact shadow, floor ellipse, or glow beneath the subject.",
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

function referenceGuidance(task: ParsedStaticImageTask) {
  const guidance: string[] = [];

  if (task.referenceGuidance.length) {
    guidance.push(
      ...task.referenceGuidance.map(
        (reference, index) => `Image ${index + 1}: ${reference.title}`,
      ),
    );
    const categories = listSentence(
      "Categories:",
      task.referenceGuidance.map((reference) => reference.category),
    );
    const tags = listSentence(
      "Objective tags:",
      task.referenceGuidance.flatMap((reference) => reference.tags),
    );
    if (categories) guidance.push(categories);
    if (tags) guidance.push(tags);
    guidance.push(
      "Treat the input images as the primary source of visual style, including rendering technique, edge treatment, shape language, proportion conventions, palette treatment, and gameplay readability",
      "Do not copy their exact subject, identity, pose, composition, text, logos, or distinctive content",
      "The Draft StyleSpec remains authoritative",
      "Preserve the requested subject, composition, dimensions, background, asset settings, and explicit constraints",
    );
  }
  if (task.referenceAssets.length) {
    guidance.push(
      `Use the requested references ${unique(task.referenceAssets).join(", ")} for relevant visual style, palette, costume language, shape language, and theme only`,
    );
  }
  return guidance;
}

// This remains the only deterministic prompt compiler for the MVP.
// It translates validated structured data directly into a concise creative brief.
export function compileSingleStaticImageTask(
  task: ParsedStaticImageTask,
  _metadata: CharacterMetadata,
  _styleSource: CharacterMetadata | null = null,
): CompiledStaticImagePrompt {
  void _metadata;
  void _styleSource;

  const compilerInstructions = [
    "Create exactly one coherent still image.",
  ];
  const userRequest = clean(task.userRequest);
  const subjectAlreadyStated = includesConcept(userRequest, task.visualSubject);
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
  ]);

  const sections = [
    STYLE_FRAGMENTS[task.assetSettings.visualStyle],
    section("Asset and Subject", [
      `Create one ${task.assetKind}${subjectAlreadyStated ? "" : ` featuring ${task.visualSubject}`}`,
      userRequest ? `User description: ${userRequest}` : null,
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
    section("Reference Guidance", referenceGuidance(task)),
    section("Final Exclusion Rules", [
      listSentence("Exclude:", finalExclusions),
    ]),
  ].filter((value): value is string => Boolean(value));

  return { compilerInstructions, compiledPrompt: sections.join("\n\n") };
}
