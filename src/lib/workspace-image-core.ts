export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
};

export type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type BackgroundRemovalOptions = {
  /**
   * Maximum per-channel RGB difference from the detected border color.
   * A small tolerance removes compression and antialiasing noise without
   * treating unrelated colors as background.
   */
  tolerance?: number;
  /** Minimum share of border pixels matching the detected background color. */
  minimumBorderMatchRatio?: number;
  /** Minimum share of all image pixels that must be removed. */
  minimumRemovedPixelShare?: number;
};

export type BackgroundRemovalResult = RgbaImage & {
  backgroundColor: RgbaColor | null;
  borderMatchRatio: number;
  removedPixelCount: number;
};

export type NormalizedCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PixelCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type JsonCompatibleValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonCompatibleValue[]
  | JsonCompatibleRecord;

export type JsonCompatibleRecord = {
  readonly [key: string]: JsonCompatibleValue;
};

export type ExportNodeInput = {
  id: string;
  assetId?: string | null;
  parentAssetId?: string | null;
  assetMimeType?: string | null;
  assetSource?: string | null;
  assetOperation?: string | null;
  operationParameters?: JsonCompatibleRecord | null;
  name: string;
  type?: string;
  kind?: string;
  imageUrl?: string | null;
  assetUrl?: string | null;
  pixelWidth?: number;
  pixelHeight?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  tint?: string;
  color?: string;
  zIndex: number;
  locked?: boolean;
  visible?: boolean;
  aspectLocked?: boolean;
  styleSpecId?: string | null;
  referenceIds?: readonly string[];
};

export type ExportReferenceInput = {
  id: string;
  title: string;
  imageUrl: string;
  sourceName: string;
  sourceUrl?: string;
  license?: string;
  palette: readonly string[];
  traits: readonly string[];
  description: string;
};

export type ExportStyleSpecInput = {
  id: string;
  styleName: string;
  palette: readonly string[];
  lineStyle: string;
  lighting: string;
  materials: readonly string[];
  shapeLanguage: string;
  detailLevel: string;
  compositionNotes: readonly string[];
  referenceIds: readonly string[];
};

export type WorkspaceExportInput = {
  workspace: {
    id: string;
    name: string;
    width: number;
    height: number;
  };
  brief?: {
    description: string;
    genre: string;
    mood: string;
    targetPlatform: string;
    assetType: string;
  };
  nodes: readonly ExportNodeInput[];
  references?: readonly ExportReferenceInput[];
  selectedReferenceIds?: readonly string[];
  selectedStyleSpec?: ExportStyleSpecInput | null;
};

export type NormalizedExportNode = {
  id: string;
  assetId: string | null;
  parentAssetId: string | null;
  assetMimeType: string | null;
  assetSource: string | null;
  assetOperation: string | null;
  operationParameters: JsonCompatibleRecord | null;
  name: string;
  type: string;
  imageUrl: string | null;
  pixelWidth: number;
  pixelHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  tint: string;
  zIndex: number;
  locked: boolean;
  visible: boolean;
  aspectLocked: boolean;
  styleSpecId: string | null;
  referenceIds: string[];
};

export type SerializedWorkspaceExports = {
  workspaceJson: string;
  assetMetadataJson: string;
  styleSpecJson: string | null;
  referenceMetadataJson: string;
};

export type WorkspaceExportFile =
  | {
      kind: "COMPOSED_PNG";
      fileName: string;
      mimeType: "image/png";
    }
  | {
      kind:
        | "WORKSPACE_JSON"
        | "ASSET_METADATA_JSON"
        | "STYLE_SPEC_JSON"
        | "REFERENCE_METADATA_JSON";
      fileName: string;
      mimeType: "application/json";
      content: string;
    };

export type WorkspaceExportPlan = {
  canvas: {
    width: number;
    height: number;
  };
  renderNodes: NormalizedExportNode[];
  files: WorkspaceExportFile[];
};

const DEFAULT_BACKGROUND_TOLERANCE = 18;
const DEFAULT_MINIMUM_BORDER_MATCH_RATIO = 0.35;
const DEFAULT_MINIMUM_REMOVED_PIXEL_SHARE = 0.02;
const CROP_EPSILON = 1e-9;

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive integer.`);
  }
}

function assertFiniteNumber(value: number, field: string) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${field} must be a finite number.`);
  }
}

