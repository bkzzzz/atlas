import assert from "node:assert/strict";
import test from "node:test";
import { compileForgePrompt } from "../src/lib/forge-prompt";
import type { ForgeRequestInput } from "../src/lib/forge-request";

function input(
  overrides: Partial<ForgeRequestInput> = {},
): ForgeRequestInput {
  return {
    assetType: "CHARACTER",
    visualStyle: "PIXEL_ART",
    viewAngle: "FRONT",
    prompt: null,
    referenceImage: null,
    ...overrides,
  };
}

test("compiles the same production prompt deterministically", () => {
  const request = input({
    prompt: "  A moss knight\nwith an amber lantern.  ",
  });

  const first = compileForgePrompt(request);
  const second = compileForgePrompt(request);

  assert.equal(first, second);
  assert.match(first, /^Create exactly one production-ready 2D game asset/);
  assert.match(first, /one complete game character/);
  assert.match(first, /authentic 2D pixel art/);
  assert.match(first, /strict front-facing orthographic view/);
  assert.match(first, /Additional creative direction: A moss knight with an amber lantern\./);
  assert.match(first, /one asset only/);
  assert.match(first, /no sprite sheet/);
});

test("maps every required selection to explicit art direction", () => {
  const cases: Array<{
    request: Partial<ForgeRequestInput>;
    expected: RegExp;
  }> = [
    { request: { assetType: "ITEM" }, expected: /one self-contained game item/ },
    { request: { assetType: "ICON" }, expected: /one bold game UI icon/ },
    { request: { assetType: "ENVIRONMENT" }, expected: /one cohesive environment asset/ },
    { request: { visualStyle: "FANTASY_2D" }, expected: /hand-painted 2D fantasy/ },
    { request: { visualStyle: "STORYBOOK" }, expected: /2D storybook fantasy/ },
    { request: { viewAngle: "SIDE" }, expected: /strict orthographic side view/ },
    { request: { viewAngle: "ISOMETRIC" }, expected: /consistent isometric game view/ },
    { request: { viewAngle: "TOP_DOWN" }, expected: /direct top-down game view/ },
  ];

  for (const entry of cases) {
    assert.match(compileForgePrompt(input(entry.request)), entry.expected);
  }
});

test("adds reference guidance only when an image is supplied", () => {
  const withoutReference = compileForgePrompt(input());
  const withReference = compileForgePrompt(input({
    referenceImage: {
      bytes: new Uint8Array([0x89]).buffer,
      mimeType: "image/png",
    },
  }));

  assert.match(withoutReference, /Invent a clear original design/);
  assert.doesNotMatch(withoutReference, /supplied reference image/);
  assert.match(withReference, /Use the supplied reference image as visual guidance/);
  assert.doesNotMatch(withReference, /Invent a clear original design/);
});
