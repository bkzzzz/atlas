import assert from "node:assert/strict";
import test from "node:test";
import {
  generatedPngBytes,
  hasWorkspaceImageSignature,
  orderedNodeIdsAfterAction,
  parseWorkspaceNodePatch,
  WorkspaceInputError,
} from "../src/lib/workspace-core";

test("workspace node patches accept only real inspector properties", () => {
  assert.deepEqual(
    parseWorkspaceNodePatch({
      x: 24,
      y: 80,
      width: 320,
      height: 180,
      rotation: -12,
      opacity: 0.65,
      color: "#AABBCC",
    }),
    {
      x: 24,
      y: 80,
      width: 320,
      height: 180,
      rotation: -12,
      opacity: 0.65,
      color: "#aabbcc",
    },
  );
  assert.throws(
    () => parseWorkspaceNodePatch({ camera: "isometric" }),
    WorkspaceInputError,
  );
  assert.throws(
    () => parseWorkspaceNodePatch({ opacity: 2 }),
    WorkspaceInputError,
  );
});

test("layer actions produce an explicit back-to-front order", () => {
  const layers = ["a", "b", "c", "d"];
  assert.deepEqual(orderedNodeIdsAfterAction(layers, "b", "BRING_FORWARD"), [
    "a",
    "c",
    "b",
    "d",
  ]);
  assert.deepEqual(orderedNodeIdsAfterAction(layers, "c", "SEND_BACKWARD"), [
    "a",
    "c",
    "b",
    "d",
  ]);
  assert.deepEqual(orderedNodeIdsAfterAction(layers, "b", "BRING_TO_FRONT"), [
    "a",
    "c",
    "d",
    "b",
  ]);
  assert.deepEqual(orderedNodeIdsAfterAction(layers, "c", "SEND_TO_BACK"), [
    "c",
    "a",
    "b",
    "d",
  ]);
});

test("workspace images are checked by signature and generated PNGs decode", () => {
  const png = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01,
  ]);
  assert.equal(hasWorkspaceImageSignature(png, "image/png"), true);
  assert.equal(hasWorkspaceImageSignature(png, "image/jpeg"), false);
  assert.deepEqual(
    generatedPngBytes(`data:image/png;base64,${Buffer.from(png).toString("base64")}`),
    png,
  );
});
