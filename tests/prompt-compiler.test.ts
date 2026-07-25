import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationSession } from "../src/lib/generation-session";
import { compileSingleStaticImageTask } from "../src/lib/single-image-compiler";
import { validateParsedStaticImageTask } from "../src/lib/task-schema";
import { runStaticImageMode } from "../src/lib/task-mode";

const metadata = {
  version: "1.0" as const,
  character: {
    id: "character-1",
    name: "Atlas eye",
    description: "A floating eye creature",
    personality: "watchful",
    species: "arcane creature",
  },
  memory: null,
  approvedAssets: [],
  rejectedAssets: [],
};

const staticTask = {
  assetKind: "sprite",
  visualSubject: "floating eye with a rotating golden outer ring",
  visualStyle: "low-resolution pixel art",
  composition: "centered front view",
  dimensions: "1024x1024",
  background: "white",
  positiveConstraints: ["clear crisp edges"],
  negativeConstraints: ["no ground shadow"],
  referenceAssets: [],
  assumptions: [],
};

// The parser keeps the original request for traceability, but the compiler
// must also preserve the reviewed structured fields independently of it.
const request = "Generate a low-resolution pixel-art floating eye creature with a rotating golden outer ring.";

test("compiles the same static task into the exact same prompt", () => {
  const parsed = validateParsedStaticImageTask(staticTask, request);
  assert.ok(parsed);

  const first = compileSingleStaticImageTask(parsed, metadata);
  const second = compileSingleStaticImageTask(parsed, metadata);

  assert.deepEqual(first, second);
});

test("keeps reviewed static constraints even when the original request omits them", () => {
  const parsed = validateParsedStaticImageTask(staticTask, request);
  assert.ok(parsed);
  const compiled = compileSingleStaticImageTask(parsed, metadata);

  assert.match(compiled.compiledPrompt, /background: white/i);
  assert.match(compiled.compiledPrompt, /no ground shadow/i);
  assert.doesNotMatch(compiled.compiledPrompt, /animation|frame count|loop/i);
});

test("STATIC_IMAGE validates, compiles, and receives a one-time token", async () => {
  const session = createGenerationSession({
    now: () => 1_000,
    createToken: () => "static-image-token",
    ttlMs: 100,
  });
  const result = await runStaticImageMode("STATIC_IMAGE", async () => {
    const parsed = validateParsedStaticImageTask(staticTask, request);
    assert.ok(parsed);
    const compiled = compileSingleStaticImageTask(parsed, metadata);
    return session.createGenerationToken(compiled.compiledPrompt);
  });

  assert.deepEqual(result, { supported: true, value: "static-image-token" });
  assert.deepEqual(session.consumeGenerationToken("static-image-token"), {
    compiledPrompt: compileSingleStaticImageTask(
      validateParsedStaticImageTask(staticTask, request)!,
      metadata,
    ).compiledPrompt,
    expiresAt: 1_100,
  });
});
