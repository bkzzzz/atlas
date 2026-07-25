import assert from "node:assert/strict";
import test from "node:test";
import { validateParsedStaticImageTask } from "../src/lib/task-schema";

const staticImage = {
  assetKind: "sprite",
  visualSubject: "floating eye with a rotating golden outer ring",
  visualStyle: "low-resolution pixel art",
  composition: "centered front view",
  dimensions: "1024x1024",
  background: "white",
  positiveConstraints: ["clear crisp edges"],
  negativeConstraints: ["no ground shadow"],
  referenceAssets: [],
  assumptions: [],
};

test("accepts a strict static-image task and retains the original request locally", () => {
  const parsed = validateParsedStaticImageTask(
    staticImage,
    "Create a floating eye with a rotating golden outer ring.",
  );

  assert.deepEqual(parsed, {
    ...staticImage,
    userRequest: "Create a floating eye with a rotating golden outer ring.",
  });
});

test("rejects extra, missing, and malformed static-image fields", () => {
  assert.equal(validateParsedStaticImageTask({ ...staticImage, extra: true }, "x"), null);
  assert.equal(validateParsedStaticImageTask({ ...staticImage, dimensions: "" }, "x"), null);
  assert.equal(validateParsedStaticImageTask({ ...staticImage, positiveConstraints: "clear edges" }, "x"), null);
  const withoutBackground: Record<string, unknown> = { ...staticImage };
  delete withoutBackground.background;
  assert.equal(validateParsedStaticImageTask(withoutBackground, "x"), null);
});
