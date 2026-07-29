import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createReferenceImageHandler } from "../src/lib/reference-image-handler";
import type {
  ReferenceFamily,
  ReferenceFamilyIndex,
} from "../src/lib/reference-family";

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
]);

test("a known family ID serves its approved representative PNG with safe headers", async () => {
  const sourceRoot = await mkdtemp(
    path.join(os.tmpdir(), "atlas-reference-image-"),
  );
  const relativePath = "2D assets/Test Pack/PNG/Default/tower one.png";
  const absolutePath = path.join(sourceRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, PNG_BYTES);
  const handler = createReferenceImageHandler({
    sourceRoot,
    loadFamilyIndex: async () =>
      index([family("kenney-test-tower", relativePath)]),
  });

  const response = await handler(
    new Request(
      "http://localhost/api/references/image?id=kenney-test-tower",
    ),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("content-length"), String(PNG_BYTES.length));
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=3600, stale-while-revalidate=86400",
  );
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG_BYTES);
});

test("the image route accepts only one known family ID and never accepts a path", async () => {
  let loadCalls = 0;
  const handler = createReferenceImageHandler({
    sourceRoot: "/private/kenney-source",
    loadFamilyIndex: async () => {
      loadCalls += 1;
      return index([]);
    },
  });
  const malformedUrls = [
    "http://localhost/api/references/image",
    "http://localhost/api/references/image?id=",
    "http://localhost/api/references/image?id=kenney-a&id=kenney-b",
    "http://localhost/api/references/image?id=kenney-a&path=secret.png",
    "http://localhost/api/references/image?path=secret.png",
    "http://localhost/api/references/image?id=..%2Fsecret",
  ];

  for (const url of malformedUrls) {
    const response = await handler(new Request(url));
    assert.equal(response.status, 400, url);
  }
  assert.equal(loadCalls, 0);

  const unknown = await handler(
    new Request("http://localhost/api/references/image?id=kenney-unknown"),
  );
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), {
    error: "Reference preview not found.",
  });
  assert.equal(loadCalls, 1);
});

test("untrusted index paths cannot escape the source root or serve non-PNG files", async () => {
  const parent = await mkdtemp(
    path.join(os.tmpdir(), "atlas-reference-boundary-"),
  );
  const sourceRoot = path.join(parent, "Kenney");
  const outsidePath = path.join(parent, "outside.png");
  const webpPath = path.join(sourceRoot, "inside.webp");
  await mkdir(sourceRoot, { recursive: true });
  await Promise.all([
    writeFile(outsidePath, PNG_BYTES),
    writeFile(webpPath, PNG_BYTES),
  ]);
  const handler = createReferenceImageHandler({
    sourceRoot,
    loadFamilyIndex: async () =>
      index([
        family("kenney-traversal", "../outside.png"),
        family("kenney-absolute", outsidePath),
        family("kenney-backslash", "..\\outside.png"),
        family("kenney-webp", "inside.webp"),
      ]),
  });

  for (const id of [
    "kenney-traversal",
    "kenney-absolute",
    "kenney-backslash",
    "kenney-webp",
  ]) {
    const response = await handler(
      new Request(`http://localhost/api/references/image?id=${id}`),
    );
    const body = await response.text();
    assert.equal(response.status, 404, id);
    assert.doesNotMatch(body, /outside\.png|inside\.webp|atlas-reference-boundary/);
  }
});

test("realpath containment and PNG signature checks block symlink escapes and disguised files", async () => {
  const parent = await mkdtemp(
    path.join(os.tmpdir(), "atlas-reference-realpath-"),
  );
  const sourceRoot = path.join(parent, "Kenney");
  const outsideDirectory = path.join(parent, "outside");
  await Promise.all([
    mkdir(sourceRoot, { recursive: true }),
    mkdir(outsideDirectory, { recursive: true }),
  ]);
  const outsidePng = path.join(outsideDirectory, "outside.png");
  await Promise.all([
    writeFile(outsidePng, PNG_BYTES),
    writeFile(path.join(sourceRoot, "disguised.png"), "not a png"),
    symlink(outsidePng, path.join(sourceRoot, "linked.png")),
    symlink(outsideDirectory, path.join(sourceRoot, "linked-directory")),
  ]);
  const handler = createReferenceImageHandler({
    sourceRoot,
    loadFamilyIndex: async () =>
      index([
        family("kenney-linked-file", "linked.png"),
        family(
          "kenney-linked-directory",
          "linked-directory/outside.png",
        ),
        family("kenney-disguised", "disguised.png"),
      ]),
  });

  for (const id of [
    "kenney-linked-file",
    "kenney-linked-directory",
    "kenney-disguised",
  ]) {
    const response = await handler(
      new Request(`http://localhost/api/references/image?id=${id}`),
    );
    const body = await response.text();
    assert.equal(response.status, 404, id);
    assert.doesNotMatch(
      body,
      /outside\.png|disguised\.png|atlas-reference-realpath/,
    );
  }
});

test("an unavailable family index fails closed without exposing local paths", async () => {
  const sourceRoot = "/private/data/reference-source/Kenney";
  const handler = createReferenceImageHandler({
    sourceRoot,
    loadFamilyIndex: async () => {
      throw new Error(`ENOENT: ${sourceRoot}/reference-families.json`);
    },
  });

  const response = await handler(
    new Request(
      "http://localhost/api/references/image?id=kenney-known-family",
    ),
  );
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.doesNotMatch(body, /private|reference-source|reference-families/);
});

function family(
  id: string,
  representativeImagePath: string,
): ReferenceFamily {
  return {
    id,
    title: id,
    pack: "Test Pack",
    category: "props",
    tags: ["prop"],
    source: "Kenney",
    author: "Kenney",
    license: "CC0-1.0",
    representativeImagePath,
    memberImagePaths: [representativeImagePath, `${representativeImagePath}.variant`],
    embeddingText: `${id} prop`,
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
