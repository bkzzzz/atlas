import assert from "node:assert/strict";
import test from "node:test";
import { consumeGenerationToken, createGenerationToken } from "../src/lib/generation-session";

test("a generation token can be used exactly once", () => {
  const token = createGenerationToken("compiled prompt");
  const pending = consumeGenerationToken(token);
  assert.equal(pending?.compiledPrompt, "compiled prompt");
  assert.equal(typeof pending?.expiresAt, "number");
  assert.equal(consumeGenerationToken(token), null);
});
