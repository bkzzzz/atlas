import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkspaceExportPlan,
  dominantBorderColor,
  normalizedCropToPixels,
  removeBorderConnectedBackground,
  serializeWorkspaceExportJson,
  validateNormalizedCropRect,
  type RgbaColor,
  type WorkspaceExportInput,
} from "../src/lib/workspace-image-core";

function rgbaImage(rows: RgbaColor[][]) {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.flat().forEach((color, pixelIndex) => {
    data.set([color.r, color.g, color.b, color.a], pixelIndex * 4);
  });
  return { width, height, data };
}

const white = { r: 246, g: 246, b: 244, a: 255 };
const nearWhite = { r: 240, g: 243, b: 240, a: 255 };
const ink = { r: 28, g: 31, b: 40, a: 255 };

test("finds the dominant non-transparent border color deterministically", () => {
  const transparent = { r: 0, g: 0, b: 0, a: 0 };
  const image = rgbaImage([
    [transparent, white, white],
    [white, ink, white],
    [nearWhite, white, white],
  ]);

  assert.deepEqual(dominantBorderColor(image), white);
});

test("removes only matching background connected to the border", () => {
  const image = rgbaImage([
    [white, white, nearWhite, white, white],
    [white, ink, ink, ink, white],
    [white, ink, white, ink, white],
    [white, ink, ink, ink, white],
    [white, white, white, white, white],
  ]);

  const result = removeBorderConnectedBackground(image, { tolerance: 8 });
  assert.deepEqual(result.backgroundColor, white);
  assert.equal(result.borderMatchRatio, 1);
  assert.equal(result.removedPixelCount, 16);
  assert.equal(result.data[(2 * 5 + 2) * 4 + 3], 255);
  assert.equal(result.data[(1 * 5 + 1) * 4 + 3], 255);
  assert.equal(result.data[3], 0);
  assert.equal(image.data[3], 255, "the source image must not be mutated");
});

test("transparent images and invalid RGBA buffers are handled explicitly", () => {
  const transparent = rgbaImage([
    [
      { r: 0, g: 0, b: 0, a: 0 },
      { r: 0, g: 0, b: 0, a: 0 },
    ],
  ]);
  const result = removeBorderConnectedBackground(transparent);
  assert.equal(result.backgroundColor, null);
  assert.equal(result.borderMatchRatio, 0);
  assert.equal(result.removedPixelCount, 0);

  assert.throws(
    () =>
      dominantBorderColor({
        width: 2,
        height: 2,
        data: new Uint8ClampedArray(4),
      }),
    /does not match/,
  );
  assert.throws(
    () => removeBorderConnectedBackground(transparent, { tolerance: 12.5 }),
    /integer between 0 and 255/,
  );
});

test("rejects noisy borders that do not support one background color", () => {
  const borderColors = [
    { r: 210, g: 24, b: 24, a: 255 },
    { r: 24, g: 210, b: 24, a: 255 },
    { r: 24, g: 24, b: 210, a: 255 },
    { r: 210, g: 210, b: 24, a: 255 },
  ];
  let borderIndex = 0;
  const image = rgbaImage(
    Array.from({ length: 8 }, (_, y) =>
      Array.from({ length: 8 }, (_, x) => {
        if (x === 0 || y === 0 || x === 7 || y === 7) {
          const color = borderColors[borderIndex % borderColors.length];
          borderIndex += 1;
          return color;
        }
        return ink;
      }),
    ),
  );

  const result = removeBorderConnectedBackground(image);
  assert.equal(result.borderMatchRatio, 0.25);
  assert.equal(result.removedPixelCount, 0);
  assert.deepEqual(result.data, image.data);
});

test("rejects a border match that would remove too little of the image", () => {
  const blue = { r: 24, g: 70, b: 205, a: 255 };
  const red = { r: 205, g: 45, b: 35, a: 255 };
  const image = rgbaImage(
    Array.from({ length: 100 }, (_, y) =>
      Array.from({ length: 100 }, (_, x) => {
        if (y === 0) return white;
        if (y === 99) return x < 60 ? white : blue;
        if (x === 0) return red;
        if (x === 99) return blue;
        return ink;
      }),
    ),
  );

  const rejected = removeBorderConnectedBackground(image);
  assert.ok(rejected.borderMatchRatio > 0.4);
  assert.equal(rejected.removedPixelCount, 0);
  assert.deepEqual(rejected.data, image.data);

  const allowed = removeBorderConnectedBackground(image, {
    minimumRemovedPixelShare: 0.01,
  });
  assert.equal(allowed.removedPixelCount, 160);
  assert.equal(allowed.data[3], 0);
});

