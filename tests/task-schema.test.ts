import assert from "node:assert/strict";
import test from "node:test";
import { validateParsedTask } from "../src/lib/task-schema";

const generic = {
  provider: "GENERIC_IMAGE", operation: "generate", assetKind: "sprite", visualSubject: "floating eye", visualStyle: "pixel art", composition: "front view", dimensions: "64x64", background: "white", animationSpecification: null,
  positiveConstraints: ["clear edges"], negativeConstraints: ["ground shadow"], referenceAssets: [], outputVariants: 1, assumptions: [],
};

test("accepts the scoped generic art task and retains original input locally", () => {
  const parsed = validateParsedTask(generic, "Create a floating eye");
  assert.equal(parsed?.provider, "GENERIC_IMAGE");
  assert.equal(parsed?.userRequest, "Create a floating eye");
  assert.equal(parsed?.rikaOptions, null);
});

test("derives Rika adapter options from animation specification", () => {
  const parsed = validateParsedTask({ ...generic, provider: "RIKA_ANIMATION", operation: "animate", animationSpecification: { animationType: "idle", frameCount: 12, looping: true, cameraMovementAllowed: false, projectileAllowed: false, motionDescription: "outer ring rotates; body breathes subtly" } }, "Animate the eye");
  assert.equal(parsed?.provider, "RIKA_ANIMATION");
  assert.equal(parsed?.rikaOptions?.frameCount, 12);
  assert.equal(parsed?.rikaOptions?.playback, "LOOP");
});

test("rejects extra fields and invalid provider-animation combinations", () => {
  assert.equal(validateParsedTask({ ...generic, extra: true }, "x"), null);
  assert.equal(validateParsedTask({ ...generic, provider: "RIKA_ANIMATION", operation: "animate" }, "x"), null);
});