function assertRgbaImage(image: RgbaImage) {
  assertPositiveInteger(image.width, "width");
  assertPositiveInteger(image.height, "height");
  if (!(image.data instanceof Uint8ClampedArray)) {
    throw new TypeError("data must be a Uint8ClampedArray.");
  }
  if (image.data.length !== image.width * image.height * 4) {
    throw new RangeError("RGBA data length does not match the image dimensions.");
  }
}

function visitBorderPixelOffsets(
  width: number,
  height: number,
  visit: (offset: number) => void,
) {
  for (let x = 0; x < width; x += 1) visit(x * 4);
  for (let y = 1; y < height - 1; y += 1) {
    visit(y * width * 4);
    if (width > 1) visit((y * width + width - 1) * 4);
  }
  if (height > 1) {
    const lastRow = (height - 1) * width;
    for (let x = 0; x < width; x += 1) visit((lastRow + x) * 4);
  }
}

/**
 * Returns the most frequent non-transparent RGB color on the image border.
 * Ties are resolved by first appearance in top-to-bottom, left-to-right order.
 */
export function dominantBorderColor(image: RgbaImage): RgbaColor | null {
  assertRgbaImage(image);

  const counts = new Map<
    number,
    {
      count: number;
      alphaTotal: number;
      firstSeen: number;
      color: Omit<RgbaColor, "a">;
    }
  >();
  let seenIndex = 0;

  visitBorderPixelOffsets(image.width, image.height, (offset) => {
    const r = image.data[offset];
    const g = image.data[offset + 1];
    const b = image.data[offset + 2];
    const a = image.data[offset + 3];
    if (a === 0) return;

    const key = (r << 16) | (g << 8) | b;
    const entry = counts.get(key);
    if (entry) {
      entry.count += 1;
      entry.alphaTotal += a;
    } else {
      const next = {
        count: 1,
        alphaTotal: a,
        firstSeen: seenIndex,
        color: { r, g, b },
      };
      counts.set(key, next);
      seenIndex += 1;
    }
  });

  let dominant:
    | {
        count: number;
        alphaTotal: number;
        firstSeen: number;
        color: Omit<RgbaColor, "a">;
      }
    | undefined;
  for (const entry of counts.values()) {
    if (
      !dominant ||
      entry.count > dominant.count ||
      (entry.count === dominant.count && entry.firstSeen < dominant.firstSeen)
    ) {
      dominant = entry;
    }
  }
  if (!dominant) return null;
  return {
    ...dominant.color,
    a: Math.round(dominant.alphaTotal / dominant.count),
  };
}

function matchesBackground(
  data: Uint8ClampedArray,
  offset: number,
  background: RgbaColor,
  tolerance: number,
) {
  return (
    data[offset + 3] > 0 &&
    Math.abs(data[offset] - background.r) <= tolerance &&
    Math.abs(data[offset + 1] - background.g) <= tolerance &&
    Math.abs(data[offset + 2] - background.b) <= tolerance
  );
}

function borderMatchRatio(
  image: RgbaImage,
  background: RgbaColor,
  tolerance: number,
) {
  let borderPixelCount = 0;
  let matchingPixelCount = 0;
  visitBorderPixelOffsets(image.width, image.height, (offset) => {
    borderPixelCount += 1;
    if (matchesBackground(image.data, offset, background, tolerance)) {
      matchingPixelCount += 1;
    }
  });
  return borderPixelCount === 0 ? 0 : matchingPixelCount / borderPixelCount;
}

function confidenceThreshold(
  value: number | undefined,
  fallback: number,
  field: string,
) {
  const threshold = value ?? fallback;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError(`${field} must be between 0 and 1.`);
  }
  return threshold;
}

/**
 * Development-safe background removal for flat-color asset images.
 *
 * Only pixels connected to an image edge are considered, so an enclosed detail
 * that happens to match the border color remains intact.
 */
