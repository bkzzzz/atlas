import {
  MIN_NODE_SIZE,
  type WorkspaceNode,
} from "./workspace-core";

export type Point = Readonly<{
  x: number;
  y: number;
}>;

export type Size = Readonly<{
  width: number;
  height: number;
}>;

export type WorkspaceRect = Pick<
  WorkspaceNode,
  "x" | "y" | "width" | "height"
>;

export type WorkspaceBounds = Readonly<{
  x?: number;
  y?: number;
  width: number;
  height: number;
}>;

export type ResizeCorner = "nw" | "ne" | "sw" | "se";
export type SnapAxis = "x" | "y";
export type SnapAnchor = "start" | "center" | "end";

export type SnapGuide = Readonly<{
  axis: SnapAxis;
  position: number;
  source: "canvas" | "node";
  sourceNodeId: string | null;
  movingAnchor: SnapAnchor;
  targetAnchor: SnapAnchor;
}>;

export type SnapTarget = Pick<
  WorkspaceNode,
  "id" | "x" | "y" | "width" | "height"
> & {
  visible?: boolean;
};

export type CornerResizeInput = Readonly<{
  rect: WorkspaceRect;
  handle: ResizeCorner;
  screenDelta: Point;
  zoom: number;
  bounds: WorkspaceBounds;
  shiftKey?: boolean;
  lockAspectRatio?: boolean;
  minWidth?: number;
  minHeight?: number;
}>;

export type DragWithSnappingInput = Readonly<{
  rect: WorkspaceRect;
  screenDelta: Point;
  zoom: number;
  bounds: WorkspaceBounds;
  targets?: readonly SnapTarget[];
  movingNodeId?: string;
  snapThreshold?: number;
  snapToCanvas?: boolean;
}>;

export type DragWithSnappingResult = Readonly<{
  rect: WorkspaceRect;
  guides: readonly SnapGuide[];
}>;

export type FitCanvasZoomInput = Readonly<{
  canvas: Size;
  viewport: Size;
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
}>;

type NormalizedBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type AxisTarget = {
  position: number;
  source: SnapGuide["source"];
  sourceNodeId: string | null;
  targetAnchor: SnapAnchor;
};

type AxisMatch = {
  offset: number;
  guide: SnapGuide;
  distance: number;
};

const EPSILON = 0.000_001;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedBounds(bounds: WorkspaceBounds): NormalizedBounds {
  const left = bounds.x ?? 0;
  const top = bounds.y ?? 0;
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    throw new RangeError("Workspace bounds must have a positive finite size.");
  }
  return {
    left,
    top,
    right: left + bounds.width,
    bottom: top + bounds.height,
    width: bounds.width,
    height: bounds.height,
  };
}

function finiteMinimum(value: number | undefined, fallback: number) {
  const minimum = value ?? fallback;
  if (!Number.isFinite(minimum) || minimum <= 0) {
    throw new RangeError("Minimum dimensions must be positive finite numbers.");
  }
  return minimum;
}

function positiveFiniteSize(size: Size, label: string) {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new RangeError(`${label} must have a positive finite size.`);
  }
}

function finiteRect(rect: WorkspaceRect) {
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height)
  ) {
    throw new RangeError("Workspace geometry must contain finite numbers.");
  }
}

function anchors(start: number, size: number) {
  return [
    { anchor: "start" as const, position: start },
    { anchor: "center" as const, position: start + size / 2 },
    { anchor: "end" as const, position: start + size },
  ];
}

function axisMatch(
  moving: ReturnType<typeof anchors>,
  targets: readonly AxisTarget[],
  threshold: number,
  axis: SnapAxis,
) {
  let best: AxisMatch | null = null;

  for (const target of targets) {
    for (const candidate of moving) {
      const offset = target.position - candidate.position;
      const distance = Math.abs(offset);
      if (distance > threshold + EPSILON) continue;
      if (best && distance >= best.distance - EPSILON) continue;

      best = {
        distance,
        offset,
        guide: {
          axis,
          position: target.position,
          source: target.source,
          sourceNodeId: target.sourceNodeId,
          movingAnchor: candidate.anchor,
          targetAnchor: target.targetAnchor,
        },
      };
    }
  }

  return best;
}

