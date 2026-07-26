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

test("PIXEL_ART plus LOW detail adds the low-resolution pixel instructions", () => {
  const prompt = compileSingleStaticImageTask(
    parsedTask({ ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS, visualStyle: "PIXEL_ART", pixelDetail: "LOW" }),
    metadata,
  ).compiledPrompt;

  assert.match(prompt, /Pixel-art game asset with hard pixel edges, no anti-aliasing/i);
  assert.match(prompt, /Very low-resolution pixel-art appearance with large visible pixels and minimal detail/i);
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
  assert.match(prompt, /Pixel-art game asset with hard pixel edges/);
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
    expiresAt: 1_100,
  });
});
