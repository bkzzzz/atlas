import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CharacterMemoryContent,
  CharacterMemoryFields,
  type MemoryForm,
} from "../src/components/memory-section";

const memoryForm: MemoryForm = {
  visualStyle: "storybook cut paper",
  lore: "Raised in a floating city",
  designRules: "Keep the gold collar",
  approvedSummary: "Strong silhouette",
  rejectedSummary: "Avoid realistic rendering",
  preferredPrompt: "Use graphic shapes",
};

test("memory editing keeps identity visible and internal guidance under Advanced memory", () => {
  const html = renderToStaticMarkup(
    React.createElement(CharacterMemoryFields, {
      form: memoryForm,
      setForm: () => undefined,
    }),
  );
  const disclosure = html.indexOf("<details");

  assert.ok(disclosure > 0);
  assert.ok(html.indexOf("Visual style") < disclosure);
  for (const label of [
    "Lore",
    "Design rules",
    "Approved summary",
    "Rejected summary",
    "Preferred prompt",
  ]) {
    assert.ok(html.indexOf(label) > disclosure, `${label} should be advanced`);
  }
});

test("saved memory renders advanced fields behind the same disclosure", () => {
  const html = renderToStaticMarkup(
    React.createElement(CharacterMemoryContent, {
      memory: {
        id: "memory-1",
        characterId: "character-1",
        ...memoryForm,
        lastUpdated: "2026-07-25T12:00:00.000Z",
      },
    }),
  );
  const disclosure = html.indexOf("<details");

  assert.ok(html.indexOf("storybook cut paper") < disclosure);
  assert.ok(html.indexOf("Raised in a floating city") > disclosure);
  assert.match(html, /Advanced memory/);
});
