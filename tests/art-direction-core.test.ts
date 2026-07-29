import assert from "node:assert/strict";
import test from "node:test";
import {
  artDirectionDraftChanged,
  ArtDirectionInputError,
  compileGenerationDirection,
  createStyleSpec,
  validateReferenceSelection,
  type GameBrief,
} from "../src/lib/art-direction-core";
import { REFERENCE_LIBRARY } from "../src/lib/reference-library";

const BRIEF: GameBrief = {
  description: "A quiet woodland adventure about restoring a ruined shrine.",
  genre: "cozy action RPG",
  mood: "hopeful and mysterious",
  targetPlatform: "desktop and handheld",
  assetType: "player character",
};

test("draft freshness changes with normalized brief content or reference order", () => {
  assert.equal(
    artDirectionDraftChanged(
      BRIEF,
      ["mossbound-pixel", "moonlit-ink"],
      { ...BRIEF },
      ["mossbound-pixel", "moonlit-ink"],
    ),
    false,
  );
  assert.equal(
    artDirectionDraftChanged(
      BRIEF,
      ["mossbound-pixel", "moonlit-ink"],
      { ...BRIEF, mood: "ominous" },
      ["mossbound-pixel", "moonlit-ink"],
    ),
    true,
  );
  assert.equal(
    artDirectionDraftChanged(
      BRIEF,
      ["mossbound-pixel", "moonlit-ink"],
      { ...BRIEF },
      ["moonlit-ink", "mossbound-pixel"],
    ),
    true,
  );
});

test("the local reference library exposes eight stable, production-shaped entries", () => {
  assert.equal(REFERENCE_LIBRARY.length, 8);
  assert.equal(new Set(REFERENCE_LIBRARY.map((item) => item.id)).size, 8);

  for (const reference of REFERENCE_LIBRARY) {
    assert.match(reference.imageUrl, /^\/references\/[a-z0-9-]+\.webp$/);
    assert.ok(reference.description.length > 40);
    assert.ok(reference.palette.length >= 5);
    assert.ok(reference.palette.every((color) => /^#[0-9a-f]{6}$/i.test(color)));
    assert.ok(reference.traits.length >= 3);
    assert.ok(reference.styleHints.materials.length >= 3);
    assert.ok(reference.styleHints.compositionNotes.length >= 2);
  }
});

test("reference selection accepts one to three unique references", () => {
  assert.equal(validateReferenceSelection(REFERENCE_LIBRARY.slice(0, 1)).length, 1);
  assert.equal(validateReferenceSelection(REFERENCE_LIBRARY.slice(0, 3)).length, 3);

  assert.throws(
    () => validateReferenceSelection([]),
    ArtDirectionInputError,
  );
  assert.throws(
    () => validateReferenceSelection(REFERENCE_LIBRARY.slice(0, 4)),
    /Choose between 1 and 3 references/,
  );
  assert.throws(
    () =>
      validateReferenceSelection([
        REFERENCE_LIBRARY[0],
        REFERENCE_LIBRARY[0],
      ]),
    /Choose each reference only once/,
  );
});

test("StyleSpec creation is deterministic and grounded in selected references", () => {
  const references = [REFERENCE_LIBRARY[0], REFERENCE_LIBRARY[1]];
  const first = createStyleSpec(BRIEF, references);
  const second = createStyleSpec(
    { ...BRIEF },
    references.map((reference) => ({ ...reference })),
  );

  assert.deepEqual(first, second);
  assert.match(first.id, /^style-[a-z0-9]+$/);
  assert.equal(first.styleName, "Mossbound Pixel + Hearthlight Storybook");
  assert.deepEqual(first.referenceIds, [
    "mossbound-pixel",
    "hearthlight-storybook",
  ]);
  assert.ok(first.palette.includes("#18251f"));
  assert.ok(first.palette.includes("#382b35"));
  assert.ok(first.materials.includes("moss"));
  assert.match(first.lineStyle, /^Blend line treatments:/);
  assert.match(first.compositionNotes[0], /player character/);
  assert.match(first.compositionNotes[1], /cozy action RPG/);
});

test("generation direction compiles the brief and approved StyleSpec without fake AI output", () => {
  const styleSpec = createStyleSpec(BRIEF, [
    REFERENCE_LIBRARY[0],
    REFERENCE_LIBRARY[2],
  ]);
  const direction = compileGenerationDirection({
    brief: BRIEF,
    styleSpec,
    prompt: "  Give the hero a lantern\nand a short travel cloak.  ",
  });

  assert.match(direction, /^Create exactly one production-ready game asset/);
  assert.match(direction, /GAME BRIEF/);
  assert.match(direction, /Target platform: desktop and handheld/);
  assert.match(direction, /APPROVED STYLE SPEC/);
  assert.match(direction, /Source references: mossbound-pixel, moonlit-ink/);
  assert.match(direction, /Give the hero a lantern and a short travel cloak\./);
  assert.match(direction, /Produce one asset only/);
  assert.doesNotMatch(direction, /\bundefined\b/);
});
