import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWorkspaceNodePatchAllowed,
  generatedPngBytes,
  hasWorkspaceImageSignature,
  orderedNodeIdsAfterAction,
  parseWorkspaceOperationParameters,
  parseWorkspaceNodeSnapshots,
  parseWorkspaceNodePatch,
  validateWorkspaceImageDimensions,
  WorkspaceInputError,
} from "../src/lib/workspace-core";

test("workspace node patches accept only real inspector properties", () => {
  assert.deepEqual(
    parseWorkspaceNodePatch({
      x: 24,
      y: 80,
      width: 320,
      height: 180,
      opacity: 0.65,
      color: "#AABBCC",
      name: "  Hero sprite  ",
      locked: true,
      visible: false,
      aspectLocked: true,
      styleSpecId: " style-1 ",
      referenceIds: [" reference-1 "],
    }),
    {
      x: 24,
      y: 80,
      width: 320,
      height: 180,
      opacity: 0.65,
      color: "#aabbcc",
      name: "Hero sprite",
      locked: true,
      visible: false,
      aspectLocked: true,
      styleSpecId: "style-1",
      referenceIds: ["reference-1"],
    },
  );
  assert.throws(
    () => parseWorkspaceNodePatch({ rotation: -12 }),
    WorkspaceInputError,
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

test("history snapshots are strict, canonical, and preserve stored rotation", () => {
  const image = {
    id: " image-1 ",
    assetId: " asset-1 ",
    kind: "IMAGE",
    name: "Hero",
    x: 20,
    y: 30,
    width: 200,
    height: 180,
    rotation: -12,
    opacity: 0.8,
    color: "#FFFFFF",
    zIndex: 40,
    locked: false,
    visible: true,
    aspectLocked: true,
    styleSpecId: null,
    referenceIds: [],
  };
  assert.deepEqual(parseWorkspaceNodeSnapshots([image]), [
    {
      ...image,
      id: "image-1",
      assetId: "asset-1",
      color: "#ffffff",
      zIndex: 0,
    },
  ]);
  assert.throws(
    () => parseWorkspaceNodeSnapshots([{ ...image, debug: true }]),
    /Unsupported stored workspace property/,
  );
  assert.throws(
    () => parseWorkspaceNodeSnapshots([{ ...image, assetId: null }]),
    /must reference a stored asset/,
  );
  assert.throws(
    () =>
      parseWorkspaceNodeSnapshots([
        { ...image, kind: "RECTANGLE", assetId: "asset-1" },
      ]),
    /cannot reference image assets/,
  );
});

test("workspace pixel dimensions enforce per-axis and total decode limits", () => {
  assert.deepEqual(validateWorkspaceImageDimensions(4000, 4000), {
    pixelWidth: 4000,
    pixelHeight: 4000,
  });
  assert.throws(
    () => validateWorkspaceImageDimensions(8192, 8192),
    /16,000,000 pixels/,
  );
  assert.throws(
    () => validateWorkspaceImageDimensions(12.5, 100),
    /between 1 and 8192/,
  );
});

test("locked layers permit only visibility changes or unlocking", () => {
  assert.doesNotThrow(() =>
    assertWorkspaceNodePatchAllowed(true, { visible: false }),
  );
  assert.doesNotThrow(() =>
    assertWorkspaceNodePatchAllowed(true, {
      locked: false,
      visible: true,
    }),
  );
  assert.throws(
    () => assertWorkspaceNodePatchAllowed(true, { x: 10 }),
    (cause: unknown) =>
      cause instanceof WorkspaceInputError &&
      cause.status === 409 &&
      /Unlock the layer/.test(cause.message),
  );
  assert.throws(
    () =>
      assertWorkspaceNodePatchAllowed(true, {
        layerAction: "BRING_FORWARD",
      }),
    /Unlock the layer/,
  );
  assert.doesNotThrow(() =>
    assertWorkspaceNodePatchAllowed(false, { x: 10 }),
  );
});

test("derived operation parameters are strict and canonical", () => {
  assert.deepEqual(
    parseWorkspaceOperationParameters("REPLACE", { fit: "contain" }),
    { fit: "contain" },
  );
  assert.deepEqual(
    parseWorkspaceOperationParameters("CROP", {
      x: 0.1,
      y: 0.2,
      width: 0.5,
      height: 0.6,
    }),
    { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
  );
  assert.deepEqual(
    parseWorkspaceOperationParameters("REMOVE_SOLID_BACKGROUND", {
      method: "border-flood-fill",
      tolerance: 18,
      removedPixelCount: 420,
      borderMatchRatio: 0.72,
      backgroundColor: "#AABBCC",
    }),
    {
      method: "border-flood-fill",
      tolerance: 18,
      removedPixelCount: 420,
      borderMatchRatio: 0.72,
      backgroundColor: "#aabbcc",
    },
  );
  assert.throws(
    () =>
      parseWorkspaceOperationParameters("CROP", {
        x: 0.8,
        y: 0,
        width: 0.3,
        height: 1,
      }),
    /within the source image/,
  );
  assert.throws(
    () =>
      parseWorkspaceOperationParameters("REPLACE", {
        fit: "contain",
        undocumented: true,
      }),
    /contain exactly/,
  );
  assert.throws(
    () =>
      parseWorkspaceOperationParameters("CROP", {
        x: 1,
        y: 0,
        width: Number.EPSILON,
        height: 1,
      }),
    /positive area/,
  );
  assert.throws(
    () =>
      parseWorkspaceOperationParameters("REMOVE_SOLID_BACKGROUND", {
        method: "border-flood-fill",
        tolerance: 18,
        removedPixelCount: 16_000_001,
        borderMatchRatio: 0.72,
        backgroundColor: null,
      }),
    /Removed pixel count/,
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
  assert.throws(
    () => generatedPngBytes("data:image/png;base64,YQ=="),
    /valid PNG/,
  );
  assert.throws(
    () => generatedPngBytes("data:image/png;base64,a"),
    /invalid/,
  );
});
