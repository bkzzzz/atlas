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
    referenceAssetIds: [],
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
    referenceAssetIds: [],
    expiresAt: 1_100,
  });
});

test("a generation token binds every active visual reference ID", () => {
  const { session } = makeSession();
  const token = session.createGenerationToken(
    "compiled prompt",
    "opaque",
    ["reference-new", "reference-legacy-rejected"],
  );

  assert.deepEqual(session.consumeGenerationToken(token), {
    compiledPrompt: "compiled prompt",
    background: "opaque",
    referenceAssetIds: [
      "reference-new",
      "reference-legacy-rejected",
    ],
    expiresAt: 1_100,
  });
});

test("expired generation tokens fail without becoming usable", () => {
  const { session, advanceBy } = makeSession();
  const token = session.createGenerationToken("compiled prompt");

  advanceBy(100);
  assert.equal(session.consumeGenerationToken(token), null);
});

test("a generation token binds server-created workspace persistence metadata", () => {
  const { session } = makeSession();
  const persistence = {
    generationRequestId: "request-1",
    anonymousOwnerKey: "owner-key",
    characterId: "character-1",
    assetName: "Mira — sprite",
    assetType: "sprite",
    sourcePrompt: "Create a sprite.",
    generationSettings: { version: 1 },
  };
  const token = session.createGenerationToken(
    "compiled prompt",
    "opaque",
    [],
    persistence,
  );

  assert.deepEqual(session.consumeGenerationToken(token), {
    compiledPrompt: "compiled prompt",
    background: "opaque",
    referenceAssetIds: [],
    persistence,
    expiresAt: 1_100,
  });
});
