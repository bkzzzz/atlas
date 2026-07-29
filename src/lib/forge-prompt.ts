import type {
  ForgeAssetType,
  ForgeRequestInput,
  ForgeViewAngle,
  ForgeVisualStyle,
} from "@/lib/forge-request";

const ASSET_DIRECTIONS: Record<ForgeAssetType, string> = {
  CHARACTER:
    "Create one complete game character with a strong, readable full-body silhouette and production-ready costume design.",
  ITEM:
    "Create one self-contained game item with a strong silhouette, readable materials, and clear gameplay function.",
  ICON:
    "Create one bold game UI icon with a simple recognizable symbol, crisp visual hierarchy, and excellent small-size readability.",
  ENVIRONMENT:
    "Create one cohesive environment asset with a clear focal area, readable playable-space shapes, and no characters dominating the scene.",
};

const STYLE_DIRECTIONS: Record<ForgeVisualStyle, string> = {
  PIXEL_ART:
    "Render as authentic 2D pixel art built from deliberate square pixel clusters, hard edges, a limited palette, and stepped shading. Do not use anti-aliasing, smooth gradients, painterly texture, photorealism, or 3D rendering.",
  FANTASY_2D:
    "Render as polished hand-painted 2D fantasy game art with expressive shapes, cohesive color and lighting, controlled detail, and no photorealism or 3D-rendered appearance.",
  STORYBOOK:
    "Render as charming 2D storybook fantasy art with hand-drawn contours, whimsical shapes, tactile illustrated texture, a distinctive palette, and no photorealism or 3D-rendered appearance.",
};

const VIEW_DIRECTIONS: Record<ForgeViewAngle, string> = {
  FRONT:
    "Use a strict front-facing orthographic view with a level camera and an immediately readable silhouette.",
  SIDE:
    "Use a strict orthographic side view with a level camera; do not drift into a three-quarter angle.",
  ISOMETRIC:
    "Use a clean, consistent isometric game view with readable depth and no perspective distortion.",
  TOP_DOWN:
    "Use a direct top-down game view with a consistent orientation and clearly separated forms.",
};

function normalizePrompt(prompt: string | null) {
  return prompt?.replace(/\s+/gu, " ").trim() || null;
}

export function compileForgePrompt(input: ForgeRequestInput) {
  const creativeDirection = normalizePrompt(input.prompt);
  const sections = [
    "Create exactly one production-ready 2D game asset in one still image.",
    ASSET_DIRECTIONS[input.assetType],
    STYLE_DIRECTIONS[input.visualStyle],
    VIEW_DIRECTIONS[input.viewAngle],
    input.referenceImage
      ? "Use the supplied reference image as visual guidance for subject identity, key shapes, palette, and design language. Re-render it as the requested game asset; do not paste, frame, or reproduce the source image as a picture inside the output."
      : "Invent a clear original design that fully satisfies the selected asset type, style, and camera view.",
    creativeDirection
      ? `Additional creative direction: ${creativeDirection}`
      : "No additional creative direction was supplied; make confident, cohesive design choices.",
    input.assetType === "ENVIRONMENT"
      ? "Fill the square canvas with one cohesive environment composition. Do not create a contact sheet, multi-panel layout, UI mockup, or asset sheet."
      : "Center the complete asset with comfortable padding and isolate it cleanly from the background. Prefer transparency when supported; otherwise use one plain, unobtrusive background color.",
    "Output rules: one asset only, square composition, no sprite sheet, no turnaround sheet, no alternate variants, no panels, no border, no caption, no labels, no watermark, and no signature.",
  ];

  return sections.join("\n\n");
}
