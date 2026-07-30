import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationSession } from "../src/lib/generation-session";

function makeSession(now = 1_000) {
  let currentTime = now;
  let sequence = 0;
  const session = createGenerationSession({
    now: () => currentTime,
    createToken: () => `test-token-${++sequence}`,
    ttlMs: 100,
  });

  return {
    session,
    advanceBy(milliseconds: number) {
      currentTime += milliseconds;
    },
  };
}

test("a valid generation token succeeds once and unknown tokens fail", () => {
  const { session } = makeSession();
  const token = session.createGenerationToken("compiled prompt");

  assert.equal(token, "test-token-1");
  assert.deepEqual(session.consumeGenerationToken(token), {
    compiledPrompt: "compiled prompt",
    background: "opaque",
    referenceFamilyIds: [],
    generationMode: "text-only",
    expiresAt: 1_100,
  });
  assert.equal(session.consumeGenerationToken(token), null);
  assert.equal(session.consumeGenerationToken("unknown-token"), null);
});

test("a generation token preserves the server-selected output background", () => {
  const { session } = makeSession();
  const token = session.createGenerationToken("compiled prompt", "transparent");

  assert.deepEqual(session.consumeGenerationToken(token), {
    compiledPrompt: "compiled prompt",
    background: "transparent",
    referenceFamilyIds: [],
    generationMode: "text-only",
    expiresAt: 1_100,
  });
});

test("a generation token binds a copied stable reference order and derives visual mode", () => {
  const { session } = makeSession();
  const referenceFamilyIds = [
    "kenney-platformer-female",
    "kenney-platformer-adventurer",
  ];
  const token = session.createGenerationToken(
    "compiled prompt",
    "transparent",
    referenceFamilyIds,
  );

  referenceFamilyIds.reverse();
  assert.deepEqual(session.consumeGenerationToken(token), {
    compiledPrompt: "compiled prompt",
    background: "transparent",
    referenceFamilyIds: [
      "kenney-platformer-adventurer",
      "kenney-platformer-female",
    ],
    generationMode: "visual-reference",
    expiresAt: 1_100,
  });
});

test("a generation token rejects duplicate or excessive reference IDs", () => {
  const { session } = makeSession();

  assert.throws(
    () =>
      session.createGenerationToken("compiled prompt", "opaque", [
        "kenney-a",
        "kenney-a",
      ]),
    /one to three unique reference family IDs/i,
  );
  assert.throws(
    () =>
      session.createGenerationToken("compiled prompt", "opaque", [
        "kenney-a",
        "kenney-b",
        "kenney-c",
        "kenney-d",
      ]),
    /one to three unique reference family IDs/i,
  );
});

test("expired generation tokens fail without becoming usable", () => {
  const { session, advanceBy } = makeSession();
  const token = session.createGenerationToken("compiled prompt");

  advanceBy(100);
  assert.equal(session.consumeGenerationToken(token), null);
});
