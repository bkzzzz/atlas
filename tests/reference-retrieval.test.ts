import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import {
  formatReferenceContext,
  REFERENCE_LIBRARY,
  retrieveReferences,
  type CuratedReference,
  type ReferenceQuery,
} from "../src/lib/reference-retrieval";

const PIXEL_QUERY: ReferenceQuery = {
  projectBrief:
    "A cozy woodland action RPG about restoring a hopeful, weathered village.",
  assetRequest:
    "Create a side-view pixel art character sprite of a lantern-carrying herbalist.",
  assetType: "CHARACTER_SPRITE",
  settings: {
    visualStyle: "PIXEL_ART",
    viewAngle: "SIDE",
    background: "TRANSPARENT",
    pixelDetail: "MEDIUM",
    groundShadow: "NONE",
  },
};

function reference(
  id: string,
  overrides: Partial<CuratedReference> = {},
): CuratedReference {
  return {
    id,
    title: id,
    imagePath: `/references/${id}.webp`,
    medium: ["illustration"],
    perspective: ["front view"],
    genre: ["fantasy"],
    mood: ["hopeful"],
    palette: ["forest green #355b3e"],
    materials: ["wood"],
    subjectTags: ["character"],
    detailDensity: "medium",
    negativeTraits: [],
    ...overrides,
  };
}

test("the curated library has eight unique, locally available references", () => {
  assert.equal(REFERENCE_LIBRARY.length, 8);
  assert.equal(
    new Set(REFERENCE_LIBRARY.map((item) => item.id)).size,
    REFERENCE_LIBRARY.length,
  );

  for (const item of REFERENCE_LIBRARY) {
    assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(item.imagePath, /^\/references\/[a-z0-9-]+\.webp$/);
    assert.ok(existsSync(`public${item.imagePath}`), item.imagePath);
    assert.ok(item.medium.length);
    assert.ok(item.perspective.length);
    assert.ok(item.genre.length);
    assert.ok(item.mood.length);
    assert.ok(item.palette.length);
    assert.ok(item.materials.length);
    assert.ok(item.subjectTags.length);
    assert.ok(item.negativeTraits.length);
  }
});

test("retrieval is deterministic and ranks specific art direction above broad context", () => {
  const first = retrieveReferences(PIXEL_QUERY);
  const second = retrieveReferences({ ...PIXEL_QUERY });

  assert.deepEqual(first, second);
  assert.equal(first.length, 6);
  assert.equal(first[0]?.reference.id, "mossbound-pixel");
  assert.ok(first[0]?.matchedFields.includes("medium"));
  assert.ok(first[0]?.score > first[1]?.score);
});

test("explicit view and material direction ranks the tactical isometric reference", () => {
  const results = retrieveReferences({
    projectBrief: "A sun-baked tactical fantasy strategy game.",
    assetRequest: "An isometric bronze and sandstone defensive prop.",
    assetType: "PROP",
    settings: {
      visualStyle: "ILLUSTRATION",
      viewAngle: "ISOMETRIC",
      background: "TRANSPARENT",
      pixelDetail: "MEDIUM",
      groundShadow: "NONE",
    },
  });

  assert.equal(results[0]?.reference.id, "sunforge-tactics");
});

test("negative traits lower an otherwise equivalent reference", () => {
  const clean = reference("clean");
  const incompatible = reference("incompatible", {
    negativeTraits: ["pixel art"],
  });

  const results = retrieveReferences(
    {
      projectBrief: "A fantasy adventure.",
      assetRequest: "A pixel art character.",
      assetType: "CHARACTER_SPRITE",
    },
    [incompatible, clean],
  );

  assert.equal(results[0]?.reference.id, "clean");
  assert.ok(
    results.find((item) => item.reference.id === "clean")!.score >
      results.find((item) => item.reference.id === "incompatible")!.score,
  );
});

test("top-k results are stable, omit zero scores, and never mutate the library", () => {
  const library = [
    reference("zeta", { subjectTags: ["unrelated"] }),
    reference("beta"),
    reference("alpha"),
  ];
  const before = structuredClone(library);
  const results = retrieveReferences(
    {
      projectBrief: "",
      assetRequest: "character",
      assetType: "CHARACTER_SPRITE",
    },
    library,
    2,
  );

  assert.deepEqual(
    results.map((item) => item.reference.id),
    ["alpha", "beta"],
  );
  assert.deepEqual(library, before);
});

test("selected metadata is formatted canonically without ids or image paths", () => {
  const selected = [
    REFERENCE_LIBRARY.find((item) => item.id === "moonlit-ink")!,
    REFERENCE_LIBRARY.find((item) => item.id === "mossbound-pixel")!,
  ];
  const context = formatReferenceContext(selected);

  assert.match(
    context,
    /^Selected curated reference metadata\.\nMetadata guidance only; reference images are not visual inputs\./,
  );
  assert.ok(context.indexOf("Moonlit Ink") < context.indexOf("Mossbound Pixel"));
  assert.match(context, /medium:/);
  assert.match(context, /palette:/);
  assert.match(context, /materials:/);
  assert.match(context, /Avoid carrying over:/);
  assert.doesNotMatch(context, /moonlit-ink|mossbound-pixel|\/references\//);
});

test("reference context requires one to three unique selections", () => {
  assert.throws(() => formatReferenceContext([]), /one to three/i);
  assert.throws(
    () =>
      formatReferenceContext([
        REFERENCE_LIBRARY[0],
        REFERENCE_LIBRARY[0],
      ]),
    /unique/i,
  );
  assert.throws(
    () => formatReferenceContext(REFERENCE_LIBRARY.slice(0, 4)),
    /one to three/i,
  );
});
