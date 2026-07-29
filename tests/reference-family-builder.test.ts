import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildReferenceFamilyIndex,
  groupPackFiles,
  MAX_REFERENCE_FAMILIES,
  MAX_REFERENCE_PREVIEW_BYTES,
  selectRepresentativeImage,
  type PackConfig,
} from "../scripts/reference-families/family-builder";

const fixtureConfig: PackConfig = {
  relativePath: "2D assets/Test Pack",
  category: "icons",
  tags: ["icon", "test"],
  familyLimit: 10,
  include: () => true,
};

test("groups numbered, scale, and color variants without creating one family per image", () => {
  const groups = groupPackFiles(
    [
      "PNG/Black/1x/buttonBlue_01.png",
      "PNG/White/1x/buttonRed_02.png",
      "PNG/Black/2x/buttonBlue_03.png",
      "PNG/White/1x/arrowLeft_01.png",
    ],
    fixtureConfig,
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "button");
  assert.equal(groups[0].memberImagePaths.length, 3);
});

test("representative selection excludes non-individual and oversized variants", () => {
  assert.equal(
    selectRepresentativeImage([
      "Spritesheet/sheet.png",
      "PNG/Retina/icon.png",
      "PNG/Double/icon.png",
      "PNG/Default/icon.png",
      "PNG/Default/alpha.png",
    ]),
    "PNG/Default/alpha.png",
  );
  assert.equal(
    selectRepresentativeImage([
      "Preview.png",
      "PNG/Retina/icon.png",
      "PNG/2x/icon.png",
    ]),
    null,
  );
  assert.equal(
    selectRepresentativeImage([
      "PNG/Default/iconLarge.png",
      "PNG/Default/iconOversized.png",
    ]),
    null,
  );
});

test("building the same fixture twice produces identical family JSON", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-family-builder-"));
  const pack = path.join(root, fixtureConfig.relativePath, "PNG", "Default");
  await mkdir(pack, { recursive: true });
  await Promise.all([
    writeFile(path.join(pack, "buttonBlue_01.png"), "a"),
    writeFile(path.join(pack, "buttonRed_02.png"), "b"),
    writeFile(path.join(pack, "buttonGreen_03.png"), "c"),
  ]);

  const first = await buildReferenceFamilyIndex(root, [fixtureConfig], false);
  const second = await buildReferenceFamilyIndex(root, [fixtureConfig], false);

  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.families.length, 1);
  assert.match(first.families[0].representativeImagePath, /buttonBlue_01\.png$/);
  assert.equal(first.families[0].memberImagePaths.length, 3);
  assert.doesNotMatch(first.families[0].embeddingText, /data\/reference-source/);
});

test("the hard maximum fails clearly instead of silently dropping families", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-family-limit-"));
  const packRoot = path.join(root, "2D assets", "Limit Pack", "PNG");
  await mkdir(packRoot, { recursive: true });
  const config: PackConfig = {
    relativePath: "2D assets/Limit Pack",
    category: "icons",
    tags: ["icon"],
    familyLimit: MAX_REFERENCE_FAMILIES + 1,
    include: () => true,
  };

  await Promise.all(
    Array.from({ length: MAX_REFERENCE_FAMILIES + 1 }, async (_, index) => {
      const stem = `symbol${String(index).padStart(3, "0")}Kind`;
      await writeFile(path.join(packRoot, `${stem}Blue.png`), "a");
      await writeFile(path.join(packRoot, `${stem}Red.png`), "b");
    }),
  );

  await assert.rejects(
    buildReferenceFamilyIndex(root, [config], false),
    /Reference family limit exceeded: 251\/250/,
  );
});

test("the representative image size budget fails clearly instead of dropping a family", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-family-size-limit-"));
  const packRoot = path.join(root, fixtureConfig.relativePath, "PNG", "Default");
  await mkdir(packRoot, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(packRoot, "buttonBlue_01.png"),
      Buffer.alloc(MAX_REFERENCE_PREVIEW_BYTES + 1),
    ),
    writeFile(path.join(packRoot, "buttonRed_02.png"), "variant"),
  ]);

  await assert.rejects(
    buildReferenceFamilyIndex(root, [fixtureConfig], false),
    /Representative image size limit exceeded/,
  );
});