export function removeBorderConnectedBackground(
  image: RgbaImage,
  options: BackgroundRemovalOptions = {},
): BackgroundRemovalResult {
  assertRgbaImage(image);
  const tolerance = options.tolerance ?? DEFAULT_BACKGROUND_TOLERANCE;
  if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 255) {
    throw new RangeError("tolerance must be an integer between 0 and 255.");
  }
  const minimumBorderMatchRatio = confidenceThreshold(
    options.minimumBorderMatchRatio,
    DEFAULT_MINIMUM_BORDER_MATCH_RATIO,
    "minimumBorderMatchRatio",
  );
  const minimumRemovedPixelShare = confidenceThreshold(
    options.minimumRemovedPixelShare,
    DEFAULT_MINIMUM_REMOVED_PIXEL_SHARE,
    "minimumRemovedPixelShare",
  );

  const backgroundColor = dominantBorderColor(image);
  const data = new Uint8ClampedArray(image.data);
  if (!backgroundColor) {
    return {
      width: image.width,
      height: image.height,
      data,
      backgroundColor: null,
      borderMatchRatio: 0,
      removedPixelCount: 0,
    };
  }
  const detectedBorderMatchRatio = borderMatchRatio(
    image,
    backgroundColor,
    tolerance,
  );
  if (detectedBorderMatchRatio < minimumBorderMatchRatio) {
    return {
      width: image.width,
      height: image.height,
      data,
      backgroundColor,
      borderMatchRatio: detectedBorderMatchRatio,
      removedPixelCount: 0,
    };
  }

  const pixelCount = image.width * image.height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let readIndex = 0;
  let writeIndex = 0;

  const enqueueIfBackground = (pixelIndex: number) => {
    if (
      visited[pixelIndex] === 0 &&
      matchesBackground(data, pixelIndex * 4, backgroundColor, tolerance)
    ) {
      visited[pixelIndex] = 1;
      queue[writeIndex] = pixelIndex;
      writeIndex += 1;
    }
  };

  for (let x = 0; x < image.width; x += 1) {
    enqueueIfBackground(x);
    if (image.height > 1) {
      enqueueIfBackground((image.height - 1) * image.width + x);
    }
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    enqueueIfBackground(y * image.width);
    if (image.width > 1) {
      enqueueIfBackground(y * image.width + image.width - 1);
    }
  }

  let removedPixelCount = 0;
  while (readIndex < writeIndex) {
    const pixelIndex = queue[readIndex];
    readIndex += 1;
    const offset = pixelIndex * 4;
    if (data[offset + 3] > 0) {
      data[offset + 3] = 0;
      removedPixelCount += 1;
    }

    const x = pixelIndex % image.width;
    const y = Math.floor(pixelIndex / image.width);
    if (x > 0) enqueueIfBackground(pixelIndex - 1);
    if (x + 1 < image.width) enqueueIfBackground(pixelIndex + 1);
    if (y > 0) enqueueIfBackground(pixelIndex - image.width);
    if (y + 1 < image.height) enqueueIfBackground(pixelIndex + image.width);
  }

  if (removedPixelCount / pixelCount < minimumRemovedPixelShare) {
    return {
      width: image.width,
      height: image.height,
      data: new Uint8ClampedArray(image.data),
      backgroundColor,
      borderMatchRatio: detectedBorderMatchRatio,
      removedPixelCount: 0,
    };
  }

  return {
    width: image.width,
    height: image.height,
    data,
    backgroundColor,
    borderMatchRatio: detectedBorderMatchRatio,
    removedPixelCount,
  };
}

export function validateNormalizedCropRect(
  rect: NormalizedCropRect,
): NormalizedCropRect {
  for (const field of ["x", "y", "width", "height"] as const) {
    assertFiniteNumber(rect[field], `crop ${field}`);
  }
  if (rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0) {
    throw new RangeError(
      "Crop position must be non-negative and crop size must be positive.",
    );
  }
  if (rect.x >= 1 || rect.y >= 1) {
    throw new RangeError("Crop position must start within the image.");
  }
  if (
    rect.x + rect.width > 1 + CROP_EPSILON ||
    rect.y + rect.height > 1 + CROP_EPSILON
  ) {
    throw new RangeError("Crop rectangle must stay within the image.");
  }

  return {
    x: rect.x === 0 ? 0 : rect.x,
    y: rect.y === 0 ? 0 : rect.y,
    width: Math.min(rect.width, 1 - rect.x),
    height: Math.min(rect.height, 1 - rect.y),
  };
}

/**
 * Converts a normalized crop to an inclusive pixel coverage rectangle.
 * Starting edges use floor and ending edges use ceil to avoid dropping a
 * partially covered source pixel.
 */
export function normalizedCropToPixels(
  rect: NormalizedCropRect,
  imageWidth: number,
  imageHeight: number,
): PixelCropRect {
  assertPositiveInteger(imageWidth, "imageWidth");
  assertPositiveInteger(imageHeight, "imageHeight");
  const crop = validateNormalizedCropRect(rect);

  const x = Math.floor(crop.x * imageWidth);
  const y = Math.floor(crop.y * imageHeight);
  const right = Math.min(
    imageWidth,
    Math.max(x + 1, Math.ceil((crop.x + crop.width) * imageWidth)),
  );
  const bottom = Math.min(
    imageHeight,
    Math.max(y + 1, Math.ceil((crop.y + crop.height) * imageHeight)),
  );

  return { x, y, width: right - x, height: bottom - y };
}

