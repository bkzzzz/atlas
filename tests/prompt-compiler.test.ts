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

test("explicit technical settings compile into concrete production instructions", () => {
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
  assert.match(prompt, /strict orthographic side profile/i);
  assert.match(prompt, /pure white background/i);
  assert.match(prompt, /cast shadow, contact shadow, floor ellipse, or glow/i);
  assert.doesNotMatch(prompt, /override conflicting wording|Compiler rules|Positive constraints/i);
});

test("pixel-art constraints lead the prompt and prohibit post-process pixelation", () => {
  const prompt = compileSingleStaticImageTask(
    parsedTask(
      { ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS, visualStyle: "PIXEL_ART", pixelDetail: "LOW" },
      "Victorian gunslinger girl with long brown hair",
    ),
    metadata,
  ).compiledPrompt;

  assert.ok(prompt.startsWith("TRUE 2D PIXEL ART GAME ASSET."));
  assert.ok(prompt.indexOf("TRUE 2D PIXEL ART") < prompt.indexOf("Victorian gunslinger"));
  assert.match(prompt, /No anti-aliasing/i);
  assert.match(prompt, /Do not create a high-resolution digital painting and pixelate it afterward/i);
  assert.match(prompt, /logical sprite scale of 24x48 to 32x64/i);
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
  assert.ok(prompt.startsWith("TRUE 2D PIXEL ART GAME ASSET."));
  assert.match(prompt, /transparent background/i);
  assert.match(prompt, /ground shadow/i);
});

test("VECTOR_STYLE remains raster and ignores pixelDetail", () => {
  const prompt = compileSingleStaticImageTask(
    parsedTask({ ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS, visualStyle: "VECTOR_STYLE", pixelDetail: "HIGH" }),
    metadata,
  ).compiledPrompt;

  assert.match(prompt, /FLAT VECTOR-INSPIRED 2D GAME ASSET/i);
  assert.match(prompt, /raster image, not SVG/i);
  assert.doesNotMatch(prompt, /pixel art|pixel clusters|logical sprite scale|anti-aliasing/i);
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
    "Asset and Subject:",
    "Composition and Camera:",
    "Background and Shadow Constraints:",
    "Final Exclusion Rules:",
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

test("compiles selected family metadata once without leaking provenance", () => {
  const task = parsedTask(DEFAULT_STATIC_IMAGE_ASSET_SETTINGS);
  task.referenceGuidance = [
    {
      id: "secret-family-id-a",
      title: "Forest Mage",
      pack: "secret-pack-a",
      category: "Characters",
      tags: ["magic", "walk", "forest"],
    },
    {
      id: "secret-family-id-b",
      title: "forest mage",
      pack: "secret-pack-b",
      category: "characters",
      tags: ["MAGIC", "cloak"],
    },
  ];

  const prompt = compileSingleStaticImageTask(task, metadata).compiledPrompt;

  assert.match(
    prompt,
    /Reference Guidance:\nSelected reference families: Forest Mage\. Categories: Characters\. Objective tags: magic; walk; forest; cloak\. Use these as supporting visual direction only, without copying identity or assuming unlisted traits\. Preserve the requested subject, composition, dimensions, background, asset settings, and explicit constraints\./,
  );
  assert.equal(prompt.match(/Forest Mage/gi)?.length, 1);
  assert.equal(prompt.match(/\bmagic\b/gi)?.length, 1);
  assert.doesNotMatch(prompt, /secret-family-id|secret-pack|CC0|representativeImagePath/i);
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

  assert.match(transparentPrompt, /transparent background with no scenery, backdrop, or floor plane/i);
  assert.match(transparentPrompt, /cast shadow, contact shadow, floor ellipse, or glow/i);
  assert.match(whitePrompt, /pure white background/i);
});

test("medium pixel detail compiles scale, palette, clusters, and shading rather than a label", () => {
  const prompt = compileSingleStaticImageTask(
    parsedTask({
      ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
      visualStyle: "PIXEL_ART",
      pixelDetail: "MEDIUM",
    }),
    metadata,
  ).compiledPrompt;

  assert.match(prompt, /logical sprite scale of 32x64 to 48x96/i);
  assert.match(prompt, /medium-sized pixel clusters/i);
  assert.match(prompt, /approximately 16–32 colors/i);
  assert.match(prompt, /two-to-four-step shading/i);
  assert.doesNotMatch(prompt, /\bmedium detail\b/i);
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
