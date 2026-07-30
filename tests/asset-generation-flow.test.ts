import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AmbientAssetShowcase } from "../src/components/ambient-asset-showcase";
import {
  CharacterAssetWorkspace,
  CharacterStudio,
} from "../src/components/character-studio";
import { LlmTaskParser } from "../src/components/llm-task-parser";
import {
  ASSET_WORKFLOWS,
  buildProductArtRequest,
  runProductGeneration,
} from "../src/lib/asset-generation-flow";
import { DEFAULT_STATIC_IMAGE_ASSET_SETTINGS } from "../src/lib/task-mode";

test("the ambient asset showcase is decorative, local, and non-interactive", () => {
  const html = renderToStaticMarkup(React.createElement(AmbientAssetShowcase));
  const decodedHtml = decodeURIComponent(html);

  assert.match(html, /aria-hidden="true"/);
  assert.ok((html.match(/atlas-showcase__band/g) ?? []).length >= 4);
  assert.match(html, /atlas-showcase__archive/);
  assert.match(html, /Atlas reference archive/);
  assert.match(html, /Visual field notes/);
  assert.ok((decodedHtml.match(/\/references\//g) ?? []).length >= 8);
  assert.doesNotMatch(html, /<(?:a|button)\b/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test("the opening experience identifies Atlas and its creative purpose", () => {
  const html = renderToStaticMarkup(React.createElement(CharacterStudio));

  assert.match(html, /<header[^>]*class="atlas-hero"/);
  assert.match(html, />Atlas</);
  assert.match(html, /Character production system/);
  assert.match(html, /Generate game assets/);
  assert.match(html, /that belong together\./);
  assert.match(
    html,
    /combines AI, reusable characters, and visual references to create assets with consistent art direction/,
  );
  assert.match(html, />Create Character</);
  assert.doesNotMatch(html, />Your characters</);
});

test("ambient motion respects reduced-motion and small-screen preferences", () => {
  const css = readFileSync(
    new URL("../src/app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.atlas-app::after/);
  assert.match(css, /\.atlas-workspace::before/);
  assert.match(css, /\.atlas-showcase__band--4/);
  assert.match(css, /\.atlas-showcase__archive/);
  assert.match(
    css,
    /@media \(max-width: 1199px\)[\s\S]*?\.atlas-showcase__archive/,
  );
  assert.match(
    css,
    /@media \(max-width: 1023px\)[\s\S]*?\.atlas-showcase__band--4/,
  );
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.atlas-showcase__track/);
  assert.match(
    css,
    /@media \(max-width: 767px\)[\s\S]*?\.atlas-app::after[\s\S]*?display: none[\s\S]*?\.atlas-showcase/,
  );
});

test("the beta character workspace omits metadata and developer previews", () => {
  const html = renderToStaticMarkup(
    React.createElement(CharacterAssetWorkspace, {
      character: {
        id: "character-1",
        name: "Mira",
        description: "A storm scout.",
        personality: "Resolute",
        species: "Human",
        createdAt: "2026-07-25T12:00:00.000Z",
      },
      characters: [],
    }),
  );

  assert.match(html, /Visual references/);
  assert.match(html, /Add asset/);
  assert.match(html, /Persistent creative context/);
  assert.match(html, /Create memory/);
  assert.match(html, /Create game asset/);
  assert.doesNotMatch(html, /Metadata engine|Metadata preview|Developer details/);
});

test("the beta asset form presents production controls in order without internal UI", () => {
  const html = renderToStaticMarkup(
    React.createElement(LlmTaskParser, {
      characterId: "character-1",
      characterName: "Mira",
      styleCharacters: [{ id: "character-2", name: "Nova" }],
    }),
  );

  const expectedOrder = [
    "Create game asset",
    "Static image",
    "Character",
    "Asset type",
    "Style source",
    "Visual style",
    "Camera / view",
    "Background",
    "Ground shadow",
    "Advanced",
    "Optional art direction",
    "Generate",
  ];
  let previous = -1;
  for (const label of expectedOrder) {
    const position = html.indexOf(label);
    assert.ok(position > previous, `${label} should follow the previous section`);
    previous = position;
  }

  assert.match(
    html,
    /<details[^>]*><summary[^>]*>[\s\S]*?Advanced[\s\S]*?Add extra creative or production instructions\.[\s\S]*?Optional art direction/,
  );
  assert.doesNotMatch(html, /<details[^>]*open/);
  assert.doesNotMatch(html, /Output format|Advanced controls|Developer details/);
});

test("the workflow picker offers static images while animation modes remain unavailable", () => {
  assert.deepEqual(
    ASSET_WORKFLOWS.map(({ label, executable }) => [label, executable]),
    [
      ["Static image", true],
      ["Idle animation", false],
      ["Walk animation", false],
    ],
  );

  const html = renderToStaticMarkup(
    React.createElement(LlmTaskParser, {
      characterId: "character-1",
      characterName: "Mira",
    }),
  );
  assert.doesNotMatch(html, /Vector asset|Raster vector-style PNG/);
  assert.equal((html.match(/Unavailable/g) ?? []).length, 2);
  assert.match(html, /<button[^>]*disabled[^>]*>[\s\S]*?Idle animation/);
  assert.match(html, /<button[^>]*disabled[^>]*>[\s\S]*?Walk animation/);
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