test("validates normalized crops and includes partially covered edge pixels", () => {
  assert.deepEqual(
    validateNormalizedCropRect({ x: 0.1, y: 0.25, width: 0.6, height: 0.5 }),
    { x: 0.1, y: 0.25, width: 0.6, height: 0.5 },
  );
  assert.deepEqual(
    normalizedCropToPixels(
      { x: 0.1, y: 0.25, width: 0.6, height: 0.5 },
      13,
      10,
    ),
    { x: 1, y: 2, width: 9, height: 6 },
  );
  assert.deepEqual(
    normalizedCropToPixels({ x: 0, y: 0, width: 1, height: 1 }, 13, 10),
    { x: 0, y: 0, width: 13, height: 10 },
  );
  assert.throws(
    () => validateNormalizedCropRect({ x: 0.7, y: 0, width: 0.4, height: 1 }),
    /within the image/,
  );
  assert.throws(
    () => validateNormalizedCropRect({ x: 0, y: 0, width: 0, height: 1 }),
    /must be positive/,
  );
  assert.throws(
    () =>
      validateNormalizedCropRect({
        x: 1,
        y: 0,
        width: Number.EPSILON,
        height: 1,
      }),
    /start within the image/,
  );
  assert.throws(
    () =>
      validateNormalizedCropRect({
        x: 0,
        y: 0,
        width: undefined as unknown as number,
        height: 1,
      }),
    /finite number/,
  );
});

const exportInput: WorkspaceExportInput = {
  workspace: {
    id: "workspace-1",
    name: "Forest / Demo!",
    width: 1600,
    height: 1000,
  },
  brief: {
    description: "A tactical woodland adventure.",
    genre: "Strategy RPG",
    mood: "Moonlit and hopeful",
    targetPlatform: "PC",
    assetType: "Character",
  },
  nodes: [
    {
      id: "hidden",
      name: "Guide",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      zIndex: 4,
      visible: false,
    },
    {
      id: "hero",
      name: "Hero",
      type: "image",
      imageUrl: "/hero.png",
      x: 20,
      y: 40,
      width: 256,
      height: 256,
      opacity: 0.9,
      tint: "#ffffff",
      zIndex: 2,
      styleSpecId: "style-1",
      referenceIds: ["ref-b", "ref-a"],
    },
    {
      id: "shadow",
      assetId: "asset-shadow",
      parentAssetId: "asset-shadow-source",
      assetMimeType: " IMAGE/PNG ",
      assetSource: "AI",
      assetOperation: "REMOVE_SOLID_BACKGROUND",
      operationParameters: {
        tolerance: 18,
        detectedColor: { r: 246, g: 246, b: 244 },
        removedPixelCount: 1400,
      },
      name: "Shadow",
      kind: "IMAGE",
      assetUrl: "/shadow.png",
      pixelWidth: 1024,
      pixelHeight: 512,
      x: 24,
      y: 220,
      width: 240,
      height: 80,
      color: "#d0d0d0",
      zIndex: 1,
      aspectLocked: true,
    },
  ],
  references: [
    {
      id: "ref-b",
      title: "Painterly forest",
      imageUrl: "/references/b.png",
      sourceName: "Atlas reference library",
      palette: ["#203429", "#9dbc73"],
      traits: ["soft edges"],
      description: "A soft painted forest treatment.",
    },
    {
      id: "ref-a",
      title: "Graphic forest",
      imageUrl: "/references/a.png",
      sourceName: "Atlas reference library",
      license: "Internal prototype",
      palette: ["#16251d", "#e8cd72"],
      traits: ["bold silhouettes"],
      description: "A graphic forest treatment.",
    },
  ],
  selectedStyleSpec: {
    id: "style-1",
    styleName: "Moonlit storybook",
    palette: ["#16251d", "#e8cd72"],
    lineStyle: "soft ink",
    lighting: "cool moonlight",
    materials: ["painted wood", "aged brass"],
    shapeLanguage: "rounded silhouettes",
    detailLevel: "medium",
    compositionNotes: ["clear silhouette"],
    referenceIds: ["ref-a", "ref-b"],
  },
};