function compareStrings(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizeNode(node: ExportNodeInput): NormalizedExportNode {
  for (const field of [
    "x",
    "y",
    "width",
    "height",
    "zIndex",
    "rotation",
    "opacity",
    "pixelWidth",
    "pixelHeight",
  ] as const) {
    const value = node[field];
    if (value !== undefined) assertFiniteNumber(value, `node ${field}`);
  }
  if (node.width <= 0 || node.height <= 0) {
    throw new RangeError("Export node dimensions must be positive.");
  }
  if (!node.id.trim() || !node.name.trim()) {
    throw new RangeError("Export nodes must have an ID and layer name.");
  }
  const parentAssetId =
    node.parentAssetId === undefined || node.parentAssetId === null
      ? null
      : node.parentAssetId.trim();
  if (parentAssetId !== null && !parentAssetId) {
    throw new RangeError("Export parent asset IDs cannot be empty.");
  }
  const assetMimeType =
    node.assetMimeType === undefined || node.assetMimeType === null
      ? null
      : node.assetMimeType.trim().toLowerCase();
  if (
    assetMimeType !== null &&
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(assetMimeType)
  ) {
    throw new RangeError("Export asset MIME types must be valid media types.");
  }
  let operationParameters: JsonCompatibleRecord | null = null;
  if (node.operationParameters !== undefined && node.operationParameters !== null) {
    const normalized = canonicalizeJson(node.operationParameters);
    if (!normalized || Array.isArray(normalized) || typeof normalized !== "object") {
      throw new TypeError("Export operation parameters must be a JSON object.");
    }
    operationParameters = normalized as JsonCompatibleRecord;
  }
  const opacity = node.opacity ?? 1;
  if (opacity < 0 || opacity > 1) {
    throw new RangeError("Export node opacity must be between 0 and 1.");
  }
  const pixelWidth = node.pixelWidth ?? 0;
  const pixelHeight = node.pixelHeight ?? 0;
  if (
    !Number.isInteger(pixelWidth) ||
    !Number.isInteger(pixelHeight) ||
    pixelWidth < 0 ||
    pixelHeight < 0
  ) {
    throw new RangeError(
      "Export node pixel dimensions must be non-negative integers.",
    );
  }

  return {
    id: node.id,
    assetId: node.assetId ?? null,
    parentAssetId,
    assetMimeType,
    assetSource: node.assetSource ?? null,
    assetOperation: node.assetOperation ?? null,
    operationParameters,
    name: node.name,
    type: node.type ?? node.kind?.toLowerCase() ?? "image",
    imageUrl: node.imageUrl ?? node.assetUrl ?? null,
    pixelWidth,
    pixelHeight,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    rotation: node.rotation ?? 0,
    opacity,
    tint: node.tint ?? node.color ?? "#ffffff",
    zIndex: node.zIndex,
    locked: node.locked ?? false,
    visible: node.visible ?? true,
    aspectLocked: node.aspectLocked ?? false,
    styleSpecId: node.styleSpecId ?? null,
    referenceIds: [...(node.referenceIds ?? [])],
  };
}

function normalizedNodes(input: WorkspaceExportInput) {
  return input.nodes
    .map(normalizeNode)
    .sort(
      (left, right) =>
        left.zIndex - right.zIndex || compareStrings(left.id, right.id),
    );
}

function normalizedReferences(input: WorkspaceExportInput) {
  const associatedReferenceIds = [
    ...(input.selectedReferenceIds ?? []),
    ...(input.selectedStyleSpec?.referenceIds ?? []),
    ...input.nodes.flatMap((node) => [...(node.referenceIds ?? [])]),
  ];
  const shouldFilter =
    input.selectedReferenceIds !== undefined ||
    Boolean(input.selectedStyleSpec) ||
    associatedReferenceIds.length > 0;
  const includedReferenceIds = new Set(associatedReferenceIds);
  return [...(input.references ?? [])]
    .filter(
      (reference) =>
        !shouldFilter || includedReferenceIds.has(reference.id),
    )
    .sort((left, right) => compareStrings(left.id, right.id))
    .map((reference) => ({
      id: reference.id,
      title: reference.title,
      imageUrl: reference.imageUrl,
      sourceName: reference.sourceName,
      sourceUrl: reference.sourceUrl ?? null,
      license: reference.license ?? null,
      palette: [...reference.palette],
      traits: [...reference.traits],
      description: reference.description,
    }));
}

function normalizedStyleSpec(styleSpec: ExportStyleSpecInput | null | undefined) {
  if (!styleSpec) return null;
  return {
    id: styleSpec.id,
    styleName: styleSpec.styleName,
    palette: [...styleSpec.palette],
    lineStyle: styleSpec.lineStyle,
    lighting: styleSpec.lighting,
    materials: [...styleSpec.materials],
    shapeLanguage: styleSpec.shapeLanguage,
    detailLevel: styleSpec.detailLevel,
    compositionNotes: [...styleSpec.compositionNotes],
    referenceIds: [...styleSpec.referenceIds],
  };
}

function canonicalizeJson(
  value: unknown,
  ancestors = new Set<object>(),
): JsonCompatibleValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError("Export JSON cannot contain non-finite numbers.");
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new TypeError("Export JSON cannot contain circular values.");
    }
    ancestors.add(value);
    const result = value.map((item) => canonicalizeJson(item, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Export JSON can contain only plain objects.");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("Export JSON cannot contain symbol properties.");
    }
    if (ancestors.has(value)) {
      throw new TypeError("Export JSON cannot contain circular values.");
    }
    ancestors.add(value);
    const result = Object.create(null) as Record<
      string,
      JsonCompatibleValue
    >;
    for (const key of Object.keys(value).sort(compareStrings)) {
      const item = (value as Record<string, unknown>)[key];
      result[key] = canonicalizeJson(item, ancestors);
    }
    ancestors.delete(value);
    return result;
  }
  throw new TypeError(`Export JSON cannot contain values of type ${typeof value}.`);
}

