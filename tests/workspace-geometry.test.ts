import assert from "node:assert/strict";
import test from "node:test";
import {
  constrainRectToBounds,
  dragRectWithSnapping,
  fitCanvasZoom,
  moveRectWithinBounds,
  resizeRectFromCorner,
} from "../src/lib/workspace-geometry";

const bounds = { width: 500, height: 300 };

test("corner resizing converts screen movement through zoom", () => {
  const resized = resizeRectFromCorner({
    rect: { x: 50, y: 40, width: 100, height: 60 },
    handle: "se",
    screenDelta: { x: 40, y: 20 },
    zoom: 2,
    bounds,
  });

  assert.deepEqual(resized, {
    x: 50,
    y: 40,
    width: 120,
    height: 70,
  });
});

test("north-west resizing keeps the opposite corner anchored", () => {
  const resized = resizeRectFromCorner({
    rect: { x: 100, y: 80, width: 120, height: 80 },
    handle: "nw",
    screenDelta: { x: 30, y: 20 },
    zoom: 1,
    bounds,
  });

  assert.deepEqual(resized, {
    x: 130,
    y: 100,
    width: 90,
    height: 60,
  });
  assert.equal(resized.x + resized.width, 220);
  assert.equal(resized.y + resized.height, 160);
});

test("Shift or the aspect lock preserves ratio while respecting bounds", () => {
  const shifted = resizeRectFromCorner({
    rect: { x: 50, y: 40, width: 100, height: 50 },
    handle: "se",
    screenDelta: { x: 40, y: 20 },
    zoom: 2,
    bounds,
    shiftKey: true,
  });
  assert.deepEqual(shifted, {
    x: 50,
    y: 40,
    width: 120,
    height: 60,
  });

  const bounded = resizeRectFromCorner({
    rect: { x: 350, y: 200, width: 100, height: 50 },
    handle: "se",
    screenDelta: { x: 200, y: 100 },
    zoom: 1,
    bounds,
    lockAspectRatio: true,
  });
  assert.deepEqual(bounded, {
    x: 350,
    y: 200,
    width: 150,
    height: 75,
  });
});

test("bounds constrain position and dimensions deterministically", () => {
  assert.deepEqual(
    constrainRectToBounds(
      { x: -50, y: 280, width: 800, height: 10 },
      bounds,
    ),
    { x: 0, y: 276, width: 500, height: 24 },
  );
});

test("keyboard nudging uses canvas units and cannot leave the workspace", () => {
  assert.deepEqual(
    moveRectWithinBounds(
      { x: 415, y: 215, width: 80, height: 80 },
      { x: 10, y: 10 },
      bounds,
    ),
    { x: 420, y: 220, width: 80, height: 80 },
  );
  assert.deepEqual(
    moveRectWithinBounds(
      { x: 10, y: 10, width: 80, height: 80 },
      { x: -1, y: 10 },
      bounds,
    ),
    { x: 9, y: 20, width: 80, height: 80 },
  );
});

test("fit zoom accounts for viewport padding and clamps to product limits", () => {
  assert.equal(
    fitCanvasZoom({
      canvas: { width: 1600, height: 1000 },
      viewport: { width: 1056, height: 696 },
      padding: 48,
    }),
    0.6,
  );
  assert.equal(
    fitCanvasZoom({
      canvas: { width: 100, height: 100 },
      viewport: { width: 1000, height: 1000 },
      maxZoom: 2,
      padding: 0,
    }),
    2,
  );
});

test("dragging snaps edges to nearby layers and emits renderable guides", () => {
  const result = dragRectWithSnapping({
    rect: { x: 20, y: 20, width: 50, height: 40 },
    screenDelta: { x: 27, y: 0 },
    zoom: 1,
    bounds,
    movingNodeId: "moving",
    targets: [
      {
        id: "neighbor",
        x: 100,
        y: 100,
        width: 60,
        height: 60,
      },
    ],
  });

  assert.equal(result.rect.x, 50);
  assert.deepEqual(
    result.guides.find((guide) => guide.axis === "x"),
    {
      axis: "x",
      position: 100,
      source: "node",
      sourceNodeId: "neighbor",
      movingAnchor: "end",
      targetAnchor: "start",
    },
  );
});

test("snap tolerance stays constant in screen pixels at different zooms", () => {
  const target = {
    id: "neighbor",
    x: 100,
    y: 200,
    width: 50,
    height: 50,
  };
  const atOneHundredPercent = dragRectWithSnapping({
    rect: { x: 20, y: 20, width: 50, height: 40 },
    screenDelta: { x: 26, y: 0 },
    zoom: 1,
    bounds,
    targets: [target],
  });
  const atTwoHundredPercent = dragRectWithSnapping({
    rect: { x: 20, y: 20, width: 50, height: 40 },
    screenDelta: { x: 52, y: 0 },
    zoom: 2,
    bounds,
    targets: [target],
  });

  assert.equal(atOneHundredPercent.rect.x, 50);
  assert.equal(atTwoHundredPercent.rect.x, 46);
  assert.equal(
    atTwoHundredPercent.guides.some((guide) => guide.axis === "x"),
    false,
  );
});

test("dragging is zoom-aware, stays in bounds, and ignores hidden targets", () => {
  const result = dragRectWithSnapping({
    rect: { x: 400, y: 200, width: 80, height: 80 },
    screenDelta: { x: 100, y: 100 },
    zoom: 2,
    bounds,
    targets: [
      {
        id: "hidden",
        x: 450,
        y: 250,
        width: 20,
        height: 20,
        visible: false,
      },
    ],
    snapToCanvas: false,
  });

  assert.deepEqual(result, {
    rect: { x: 420, y: 220, width: 80, height: 80 },
    guides: [],
  });
});

test("invalid geometry inputs fail instead of contaminating editor state", () => {
  assert.throws(
    () => constrainRectToBounds(
      { x: Number.NaN, y: 0, width: 50, height: 50 },
      bounds,
    ),
    RangeError,
  );
  assert.throws(
    () => resizeRectFromCorner({
      rect: { x: 0, y: 0, width: 50, height: 50 },
      handle: "se",
      screenDelta: { x: 1, y: 1 },
      zoom: 0,
      bounds,
    }),
    RangeError,
  );
});