function targetAnchors(
  target: SnapTarget,
  axis: SnapAxis,
): AxisTarget[] {
  const start = axis === "x" ? target.x : target.y;
  const size = axis === "x" ? target.width : target.height;
  return anchors(start, size).map(({ anchor, position }) => ({
    position,
    source: "node",
    sourceNodeId: target.id,
    targetAnchor: anchor,
  }));
}

function canvasAnchors(
  bounds: NormalizedBounds,
  axis: SnapAxis,
): AxisTarget[] {
  const start = axis === "x" ? bounds.left : bounds.top;
  const size = axis === "x" ? bounds.width : bounds.height;
  return anchors(start, size).map(({ anchor, position }) => ({
    position,
    source: "canvas",
    sourceNodeId: null,
    targetAnchor: anchor,
  }));
}

function rectAlignsWithGuide(rect: WorkspaceRect, guide: SnapGuide) {
  const aligned = guide.axis === "x"
    ? anchors(rect.x, rect.width)
    : anchors(rect.y, rect.height);
  return aligned.some(
    ({ position }) => Math.abs(position - guide.position) <= EPSILON,
  );
}

export function canvasDeltaFromScreen(delta: Point, zoom: number): Point {
  if (
    !Number.isFinite(delta.x) ||
    !Number.isFinite(delta.y) ||
    !Number.isFinite(zoom) ||
    zoom <= 0
  ) {
    if (!Number.isFinite(zoom) || zoom <= 0) {
      throw new RangeError("Zoom must be a positive finite number.");
    }
    throw new RangeError("Pointer movement must contain finite numbers.");
  }
  return {
    x: delta.x / zoom,
    y: delta.y / zoom,
  };
}

export function constrainRectToBounds(
  rect: WorkspaceRect,
  bounds: WorkspaceBounds,
  options: Readonly<{ minWidth?: number; minHeight?: number }> = {},
): WorkspaceRect {
  const area = normalizedBounds(bounds);
  finiteRect(rect);
  const minimumWidth = Math.min(
    finiteMinimum(options.minWidth, MIN_NODE_SIZE),
    area.width,
  );
  const minimumHeight = Math.min(
    finiteMinimum(options.minHeight, MIN_NODE_SIZE),
    area.height,
  );
  const width = clamp(rect.width, minimumWidth, area.width);
  const height = clamp(rect.height, minimumHeight, area.height);

  return {
    x: clamp(rect.x, area.left, area.right - width),
    y: clamp(rect.y, area.top, area.bottom - height),
    width,
    height,
  };
}

export function moveRectWithinBounds(
  rect: WorkspaceRect,
  canvasDelta: Point,
  bounds: WorkspaceBounds,
): WorkspaceRect {
  if (!Number.isFinite(canvasDelta.x) || !Number.isFinite(canvasDelta.y)) {
    throw new RangeError("Canvas movement must contain finite numbers.");
  }
  const start = constrainRectToBounds(rect, bounds);
  return constrainRectToBounds(
    {
      ...start,
      x: start.x + canvasDelta.x,
      y: start.y + canvasDelta.y,
    },
    bounds,
  );
}

export function fitCanvasZoom({
  canvas,
  viewport,
  padding = 48,
  minZoom = 0.1,
  maxZoom = 4,
}: FitCanvasZoomInput) {
  positiveFiniteSize(canvas, "Canvas");
  positiveFiniteSize(viewport, "Viewport");
  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError("Fit padding must be a non-negative finite number.");
  }
  if (
    !Number.isFinite(minZoom) ||
    !Number.isFinite(maxZoom) ||
    minZoom <= 0 ||
    maxZoom < minZoom
  ) {
    throw new RangeError("Zoom limits must be positive and ordered.");
  }

  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  return clamp(
    Math.min(
      availableWidth / canvas.width,
      availableHeight / canvas.height,
    ),
    minZoom,
    maxZoom,
  );
}