export function serializeDeterministicJson(value: unknown) {
  return `${JSON.stringify(canonicalizeJson(value), null, 2)}\n`;
}

export function serializeWorkspaceExportJson(
  input: WorkspaceExportInput,
): SerializedWorkspaceExports {
  assertPositiveInteger(input.workspace.width, "workspace width");
  assertPositiveInteger(input.workspace.height, "workspace height");
  const nodes = normalizedNodes(input);
  const references = normalizedReferences(input);
  const selectedStyleSpec = normalizedStyleSpec(input.selectedStyleSpec);

  return {
    workspaceJson: serializeDeterministicJson({
      version: 1,
      workspace: {
        id: input.workspace.id,
        name: input.workspace.name,
        width: input.workspace.width,
        height: input.workspace.height,
        brief: input.brief ?? null,
        selectedReferenceIds: [...(input.selectedReferenceIds ?? [])],
        selectedStyleSpecId: input.selectedStyleSpec?.id ?? null,
      },
      nodes,
    }),
    assetMetadataJson: serializeDeterministicJson({
      version: 1,
      assets: nodes,
    }),
    styleSpecJson: selectedStyleSpec
      ? serializeDeterministicJson({
          version: 1,
          styleSpec: selectedStyleSpec,
        })
      : null,
    referenceMetadataJson: serializeDeterministicJson({
      version: 1,
      references,
    }),
  };
}

function exportFileStem(name: string) {
  const stem = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80)
    .replace(/-+$/gu, "");
  return stem || "atlas-workspace";
}

export function createWorkspaceExportPlan(
  input: WorkspaceExportInput,
): WorkspaceExportPlan {
  const serialized = serializeWorkspaceExportJson(input);
  const stem = exportFileStem(input.workspace.name);
  const files: WorkspaceExportFile[] = [
    {
      kind: "COMPOSED_PNG",
      fileName: `${stem}.png`,
      mimeType: "image/png",
    },
    {
      kind: "WORKSPACE_JSON",
      fileName: `${stem}.workspace.json`,
      mimeType: "application/json",
      content: serialized.workspaceJson,
    },
    {
      kind: "ASSET_METADATA_JSON",
      fileName: `${stem}.assets.json`,
      mimeType: "application/json",
      content: serialized.assetMetadataJson,
    },
  ];
  if (serialized.styleSpecJson) {
    files.push({
      kind: "STYLE_SPEC_JSON",
      fileName: `${stem}.style-spec.json`,
      mimeType: "application/json",
      content: serialized.styleSpecJson,
    });
  }
  files.push({
    kind: "REFERENCE_METADATA_JSON",
    fileName: `${stem}.references.json`,
    mimeType: "application/json",
    content: serialized.referenceMetadataJson,
  });

  return {
    canvas: {
      width: input.workspace.width,
      height: input.workspace.height,
    },
    renderNodes: normalizedNodes(input).filter((node) => node.visible),
    files,
  };
}
