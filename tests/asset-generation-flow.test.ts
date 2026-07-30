import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LlmTaskParser,
  PromptCompilerDebugPanel,
} from "../src/components/llm-task-parser";
import {
  buildProductArtRequest,
  runProductCompile,
  runProductGeneration,
} from "../src/lib/asset-generation-flow";
import {
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
  assert.match(html, /sent as visual references/i);
  assert.match(html, /Advanced/);
  assert.match(html, /Pixel art/);
  assert.doesNotMatch(html, /Developer details/);
  assert.doesNotMatch(html, /Output format/);
  assert.doesNotMatch(html, /Experimental · unavailable/);
  assert.doesNotMatch(html, /compiled prompt/i);
  assert.doesNotMatch(html, /token/i);
  assert.doesNotMatch(html, /metadata, not visual input/i);
});

test("compiled prompt debug panel is visible outside production and hidden in production", () => {
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  const originalNodeEnv = mutableEnvironment.NODE_ENV;
  const compiledPrompt =
    "Create one fantasy tower.\n\nUse a compact silhouette and transparent background.";

  try {
    mutableEnvironment.NODE_ENV = "development";
    const developmentHtml = renderToStaticMarkup(
      React.createElement(PromptCompilerDebugPanel, { compiledPrompt }),
    );

    assert.match(developmentHtml, /Development · Compiled prompt/);
    assert.match(developmentHtml, /Create one fantasy tower/);
    assert.match(developmentHtml, /transparent background/);

    mutableEnvironment.NODE_ENV = "production";
    const productionHtml = renderToStaticMarkup(
      React.createElement(PromptCompilerDebugPanel, { compiledPrompt }),
    );

    assert.equal(productionHtml, "");
  } finally {
    if (originalNodeEnv === undefined) {
      delete mutableEnvironment.NODE_ENV;
    } else {
      mutableEnvironment.NODE_ENV = originalNodeEnv;
    }
  }
});

test("Generate performs one Draft parse, deterministic compile, then token-backed generation", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const requestJson = async (url: string, body: unknown) => {
    calls.push({ url, body });
    if (url.endsWith("/parse-task")) {
      return {
        parsedTask: {
          assetKind: "sprite",
          referenceGuidance: [],
        },
        compilerInstructions: ["Create exactly one coherent still image."],
        compiledPrompt: "draft compiled prompt",
        generationToken: null,
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
    if (url.endsWith("/compile-task")) {
      return {
        parsedTask: {
          assetKind: "sprite",
          referenceGuidance: [{ id: "kenney-reference-1" }],
        },
        compilerInstructions: ["Create exactly one coherent still image."],
        compiledPrompt: "trusted compiled prompt",
        generationToken: "one-time-token",
        refinementMode: "deterministic-merge",
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
      selectedReferences: [{
        kind: "kenney-family",
        id: "kenney-reference-1",
        title: "Reference 1",
        previewUrl: "/api/references/image?id=kenney-reference-1",
        pack: "Pack",
        category: "character",
        tags: ["sprite"],
        source: "Kenney",
        author: "Kenney",
        license: "CC0-1.0",
      }],
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
      url: "/api/characters/character-1/compile-task",
      body: {
        draftStyleSpec: {
          assetKind: "sprite",
          referenceGuidance: [],
        },
        referenceIds: ["kenney-reference-1"],
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

test("selected references never enter the natural-language Draft request", () => {
  const request = buildProductArtRequest({
    characterName: "Mira",
    assetType: "ICON",
    artDirection: "A forest inventory icon.",
    selectedReferences: [{
      kind: "kenney-family",
      id: "kenney-private-id",
      title: "Private browser title",
      previewUrl: "/api/references/image?id=kenney-private-id",
      pack: "Private pack",
      category: "icon",
      tags: ["private-tag"],
      source: "Kenney",
      author: "Kenney",
      license: "CC0-1.0",
    }],
  });

  assert.equal(
    request,
    "Create an icon for Mira. Additional art direction: A forest inventory icon.",
  );
  assert.doesNotMatch(request, /private|reference|Kenney/i);
});

test("deterministic refinement submits only the Draft and selected IDs", async () => {
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
  const calls: Array<{ url: string; body: unknown }> = [];
  await runProductCompile(
    {
      characterId: "character-1",
      draftStyleSpec: {
        assetKind: "prop",
        visualSubject: "compact sci-fi weapon",
        visualStyle: "pixel art",
        composition: "side view",
        dimensions: "1024x1024",
        background: "transparent",
        positiveConstraints: [],
        negativeConstraints: [],
        referenceAssets: [],
        assumptions: [],
        assetSettings: DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
        userRequest: "Create a compact sci-fi weapon.",
        referenceGuidance: [],
      },
      referenceIds: [family.id],
      styleSourceCharacterId: null,
    },
    async (url, body) => {
      calls.push({ url, body });
      return {
        parsedTask: {},
        compilerInstructions: [],
        compiledPrompt: "",
        generationToken: "token",
        refinementMode: "deterministic-merge",
      };
    },
  );

  assert.deepEqual(calls, [{
    url: "/api/characters/character-1/compile-task",
    body: {
      draftStyleSpec: {
        assetKind: "prop",
        visualSubject: "compact sci-fi weapon",
        visualStyle: "pixel art",
        composition: "side view",
        dimensions: "1024x1024",
        background: "transparent",
        positiveConstraints: [],
        negativeConstraints: [],
        referenceAssets: [],
        assumptions: [],
        assetSettings: DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
        userRequest: "Create a compact sci-fi weapon.",
        referenceGuidance: [],
      },
      referenceIds: ["kenney-space-shooter-laser-private"],
      styleSourceCharacterId: null,
    },
  }]);
  assert.doesNotMatch(
    JSON.stringify(calls),
    /"title"|"pack"|"tags"|"source"|"author"|"license"|"previewUrl"/,
  );
});