export function resizeRectFromCorner({
  rect,
  handle,
  screenDelta,
  zoom,
  bounds,
  shiftKey = false,
  lockAspectRatio = false,
  minWidth,
  minHeight,
}: CornerResizeInput): WorkspaceRect {
  const area = normalizedBounds(bounds);
  const start = constrainRectToBounds(rect, bounds, { minWidth, minHeight });
  const delta = canvasDeltaFromScreen(screenDelta, zoom);
  const movesLeft = handle.endsWith("w");
  const movesTop = handle.startsWith("n");
  const anchorX = movesLeft ? start.x + start.width : start.x;
  const anchorY = movesTop ? start.y + start.height : start.y;
  const maximumWidth = movesLeft
    ? anchorX - area.left
    : area.right - anchorX;
  const maximumHeight = movesTop
    ? anchorY - area.top
    : area.bottom - anchorY;
  const minimumWidth = Math.min(
    finiteMinimum(minWidth, MIN_NODE_SIZE),
    maximumWidth,
  );
  const minimumHeight = Math.min(
    finiteMinimum(minHeight, MIN_NODE_SIZE),
    maximumHeight,
  );

  let width: number;
  let height: number;

  if (shiftKey || lockAspectRatio) {
    const vectorX = movesLeft ? -start.width : start.width;
    const vectorY = movesTop ? -start.height : start.height;
    const currentX = vectorX + delta.x;
    const currentY = vectorY + delta.y;
    const denominator = vectorX ** 2 + vectorY ** 2;
    const pointerScale = (currentX * vectorX + currentY * vectorY) / denominator;
    const minimumScale = Math.max(
      minimumWidth / start.width,
      minimumHeight / start.height,
    );
    const maximumScale = Math.min(
      maximumWidth / start.width,
      maximumHeight / start.height,
    );
    const scale = clamp(
      pointerScale,
      Math.min(minimumScale, maximumScale),
      maximumScale,
    );
    width = start.width * scale;
    height = start.height * scale;
  } else {
    const proposedWidth = start.width + (movesLeft ? -delta.x : delta.x);
    const proposedHeight = start.height + (movesTop ? -delta.y : delta.y);
    width = clamp(proposedWidth, minimumWidth, maximumWidth);
    height = clamp(proposedHeight, minimumHeight, maximumHeight);
  }

  return {
    x: movesLeft ? anchorX - width : anchorX,
    y: movesTop ? anchorY - height : anchorY,
    width,
    height,
  };
}

export function dragRectWithSnapping({
  rect,
  screenDelta,
  zoom,
  bounds,
  targets = [],
  movingNodeId,
  snapThreshold = 6,
  snapToCanvas = true,
}: DragWithSnappingInput): DragWithSnappingResult {
  if (!Number.isFinite(snapThreshold) || snapThreshold < 0) {
    throw new RangeError("Snap threshold must be a non-negative finite number.");
  }

  const area = normalizedBounds(bounds);
  const start = constrainRectToBounds(rect, bounds);
  const delta = canvasDeltaFromScreen(screenDelta, zoom);
  const raw: WorkspaceRect = {
    ...start,
    x: start.x + delta.x,
    y: start.y + delta.y,
  };
  const eligibleTargets = targets.filter(
    (target) => target.id !== movingNodeId && target.visible !== false,
  );
  const xTargets = eligibleTargets.flatMap((target) =>
    targetAnchors(target, "x"));
  const yTargets = eligibleTargets.flatMap((target) =>
    targetAnchors(target, "y"));
  if (snapToCanvas) {
    xTargets.push(...canvasAnchors(area, "x"));
    yTargets.push(...canvasAnchors(area, "y"));
  }

  const threshold = snapThreshold / zoom;
  const xMatch = axisMatch(
    anchors(raw.x, raw.width),
    xTargets,
    threshold,
    "x",
  );
  const yMatch = axisMatch(
    anchors(raw.y, raw.height),
    yTargets,
    threshold,
    "y",
  );
  const constrained = constrainRectToBounds(
    {
      ...raw,
      x: raw.x + (xMatch?.offset ?? 0),
      y: raw.y + (yMatch?.offset ?? 0),
    },
    bounds,
  );
  const guides = [xMatch?.guide, yMatch?.guide].filter(
    (guide): guide is SnapGuide =>
      Boolean(guide && rectAlignsWithGuide(constrained, guide)),
  );

  return { rect: constrained, guides };
}
