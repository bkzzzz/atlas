import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationSession } from "../src/lib/generation-session";
import { compileSingleStaticImageTask } from "../src/lib/single-image-compiler";
import { validateParsedStaticImageTask } from "../src/lib/task-schema";
import {
  DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
  runStaticImageMode,
  type StaticImageAssetSettings,
} from "../src/lib/task-mode";

const metadata = {
  version: "1.0" as const,
  character: {
    id: "character-1",
    name: "Atlas eye",
    description: "A floating eye creature",
    personality: "watchful",
    species: "arcane creature",
  },
  memory: null,
  visualReferences: [],
};

const staticTask = {
  assetKind: "sprite",
  visualSubject: "floating eye with a rotating golden outer ring",
  visualStyle: "painterly fantasy",
  composition: "centered front view",
  dimensions: "1024x1024",
  background: "dark studio backdrop",
  positiveConstraints: ["clear crisp edges"],
  negativeConstraints: ["no ground shadow"],
  referenceAssets: [],
  assumptions: [],
};

function parsedTask(
  settings: StaticImageAssetSettings,
  request = "Generate a floating eye creature with a rotating golden outer ring.",
) {
  const parsed = validateParsedStaticImageTask(staticTask, request, settings);
  assert.ok(parsed);
  return parsed;
}

test("compiles identical structured input into the exact same prompt", () => {
  const settings = { ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS, visualStyle: "PIXEL_ART" as const };
  const task = parsedTask(settings);

  assert.deepEqual(
    compileSingleStaticImageTask(task, metadata),
    compileSingleStaticImageTask(task, metadata),
  );
});

test("all attached visual references compile once without approval language or contradictory empty references", () => {
  const prompt = compileSingleStaticImageTask(
    parsedTask(DEFAULT_STATIC_IMAGE_ASSET_SETTINGS),
    {
      ...metadata,
      visualReferences: [
        {
          id: "reference-1",
          name: "Gothic",
          imageUrl: "https://example.com/gothic.png",
          type: "Mood board",
          provider: "Manual",
          prompt: null,
          createdAt: "2026-07-29T10:00:00.000Z",
        },
      ],
    },
  ).compiledPrompt;

  assert.match(prompt, /Visual references: Gothic \(Mood board, Manual\)/);
  assert.doesNotMatch(prompt, /Approved visual references|Avoid rejected references/i);
  assert.doesNotMatch(prompt, /Reference assets: None/i);
});

test("explicit settings reach the task and override conflicting natural-language wording", () => {
  const task = parsedTask(
    {
      visualStyle: "PIXEL_ART",
      viewAngle: "SIDE",
      background: "WHITE",
      pixelDetail: "LOW",
      groundShadow: "NONE",
    },
    "Make a smooth front-view illustration on a black background with a ground shadow.",
  );
  const prompt = compileSingleStaticImageTask(task, metadata).compiledPrompt;

  assert.equal(task.assetSettings.viewAngle, "SIDE");
  assert.equal(task.assetSettings.background, "WHITE");
  assert.match(prompt, /The explicit asset settings below override conflicting wording/i);
  assert.match(prompt, /Strict side view, camera level with the subject/i);
  assert.match(prompt, /Isolated subject on a plain white background/i);
  assert.match(prompt, /No ground shadow, no cast shadow beneath the subject/i);
  assert.ok(prompt.indexOf("Strict side view") > prompt.indexOf("front-view"));
});

test("PIXEL_ART compiles a dedicated game-sprite production template", () => {
  const prompt = compileSingleStaticImageTask(
    parsedTask({ ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS, visualStyle: "PIXEL_ART", pixelDetail: "LOW" }),
    metadata,
  ).compiledPrompt;

  assert.match(prompt, /RENDERING MODE: PIXEL_ART/);
  assert.match(prompt, /authentic, production-ready pixel art game sprite/i);
  assert.match(prompt, /crisp square pixels/i);
  assert.match(prompt, /nearest-neighbor appearance/i);
  assert.match(prompt, /no anti-aliasing/i);
  assert.match(prompt, /no smooth gradients/i);
  assert.match(prompt, /no painterly rendering/i);
  assert.match(prompt, /limited color palette/i);
  assert.match(prompt, /simple, readable shading/i);
  assert.match(prompt, /readable at both 32×32 and 64×64/i);
  assert.match(prompt, /strict front-facing orthographic view/i);
  assert.match(prompt, /transparent background/i);
  assert.match(prompt, /large, deliberate pixel clusters with minimal detail/i);
  assert.doesNotMatch(
    prompt,
    /highly detailed illustration|rendered painting|realistic lighting|cinematic rendering|soft shading/i,
  );
});

