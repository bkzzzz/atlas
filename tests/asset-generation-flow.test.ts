import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LlmTaskParser } from "../src/components/llm-task-parser";
import {
  ASSET_WORKFLOWS,
  buildProductArtRequest,
  runProductGeneration,
} from "../src/lib/asset-generation-flow";
import { DEFAULT_STATIC_IMAGE_ASSET_SETTINGS } from "../src/lib/task-mode";

test("the default product form exposes only executable product choices", () => {
  const html = renderToStaticMarkup(
    React.createElement(LlmTaskParser, {
      characterId: "character-1",
      characterName: "Mira",
      developerMode: false,
      styleCharacters: [{ id: "character-2", name: "Nova" }],
    }),
  );

  assert.match(html, /Create game asset/);
  assert.match(html, />Character</);
  assert.match(html, /Mira/);
  assert.match(html, />Asset type</);
  assert.match(html, />Output format</);
  assert.match(html, />Generate</);
  assert.match(html, /Optional art direction/);
  assert.match(html, /Create a new style/);
  assert.match(html, /Inherit another character&#x27;s style\/theme/);
  assert.match(html, /Advanced controls/);
  assert.match(html, /Pixel art/);
  assert.match(html, /Flat Illustration/);
  assert.doesNotMatch(html, /Inherit character style/);
  assert.doesNotMatch(html, />Vector style</);
  assert.doesNotMatch(html, /Parse and compile/);
  assert.doesNotMatch(html, /Developer details/);
});

test("developer mode keeps diagnostics read-only behind a disclosure", () => {
  const html = renderToStaticMarkup(
    React.createElement(LlmTaskParser, {
      characterId: "character-1",
      characterName: "Mira",
      developerMode: true,
    }),
  );

  assert.match(html, /Developer details/);
  assert.doesNotMatch(html, /Parse and compile/);
  assert.doesNotMatch(html, /Generate compiled image/);
  assert.doesNotMatch(html, /one-time-token/);
});

test("future workflows are explicit and cannot silently use static generation", () => {
  assert.deepEqual(
    ASSET_WORKFLOWS.map(({ label, executable }) => [label, executable]),
    [
      ["Static image", true],
      ["Vector asset", false],
      ["Idle animation", false],
      ["Walk animation", false],
    ],
  );

  const html = renderToStaticMarkup(
    React.createElement(LlmTaskParser, {
      characterId: "character-1",
      characterName: "Mira",
      developerMode: false,
    }),
  );
  assert.match(html, /Static image<\/span><span[^>]*>Available/);
  assert.equal((html.match(/Experimental · unavailable/g) ?? []).length, 3);
  assert.doesNotMatch(html, /<button[^>]*>[^<]*(?:Vector asset|Idle animation|Walk animation)/);
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
