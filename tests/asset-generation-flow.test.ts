import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LlmTaskParser } from "../src/components/llm-task-parser";
import {
  buildProductArtRequest,
  runProductGeneration,
} from "../src/lib/asset-generation-flow";
import {
  REFERENCE_LIBRARY,
  type KenneyReferenceSelection,
} from "../src/lib/reference-retrieval";
import { DEFAULT_STATIC_IMAGE_ASSET_SETTINGS } from "../src/lib/task-mode";

test("the product form presents the staged art-direction workflow without diagnostics", () => {
  const html = renderToStaticMarkup(
    React.createElement(LlmTaskParser, {
      characterId: "character-1",
      characterName: "Mira",
    }),
  );

  assert.match(html, /Project brief/);
  assert.match(html, /Asset request/);
  assert.match(html, /Generate draft StyleSpec/);
  assert.match(html, /Curated references/);
  assert.match(html, /Refined StyleSpec/);
  assert.match(html, /Generation result/);
  assert.match(html, /Advanced/);
  assert.match(html, /Pixel art/);
  assert.doesNotMatch(html, /Developer details/);
  assert.doesNotMatch(html, /Output format/);
  assert.doesNotMatch(html, /Experimental · unavailable/);
  assert.doesNotMatch(html, /compiled prompt/i);
  assert.doesNotMatch(html, /token/i);
});

test("Generate performs parse, compile, then token-backed generation exactly once", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const requestJson = async (url: string, body: unknown) => {
    calls.push({ url, body });
    if (url.endsWith("/parse-task")) {
      return {
        parsedTask: { assetKind: "sprite" },
        compilerInstructions: ["Create exactly one coherent still image."],
        compiledPrompt: "trusted compiled prompt",
        generationToken: "one-time-token",
        parser: {
          model: "mock-parser",
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 30,
            estimatedCostUsd: 0.001,
          },
        },
      };
    }
    return {
      image: {
        imageUrl: "data:image/png;base64,aGVsbG8=",
        model: "mock-image-model",
        compiledPrompt: "trusted compiled prompt",
        createdAt: "2026-07-25T12:00:00.000Z",
      },
    };
  };

  const result = await runProductGeneration(
    {
      characterId: "character-1",
      characterName: "Mira",
      assetType: "CHARACTER_SPRITE",
      artDirection: "  a confident stance  ",
      assetSettings: DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
      styleSourceCharacterId: "character-2",
      selectedReferences: [],
    },
    requestJson,
  );

  assert.deepEqual(calls, [
    {
      url: "/api/characters/character-1/parse-task",
      body: {
        selectedMode: "STATIC_IMAGE",
        request: "Create a character sprite for Mira. Additional art direction: a confident stance",
        assetSettings: DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
        styleSourceCharacterId: "character-2",
      },
    },
    {
      url: "/api/generate-image",
      body: { generationToken: "one-time-token" },
    },
  ]);
  assert.equal(result.parseResult.generationToken, null);
  assert.equal(result.image.model, "mock-image-model");
});

test("product requests remain valid without optional prompt-oriented input", () => {
  assert.equal(
    buildProductArtRequest({
      characterName: "Mira",
      assetType: "ICON",
      artDirection: "   ",
    }),
    "Create an icon for Mira.",
  );
});

test("selected references influence the existing request through metadata only", () => {
  const request = buildProductArtRequest({
    characterName: "Mira",
    assetType: "ICON",
    artDirection: "A forest inventory icon.",
    selectedReferences: [REFERENCE_LIBRARY[0]],
  });

  assert.match(request, /Selected curated reference metadata/);
  assert.match(request, /Metadata guidance only; reference images are not visual inputs/);
  assert.match(request, new RegExp(REFERENCE_LIBRARY[0].title));
  assert.doesNotMatch(request, /\/references\//);
  assert.doesNotMatch(request, new RegExp(REFERENCE_LIBRARY[0].id));
});

test("selected Kenney families refine the existing request through metadata only", () => {
  const family: KenneyReferenceSelection = {
    kind: "kenney-family",
    id: "kenney-space-shooter-laser-private",
    title: "Space Shooter Remastered · Laser",
    previewUrl: "/api/references/image?id=kenney-space-shooter-laser-private",
    pack: "Space Shooter Remastered",
    category: "sci-fi",
    tags: ["laser", "sci-fi", "space"],
    source: "Kenney",
    author: "Kenney",
    license: "CC0-1.0",
  };
  const request = buildProductArtRequest({
    characterName: "Mira",
    assetType: "PROP",
    artDirection: "A compact sci-fi weapon.",
    selectedReferences: [family],
  });

  assert.match(request, /Space Shooter Remastered · Laser/);
  assert.match(request, /tags: laser, sci-fi, space/);
  assert.match(request, /Metadata guidance only; reference images are not visual inputs/);
  assert.doesNotMatch(
    request,
    /kenney-space-shooter-laser-private|\/api\/references\/image|image-to-image/,
  );
});