test("PIXEL_ART treats attached images as style references without copying their subjects", () => {
  const prompt = compileSingleStaticImageTask(
    parsedTask({ ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS, visualStyle: "PIXEL_ART" }),
    {
      ...metadata,
      visualReferences: [
        {
          id: "reference-1",
          name: "Knight sprite",
          imageUrl: "https://example.com/knight.png",
          type: "Sprite sheet",
          provider: "Manual",
          prompt: null,
          createdAt: "2026-07-29T10:00:00.000Z",
        },
      ],
    },
  ).compiledPrompt;

  assert.match(prompt, /PIXEL ART REFERENCE ROLE:/);
  assert.match(prompt, /primarily as visual style references/i);
  assert.match(prompt, /pixel density/i);
  assert.match(prompt, /outline thickness/i);
  assert.match(prompt, /palette complexity/i);
  assert.match(prompt, /shading style/i);
  assert.match(prompt, /camera angle/i);
  assert.match(prompt, /Do not copy the reference subject/i);
});

test("style source inheritance is independent from the selected visual style", () => {
  const styleSource = {
    ...metadata,
    character: { ...metadata.character, id: "character-2", name: "Nova" },
    memory: {
      visualStyle: "storybook cut paper",
      lore: null,
      designRules: "rounded layered shapes",
      approvedSummary: null,
      rejectedSummary: null,
      preferredPrompt: "warm paper texture",
    },
  };
  const prompt = compileSingleStaticImageTask(
    parsedTask({
      ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
      visualStyle: "PIXEL_ART",
    }),
    metadata,
    styleSource,
  ).compiledPrompt;

  assert.match(prompt, /Style source: Inherit Nova's style\/theme/);
  assert.match(prompt, /Inherited visual style: storybook cut paper/);
  assert.match(prompt, /Inherited design rules: rounded layered shapes/);
  assert.match(prompt, /RENDERING MODE: PIXEL_ART/);
  assert.match(prompt, /Isolated subject on a transparent background/i);
  assert.match(prompt, /No ground shadow/i);
});

test("VECTOR_STYLE remains raster and ignores pixelDetail", () => {
  const prompt = compileSingleStaticImageTask(
    parsedTask({ ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS, visualStyle: "VECTOR_STYLE", pixelDetail: "HIGH" }),
    metadata,
  ).compiledPrompt;

  assert.match(prompt, /Clean vector-style game asset with simple geometric shapes, crisp contours, and flat fills\. Raster image output, not SVG\./i);
  assert.doesNotMatch(prompt, /Detailed pixel art|pixel clusters|large visible pixels|hard pixel edges/i);
});

test("background and ground-shadow selections compile predictably", () => {
  const transparentPrompt = compileSingleStaticImageTask(
    parsedTask({ ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS, background: "TRANSPARENT" }),
    metadata,
  ).compiledPrompt;
  const whitePrompt = compileSingleStaticImageTask(
    parsedTask({ ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS, background: "WHITE", groundShadow: "NONE" }),
    metadata,
  ).compiledPrompt;

  assert.match(transparentPrompt, /Isolated subject on a transparent background/i);
  assert.match(whitePrompt, /Isolated subject on a plain white background/i);
  assert.match(whitePrompt, /No ground shadow, no cast shadow beneath the subject/i);
});

test("STATIC_IMAGE validates, compiles, and receives a one-time token", async () => {
  const session = createGenerationSession({
    now: () => 1_000,
    createToken: () => "static-image-token",
    ttlMs: 100,
  });
  const task = parsedTask(DEFAULT_STATIC_IMAGE_ASSET_SETTINGS);
  const compiled = compileSingleStaticImageTask(task, metadata);
  const result = await runStaticImageMode("STATIC_IMAGE", async () =>
    session.createGenerationToken(compiled.compiledPrompt),
  );

  assert.deepEqual(result, { supported: true, value: "static-image-token" });
  assert.deepEqual(session.consumeGenerationToken("static-image-token"), {
    compiledPrompt: compiled.compiledPrompt,
    background: "opaque",
    referenceAssetIds: [],
    expiresAt: 1_100,
  });
});
