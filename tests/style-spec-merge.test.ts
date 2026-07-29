import assert from "node:assert/strict";
import test from "node:test";
import type { ReferenceFamily } from "../src/lib/reference-family";
import {
  mergeStyleSpecWithReferences,
  StyleSpecMergeError,
  type StyleSpecMergeErrorCode,
} from "../src/lib/style-spec-merge";
import type { ParsedStaticImageTask } from "../src/lib/task-schema";
import { DEFAULT_STATIC_IMAGE_ASSET_SETTINGS } from "../src/lib/task-mode";

const draft: ParsedStaticImageTask = {
  assetKind: "sprite",
  visualSubject: "a forest mage",
  visualStyle: "pixel art",
  composition: "centered front view",
  dimensions: "1024x1024",
  background: "transparent",
  positiveConstraints: ["readable silhouette"],
  negativeConstraints: ["no text"],
  referenceAssets: [],
  assumptions: [],
  assetSettings: DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
  userRequest: "Create a forest mage.",
  referenceGuidance: [],
};

function family(
  value: Pick<ReferenceFamily, "id" | "title" | "pack" | "category" | "tags">,
): ReferenceFamily {
  return {
    ...value,
    source: "Kenney",
    author: "Kenney",
    license: "CC0-1.0",
    representativeImagePath: `${value.pack}/PNG/example.png`,
    memberImagePaths: [`${value.pack}/PNG/example.png`],
    embeddingText: `${value.title} ${value.category} ${value.tags.join(" ")}`,
  };
}

test("merges trusted references deterministically without changing the authoritative Draft", () => {
  const references = [
    family({
      id: "kenney-reference-b",
      title: "  Forest   Mage ",
      pack: "  Platformer   Characters ",
      category: " CHARACTERS ",
      tags: ["walk", " Magic ", "magic"],
    }),
    family({
      id: "kenney-reference-a",
      title: "Ｆorest Mage",
      pack: "Platformer Characters",
      category: "characters",
      tags: [" forest ", "WALK"],
    }),
  ];
  const originalDraft = structuredClone(draft);

  const first = mergeStyleSpecWithReferences(
    draft,
    ["kenney-reference-b", "kenney-reference-a"],
    references,
  );
  const second = mergeStyleSpecWithReferences(
    draft,
    ["kenney-reference-b", "kenney-reference-a"],
    references,
  );

  assert.deepEqual(first, second);
  assert.deepEqual(draft, originalDraft);
  assert.notEqual(first.task, draft);
  assert.deepEqual(
    {
      assetKind: first.task.assetKind,
      visualSubject: first.task.visualSubject,
      composition: first.task.composition,
      dimensions: first.task.dimensions,
      background: first.task.background,
      assetSettings: first.task.assetSettings,
      positiveConstraints: first.task.positiveConstraints,
      negativeConstraints: first.task.negativeConstraints,
    },
    {
      assetKind: draft.assetKind,
      visualSubject: draft.visualSubject,
      composition: draft.composition,
      dimensions: draft.dimensions,
      background: draft.background,
      assetSettings: draft.assetSettings,
      positiveConstraints: draft.positiveConstraints,
      negativeConstraints: draft.negativeConstraints,
    },
  );
  assert.deepEqual(first.task.referenceGuidance, [
    {
      id: "kenney-reference-a",
      title: "Forest Mage",
      pack: "Platformer Characters",
      category: "characters",
      tags: ["forest", "WALK"],
    },
    {
      id: "kenney-reference-b",
      title: "Forest Mage",
      pack: "Platformer Characters",
      category: "characters",
      tags: ["Magic"],
    },
  ]);
  assert.deepEqual(first.referenceProvenance, [
    {
      id: "kenney-reference-a",
      pack: "Platformer Characters",
      source: "Kenney",
      author: "Kenney",
      license: "CC0-1.0",
    },
    {
      id: "kenney-reference-b",
      pack: "Platformer Characters",
      source: "Kenney",
      author: "Kenney",
      license: "CC0-1.0",
    },
  ]);
});

test("rejects unsafe reference selections with stable public error codes", () => {
  const trusted = [
    family({
      id: "kenney-reference-a",
      title: "Forest Mage",
      pack: "Platformer Characters",
      category: "characters",
      tags: ["mage"],
    }),
  ];
  const expectMergeError = (
    run: () => unknown,
    code: StyleSpecMergeErrorCode,
    message: string,
  ) => {
    assert.throws(run, (error: unknown) => {
      assert.ok(error instanceof StyleSpecMergeError);
      assert.equal(error.code, code);
      assert.equal(error.message, message);
      return true;
    });
  };

  expectMergeError(
    () => mergeStyleSpecWithReferences(draft, [], trusted),
    "invalid_count",
    "Select between one and three references.",
  );
  expectMergeError(
    () => mergeStyleSpecWithReferences(
      draft,
      ["a", "b", "c", "d"],
      trusted,
    ),
    "invalid_count",
    "Select between one and three references.",
  );
  expectMergeError(
    () => mergeStyleSpecWithReferences(
      draft,
      ["kenney-reference-a", "kenney-reference-a"],
      trusted,
    ),
    "duplicate_id",
    "Reference IDs must be unique.",
  );
  expectMergeError(
    () => mergeStyleSpecWithReferences(draft, ["kenney-unknown"], trusted),
    "unknown_id",
    "One or more unknown reference IDs were selected.",
  );
  expectMergeError(
    () => mergeStyleSpecWithReferences(
      {
        ...draft,
        referenceGuidance: [{
          id: "kenney-untrusted",
          title: "Untrusted",
          pack: "Untrusted",
          category: "Untrusted",
          tags: [],
        }],
      },
      ["kenney-reference-a"],
      trusted,
    ),
    "nonempty_draft_guidance",
    "Draft StyleSpec reference guidance must be empty.",
  );
});
