import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
  MAX_NATURAL_LANGUAGE_REQUEST_LENGTH,
  isSupportedTaskMode,
  runStaticImageMode,
  unsupportedMessageForTaskMode,
  validateParseTaskRequest,
} from "../src/lib/task-mode";

test("accepts a valid explicit STATIC_IMAGE parse request", () => {
  assert.deepEqual(
    validateParseTaskRequest({
      selectedMode: "STATIC_IMAGE",
      request: "Create a floating eye with a rotating golden outer ring.",
      assetSettings: DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
    }),
    {
      valid: true,
      value: {
        selectedMode: "STATIC_IMAGE",
        request: "Create a floating eye with a rotating golden outer ring.",
        assetSettings: DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
        styleSourceCharacterId: null,
      },
    },
  );
});

test("game asset defaults use an independent illustration style and transparent, shadow-free output", () => {
  assert.deepEqual(DEFAULT_STATIC_IMAGE_ASSET_SETTINGS, {
    visualStyle: "ILLUSTRATION",
    viewAngle: "UNSPECIFIED",
    background: "TRANSPARENT",
    pixelDetail: "MEDIUM",
    groundShadow: "NONE",
  });
});

test("accepts a separate style source character without changing visual style", () => {
  const validation = validateParseTaskRequest({
    selectedMode: "STATIC_IMAGE",
    request: "Create a sprite",
    assetSettings: {
      ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
      visualStyle: "PIXEL_ART",
    },
    styleSourceCharacterId: " character-2 ",
  });

  assert.equal(validation.valid, true);
  if (!validation.valid) return;
  assert.equal(validation.value.assetSettings.visualStyle, "PIXEL_ART");
  assert.equal(validation.value.styleSourceCharacterId, "character-2");
});

test("rejects missing or invalid selected modes and invalid request text before parsing", () => {
  const cases: unknown[] = [
    {},
    { request: "Create a sprite" },
    { selectedMode: "VIDEO", request: "Create a sprite", assetSettings: DEFAULT_STATIC_IMAGE_ASSET_SETTINGS },
    { selectedMode: "STATIC_IMAGE", request: "   ", assetSettings: DEFAULT_STATIC_IMAGE_ASSET_SETTINGS },
    { selectedMode: "STATIC_IMAGE", request: "x".repeat(MAX_NATURAL_LANGUAGE_REQUEST_LENGTH + 1), assetSettings: DEFAULT_STATIC_IMAGE_ASSET_SETTINGS },
  ];

  for (const value of cases) {
    assert.equal(validateParseTaskRequest(value).valid, false);
  }
});

test("rejects unknown asset-style enum values", () => {
  const validation = validateParseTaskRequest({
    selectedMode: "STATIC_IMAGE",
    request: "Create a sprite",
    assetSettings: { ...DEFAULT_STATIC_IMAGE_ASSET_SETTINGS, viewAngle: "DIAGONAL" },
  });

  assert.deepEqual(validation, {
    valid: false,
    error: "Choose valid static image asset settings.",
  });
});

test("unsupported selected modes are explicit and never eligible for the static parser flow", async () => {
  const modes = [
    ["ANIMATION", "Animation generation is not supported yet."],
    ["EDIT_IMAGE", "Image editing is not supported yet."],
    ["ASSET_SET", "Asset-set generation is not supported yet."],
    ["THREE_D_ASSET", "3D generation is not supported yet."],
  ] as const;

  for (const [mode, expectedMessage] of modes) {
    const validation = validateParseTaskRequest({
      selectedMode: mode,
      request: "Create an asset",
      assetSettings: DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
    });
    assert.equal(validation.valid, true);
    if (!validation.valid) continue;
    // The route evaluates this pure mode gate before any database, LLM,
    // compiler, or generation-token work can begin.
    assert.equal(isSupportedTaskMode(validation.value.selectedMode), false);
    assert.equal(unsupportedMessageForTaskMode(validation.value.selectedMode), expectedMessage);

    let parserCompilerAndTokenCalls = 0;
    const result = await runStaticImageMode(validation.value.selectedMode, async () => {
      parserCompilerAndTokenCalls += 1;
      return "generation-token";
    });
    assert.deepEqual(result, { supported: false, error: expectedMessage });
    assert.equal(parserCompilerAndTokenCalls, 0);
  }
});

test("STATIC_IMAGE alone enters the parser/compiler/token flow", async () => {
  let parserCompilerAndTokenCalls = 0;
  const result = await runStaticImageMode("STATIC_IMAGE", async () => {
    parserCompilerAndTokenCalls += 1;
    return "generation-token";
  });

  assert.deepEqual(result, { supported: true, value: "generation-token" });
  assert.equal(parserCompilerAndTokenCalls, 1);
});
