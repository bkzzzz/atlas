import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type {
  ReferenceFamily,
  ReferenceFamilyIndex,
} from "../src/lib/reference-family";
import {
  createReferenceImageUploads,
  createReferenceImageInputResolver,
  ReferenceImageInputError,
} from "../src/lib/reference-image-inputs";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
]);

test("trusted family IDs resolve validated PNG bytes in token order", async () => {
  const sourceRoot = await mkdtemp(
    path.join(os.tmpdir(), "atlas-generation-references-"),
  );
  await Promise.all([
    writePng(sourceRoot, "Pack/PNG/a.png"),
    writePng(sourceRoot, "Pack/PNG/b.png"),
  ]);
  const resolveInputs = createReferenceImageInputResolver({
    sourceRoot,
    loadFamilyIndex: async () =>
      index([
        family("kenney-a", "Alpha", "Pack/PNG/a.png"),
        family("kenney-b", "Beta", "Pack/PNG/b.png"),
      ]),
  });

  const inputs = await resolveInputs(["kenney-b", "kenney-a"]);

  assert.deepEqual(
    inputs.map(({ id, title }) => ({ id, title })),
    [
      { id: "kenney-b", title: "Beta" },
      { id: "kenney-a", title: "Alpha" },
    ],
  );
  assert.deepEqual(inputs.map(({ bytes }) => bytes), [
    PNG_BYTES,
    PNG_BYTES,
  ]);
});

test("validated bytes become ordered PNG uploads with synthetic filenames", async () => {
  const calls: Array<{
    bytes: Buffer;
    name: string | null | undefined;
    type: string | undefined;
  }> = [];
  const uploads = await createReferenceImageUploads(
    [
      { id: "kenney-a", title: "Alpha", bytes: Buffer.from("alpha") },
      { id: "kenney-b", title: "Beta", bytes: Buffer.from("beta") },
    ],
    async (bytes, name, options) => {
      calls.push({
        bytes: Buffer.from(bytes as Uint8Array),
        name,
        type: options?.type,
      });
      return { upload: name } as never;
    },
  );

  assert.deepEqual(calls, [
    {
      bytes: Buffer.from("alpha"),
      name: "reference-1.png",
      type: "image/png",
    },
    {
      bytes: Buffer.from("beta"),
      name: "reference-2.png",
      type: "image/png",
    },
  ]);
  assert.deepEqual(uploads, [
    { upload: "reference-1.png" },
    { upload: "reference-2.png" },
  ]);
});

test("unknown IDs and missing source images fail closed", async () => {
  const sourceRoot = await mkdtemp(
    path.join(os.tmpdir(), "atlas-missing-references-"),
  );
  const resolveInputs = createReferenceImageInputResolver({
    sourceRoot,
    loadFamilyIndex: async () =>
      index([family("kenney-missing", "Missing", "Pack/missing.png")]),
  });

  await assert.rejects(
    resolveInputs(["kenney-unknown"]),
    ReferenceImageInputError,
  );
  await assert.rejects(
    resolveInputs(["kenney-missing"]),
    ReferenceImageInputError,
  );
});

test("path traversal, symlink escape, and invalid PNG signatures fail closed", async () => {
  const parent = await mkdtemp(
    path.join(os.tmpdir(), "atlas-unsafe-references-"),
  );
  const sourceRoot = path.join(parent, "Kenney");
  const outside = path.join(parent, "outside.png");
  await mkdir(sourceRoot, { recursive: true });
  await Promise.all([
    writeFile(outside, PNG_BYTES),
    writeFile(path.join(sourceRoot, "disguised.png"), "not a png"),
    symlink(outside, path.join(sourceRoot, "linked.png")),
  ]);
  const resolveInputs = createReferenceImageInputResolver({
    sourceRoot,
    loadFamilyIndex: async () =>
      index([
        family("kenney-traversal", "Traversal", "../outside.png"),
        family("kenney-symlink", "Symlink", "linked.png"),
        family("kenney-disguised", "Disguised", "disguised.png"),
      ]),
  });

  for (const id of [
    "kenney-traversal",
    "kenney-symlink",
    "kenney-disguised",
  ]) {
    await assert.rejects(resolveInputs([id]), ReferenceImageInputError);
  }
});

test("non-PNG and oversized files fail before their bytes are returned", async () => {
  const sourceRoot = await mkdtemp(
    path.join(os.tmpdir(), "atlas-invalid-references-"),
  );
  const oversized = path.join(sourceRoot, "oversized.png");
  await mkdir(sourceRoot, { recursive: true });
  await Promise.all([
    writeFile(path.join(sourceRoot, "image.webp"), PNG_BYTES),
    writeFile(oversized, PNG_BYTES),
  ]);
  await truncate(oversized, 25_000_001);
  const resolveInputs = createReferenceImageInputResolver({
    sourceRoot,
    loadFamilyIndex: async () =>
      index([
        family("kenney-webp", "WebP", "image.webp"),
        family("kenney-oversized", "Oversized", "oversized.png"),
      ]),
  });

  await assert.rejects(
    resolveInputs(["kenney-webp"]),
    ReferenceImageInputError,
  );
  await assert.rejects(
    resolveInputs(["kenney-oversized"]),
    ReferenceImageInputError,
  );
});

async function writePng(sourceRoot: string, relativePath: string) {
  const absolutePath = path.join(sourceRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, PNG_BYTES);
}

function family(
  id: string,
  title: string,
  representativeImagePath: string,
): ReferenceFamily {
  return {
    id,
    title,
    pack: "Test Pack",
    category: "props",
    tags: ["prop"],
    source: "Kenney",
    author: "Kenney",
    license: "CC0-1.0",
    representativeImagePath,
    memberImagePaths: [representativeImagePath],
    embeddingText: `${title} prop`,
  };
}

function index(
  families: readonly ReferenceFamily[],
): ReferenceFamilyIndex {
  return {
    schemaVersion: 1,
    sourceRoot: "data/reference-source/Kenney",
    selectedPacks: ["Test Pack"],
    families,
  };
}
