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
  approvedAssets: [],
  rejectedAssets: [],
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

test("explicit technical settings are preserved without compiler-oriented labels", () => {
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
  assert.match(prompt, /Technical Requirements:/);
  assert.match(prompt, /from the side/i);
  assert.match(prompt, /plain white background/i);
  assert.match(prompt, /Do not include a ground shadow or cast shadow beneath the subject/i);
  assert.doesNotMatch(prompt, /override conflicting wording|Compiler rules|Positive constraints/i);
});

test("PIXEL_ART uses native pixel-art wording and respects selected detail", () => {
  const prompt = compileSingleStaticImageTask(
    parsedTask({ ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS, visualStyle: "PIXEL_ART", pixelDetail: "LOW" }),
    metadata,
  ).compiledPrompt;

  assert.match(prompt, /native pixel art with a consistent pixel scale, deliberate pixel clusters, a limited palette, and no painterly smoothing/i);
  assert.match(prompt, /pixel detail intentionally simple/i);
  assert.doesNotMatch(prompt, /very low-resolution|large visible pixels|minimal detail/i);
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

  assert.match(prompt, /Draw style and theme from Nova, especially storybook cut paper; rounded layered shapes; warm paper texture/i);
  assert.match(prompt, /native pixel-art visual style/i);
  assert.match(prompt, /transparent background/i);
  assert.match(prompt, /ground shadow/i);
});

test("VECTOR_STYLE remains raster and ignores pixelDetail", () => {
  const prompt = compileSingleStaticImageTask(
    parsedTask({ ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS, visualStyle: "VECTOR_STYLE", pixelDetail: "HIGH" }),
    metadata,
  ).compiledPrompt;

  assert.match(prompt, /clean vector-inspired style with simple geometric shapes, crisp contours, and flat fills/i);
  assert.match(prompt, /raster image, not SVG/i);
  assert.doesNotMatch(prompt, /pixel art|pixel clusters|large visible pixels|hard pixel edges/i);
});

test("omits empty fields and empty sections", () => {
  const prompt = compileSingleStaticImageTask(
    parsedTask(DEFAULT_STATIC_IMAGE_ASSET_SETTINGS),
    metadata,
  ).compiledPrompt;

  assert.doesNotMatch(prompt, /Not specified|Reference assets: None|Assumptions: None/);
  assert.doesNotMatch(prompt, /Reference Guidance:/);
});

test("deduplicates repeated attributes in structured lists", () => {
  const task = parsedTask(DEFAULT_STATIC_IMAGE_ASSET_SETTINGS);
  task.positiveConstraints = ["ornate gold ring", "Ornate gold ring", "clear crisp edges"];
  const prompt = compileSingleStaticImageTask(task, metadata).compiledPrompt;

  assert.equal(prompt.match(/ornate gold ring/gi)?.length, 1);
});

test("outputs a concise creative brief using only supported section headings", () => {
  const prompt = compileSingleStaticImageTask(
    parsedTask(DEFAULT_STATIC_IMAGE_ASSET_SETTINGS),
    metadata,
  ).compiledPrompt;
  const headings = prompt.split("\n").filter((line) => line.endsWith(":"));

  assert.deepEqual(headings, [
    "Creative Brief:",
    "Art Direction:",
    "Asset Requirements:",
    "Technical Requirements:",
  ]);
  assert.ok(prompt.length < 1_400);
});

test("approved and requested references receive guidance without copying identity", () => {
  const task = parsedTask(DEFAULT_STATIC_IMAGE_ASSET_SETTINGS);
  task.referenceAssets = ["vintage RPG portrait"];
  const prompt = compileSingleStaticImageTask(task, {
    ...metadata,
    approvedAssets: [{
      id: "asset-1",
      name: "Gothic palette study",
      imageUrl: "https://example.com/reference.png",
      type: "Palette",
      provider: "Manual",
      prompt: null,
      createdAt: "2026-07-27T00:00:00.000Z",
    }],
  }).compiledPrompt;

  assert.match(prompt, /Reference Guidance:/);
  assert.match(prompt, /visual style, palette, costume language, shape language, and theme/i);
  assert.match(prompt, /without copying another character's identity/i);
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
  assert.match(whitePrompt, /Do not include a ground shadow or cast shadow beneath the subject/i);
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
    expiresAt: 1_100,
  });
});