test("builds a deterministic export plan with only visible render layers", () => {
  const reversed: WorkspaceExportInput = {
    ...exportInput,
    nodes: [...exportInput.nodes].reverse(),
    references: [...(exportInput.references ?? [])].reverse(),
  };

  const plan = createWorkspaceExportPlan(exportInput);
  const reversedPlan = createWorkspaceExportPlan(reversed);
  assert.deepEqual(plan, reversedPlan);
  assert.deepEqual(
    plan.renderNodes.map((node) => node.id),
    ["shadow", "hero"],
  );
  assert.deepEqual(
    plan.files.map(({ kind, fileName }) => [kind, fileName]),
    [
      ["COMPOSED_PNG", "forest-demo.png"],
      ["WORKSPACE_JSON", "forest-demo.workspace.json"],
      ["ASSET_METADATA_JSON", "forest-demo.assets.json"],
      ["STYLE_SPEC_JSON", "forest-demo.style-spec.json"],
      ["REFERENCE_METADATA_JSON", "forest-demo.references.json"],
    ],
  );
});

test("serializes stable workspace, asset, style, and reference metadata JSON", () => {
  const serialized = serializeWorkspaceExportJson(exportInput);
  const workspace = JSON.parse(serialized.workspaceJson);
  const assets = JSON.parse(serialized.assetMetadataJson);
  const style = JSON.parse(serialized.styleSpecJson ?? "null");
  const references = JSON.parse(serialized.referenceMetadataJson);

  assert.deepEqual(
    workspace.nodes.map((node: { id: string }) => node.id),
    ["shadow", "hero", "hidden"],
  );
  assert.equal(assets.assets[0].opacity, 1);
  assert.equal(assets.assets[0].assetId, "asset-shadow");
  assert.equal(assets.assets[0].parentAssetId, "asset-shadow-source");
  assert.equal(assets.assets[0].assetMimeType, "image/png");
  assert.equal(assets.assets[0].assetSource, "AI");
  assert.deepEqual(Object.keys(assets.assets[0].operationParameters), [
    "detectedColor",
    "removedPixelCount",
    "tolerance",
  ]);
  assert.deepEqual(
    Object.keys(assets.assets[0].operationParameters.detectedColor),
    ["b", "g", "r"],
  );
  assert.equal(assets.assets[0].imageUrl, "/shadow.png");
  assert.equal(assets.assets[0].tint, "#d0d0d0");
  assert.equal(assets.assets[0].aspectLocked, true);
  assert.equal(assets.assets[0].pixelWidth, 1024);
  assert.equal(workspace.workspace.brief.genre, "Strategy RPG");
  assert.equal(style.styleSpec.styleName, "Moonlit storybook");
  assert.deepEqual(
    references.references.map((reference: { id: string }) => reference.id),
    ["ref-a", "ref-b"],
  );
  assert.equal(serialized.workspaceJson.endsWith("\n"), true);
});

test("export provenance rejects values that are not deterministic JSON", () => {
  const shadow = exportInput.nodes.find((node) => node.id === "shadow");
  assert.ok(shadow);
  assert.throws(
    () =>
      serializeWorkspaceExportJson({
        ...exportInput,
        nodes: [
          {
            ...shadow,
            operationParameters: {
              tolerance: Number.NaN,
            },
          },
        ],
      }),
    /non-finite numbers/,
  );
  assert.throws(
    () =>
      serializeWorkspaceExportJson({
        ...exportInput,
        nodes: [
          {
            ...shadow,
            operationParameters: [] as unknown as Record<string, never>,
          },
        ],
      }),
    /must be a JSON object/,
  );
});

test("reference metadata can be limited to the selected source set", () => {
  const serialized = serializeWorkspaceExportJson({
    ...exportInput,
    nodes: exportInput.nodes.map((node) => ({
      ...node,
      referenceIds: [],
    })),
    selectedReferenceIds: ["ref-a"],
    selectedStyleSpec: null,
  });
  const references = JSON.parse(serialized.referenceMetadataJson);
  const workspace = JSON.parse(serialized.workspaceJson);

  assert.deepEqual(
    references.references.map((reference: { id: string }) => reference.id),
    ["ref-a"],
  );
  assert.deepEqual(workspace.workspace.selectedReferenceIds, ["ref-a"]);
  assert.equal(serialized.styleSpecJson, null);
});
