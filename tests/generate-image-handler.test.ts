import assert from "node:assert/strict";
import test from "node:test";
import type { Uploadable } from "openai";
import { createGenerateImageHandler } from "../src/lib/generate-image-handler";
import { createGenerationSession } from "../src/lib/generation-session";
import type { GeneratedImage } from "../src/lib/image-generation-core";

const generatedImage: GeneratedImage = {
  imageUrl: "data:image/png;base64,aGVsbG8=",
  model: "mock-image-model",
  createdAt: "2026-07-24T12:00:00.000Z",
};

function makeSession(now = 1_000) {
  let currentTime = now;
  let sequence = 0;
  const session = createGenerationSession({
    now: () => currentTime,
    createToken: () => `handler-token-${++sequence}`,
    ttlMs: 100,
  });
  return {
    session,
    advanceBy(milliseconds: number) {
      currentTime += milliseconds;
    },
  };
}

function requestFor(token?: string, extra: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(token ? { generationToken: token } : {}), ...extra }),
  });
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

test("rejects requests with no token, unknown token, or expired token", async () => {
  const { session, advanceBy } = makeSession();
  const handler = createGenerateImageHandler({
    consumeGenerationToken: session.consumeGenerationToken,
    generateCompiledImage: async () => generatedImage,
  });

  const missing = await handler(requestFor());
  assert.equal(missing.status, 400);
  assert.deepEqual(await responseBody(missing), {
    error: "Parse and compile a supported image request before generating.",
  });

  const unknown = await handler(requestFor("unknown"));
  assert.equal(unknown.status, 409);

  const expired = session.createGenerationToken("stored prompt");
  assert.ok(expired);
  advanceBy(100);
  const expiredResponse = await handler(requestFor(expired));
  assert.equal(expiredResponse.status, 409);
  assert.match((await responseBody(expiredResponse)).error as string, /expired or was already used/);
});

test("rejects malformed request bodies before token or image work", async () => {
  const { session } = makeSession();
  let imageCalls = 0;
  const handler = createGenerateImageHandler({
    consumeGenerationToken: session.consumeGenerationToken,
    generateCompiledImage: async () => {
      imageCalls += 1;
      return generatedImage;
    },
  });
  const malformedRequest = new Request("http://localhost/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json",
  });

  const response = await handler(malformedRequest);

  assert.equal(response.status, 400);
  assert.deepEqual(await responseBody(response), {
    error: "A valid generation token is required.",
  });
  assert.equal(imageCalls, 0);
});

test("uses only the compiled prompt stored behind the token and calls the image generator once", async () => {
  const { session } = makeSession();
  const token = session.createGenerationToken("trusted server compiled prompt");
  assert.ok(token);
  const receivedPrompts: string[] = [];
  const handler = createGenerateImageHandler({
    consumeGenerationToken: session.consumeGenerationToken,
    generateCompiledImage: async (prompt) => {
      receivedPrompts.push(prompt);
      return generatedImage;
    },
  });

  const response = await handler(
    requestFor(token, {
      compiledPrompt: "browser-supplied prompt that must be ignored",
      model: "browser-supplied-model-that-must-be-ignored",
    }),
  );
  const body = await responseBody(response);

  assert.equal(response.status, 200);
  assert.deepEqual(receivedPrompts, ["trusted server compiled prompt"]);
  assert.deepEqual(body, {
    image: { ...generatedImage, compiledPrompt: "trusted server compiled prompt" },
  });
});

test("stores a generated image before returning it", async () => {
  const { session } = makeSession();
  const token = session.createGenerationToken("stored prompt");
  assert.ok(token);
  const persisted = {
    ...generatedImage,
    imageUrl: "https://store.public.blob.vercel-storage.com/generated/output.png",
    blobPathname: "generated/output.png",
  };
  const received: GeneratedImage[] = [];
  const handler = createGenerateImageHandler({
    consumeGenerationToken: session.consumeGenerationToken,
    generateCompiledImage: async () => generatedImage,
    persistGeneratedImage: async (image) => {
      received.push(image);
      return persisted;
    },
  });

  const response = await handler(requestFor(token));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(received, [generatedImage]);
  assert.equal(body.image.imageUrl, persisted.imageUrl);
  assert.equal(body.image.blobPathname, persisted.blobPathname);
});

test("adds the saved asset ID without trusting browser persistence metadata", async () => {
  const { session } = makeSession();
  const token = session.createGenerationToken("stored prompt");
  assert.ok(token);
  const received: unknown[] = [];
  const handler = createGenerateImageHandler({
    consumeGenerationToken: session.consumeGenerationToken,
    generateCompiledImage: async () => generatedImage,
    persistGeneratedAsset: async (image, pending) => {
      received.push({ image, pending });
      return { ...image, assetId: "asset-1" };
    },
  });

  const response = await handler(requestFor(token, {
    assetId: "browser-asset",
    anonymousOwnerKey: "browser-owner",
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.image.assetId, "asset-1");
  assert.equal(body.image.compiledPrompt, "stored prompt");
  assert.equal(received.length, 1);
});

test("reports a safe persistence error after image generation succeeds", async () => {
  const { session } = makeSession();
  const token = session.createGenerationToken("stored prompt");
  assert.ok(token);
  const logs: Array<Record<string, unknown>> = [];
  const handler = createGenerateImageHandler({
    consumeGenerationToken: session.consumeGenerationToken,
    generateCompiledImage: async () => generatedImage,
    persistGeneratedAsset: async () => {
      throw new Error("database failed with private persistence details");
    },
    logError: (_message, details) => logs.push(details),
  });

  const response = await handler(requestFor(token));
  const body = await responseBody(response);

  assert.equal(response.status, 503);
  assert.deepEqual(body, {
    error: "Generated image could not be saved. Please try again.",
    category: "persistence_failed",
  });
  assert.doesNotMatch(
    JSON.stringify({ body, logs }),
    /private persistence details/,
  );
});

test("uses only the output background stored behind the token", async () => {
  const { session } = makeSession();
  const token = session.createGenerationToken("trusted server compiled prompt", "transparent");
  assert.ok(token);
  const received: unknown[] = [];
  const handler = createGenerateImageHandler({
    consumeGenerationToken: session.consumeGenerationToken,
    generateCompiledImage: async (prompt, background) => {
      received.push({ prompt, background });
      return generatedImage;
    },
  });

  const response = await handler(requestFor(token, { background: "opaque" }));

  assert.equal(response.status, 200);
  assert.deepEqual(received, [{
    prompt: "trusted server compiled prompt",
    background: "transparent",
  }]);
});

test("passes every token-bound visual reference file to generation", async () => {
  const { session } = makeSession();
  const token = session.createGenerationToken(
    "trusted server compiled prompt",
    "opaque",
    ["reference-1", "reference-2"],
  );
  const uploads = [
    { name: "reference-1.png" },
    { name: "reference-2.webp" },
  ] as unknown as Uploadable[];
  const received: unknown[] = [];
  const handler = createGenerateImageHandler({
    consumeGenerationToken: session.consumeGenerationToken,
    resolveReferenceImageUploads: async (ids) => {
      received.push({ ids });
      return uploads;
    },
    generateCompiledImage: async (prompt, background, referenceImages) => {
      received.push({ prompt, background, referenceImages });
      return generatedImage;
    },
  });

  const response = await handler(requestFor(token));

  assert.equal(response.status, 200);
  assert.deepEqual(received, [
    { ids: ["reference-1", "reference-2"] },
    {
      prompt: "trusted server compiled prompt",
      background: "opaque",
      referenceImages: uploads,
    },
  ]);
});

test("consumes a token before the external image API and consumes it after a failed generation", async () => {
  const { session } = makeSession();
  const token = session.createGenerationToken("stored prompt");
  assert.ok(token);
  let calls = 0;
  const logs: Array<Record<string, unknown>> = [];
  const handler = createGenerateImageHandler({
    consumeGenerationToken: session.consumeGenerationToken,
    generateCompiledImage: async () => {
      calls += 1;
      // At this point route code has already removed the token, before a
      // network request is allowed to run.
      assert.equal(session.consumeGenerationToken(token), null);
      throw new Error("raw upstream stack with sk-test-secret, OPENAI_IMAGE_MODEL=private-test-image-model, and aGVsbG8=");
    },
    logError: (_message, details) => logs.push(details),
  });

  const first = await handler(requestFor(token));
  const firstBody = await responseBody(first);
  assert.equal(first.status, 502);
  assert.equal(firstBody.category, "unknown_upstream_error");
  assert.doesNotMatch(JSON.stringify(firstBody), /sk-test-secret|private-test-image-model|OPENAI_IMAGE_MODEL|aGVsbG8=|stack/);
  assert.doesNotMatch(JSON.stringify(logs), /sk-test-secret|private-test-image-model|OPENAI_IMAGE_MODEL|aGVsbG8=/);
  assert.equal(calls, 1);

  const second = await handler(requestFor(token));
  assert.equal(second.status, 409);
  assert.equal(calls, 1);
});

test("two simultaneous attempts yield exactly one successful generation and one conflict", async () => {
  const { session } = makeSession();
  const token = session.createGenerationToken("stored prompt");
  assert.ok(token);
  let imageCalls = 0;
  let releaseGeneration: (() => void) | undefined;
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    releaseGeneration = resolve;
  });
  const handler = createGenerateImageHandler({
    consumeGenerationToken: session.consumeGenerationToken,
    generateCompiledImage: async () => {
      imageCalls += 1;
      markStarted?.();
      await gate;
      return generatedImage;
    },
  });

  // Convert a non-2xx route response into a rejected attempt. This expresses
  // the caller's actual success/failure semantics while retaining HTTP checks.
  const attempt = async () => {
    const response = await handler(requestFor(token));
    if (!response.ok) throw new Error(`generation rejected with HTTP ${response.status}`);
    return response;
  };
  const attempts = [attempt(), attempt()];
  await started;
  releaseGeneration?.();
  const settled = await Promise.allSettled(attempts);

  assert.deepEqual(settled.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
  const success = settled.find((result) => result.status === "fulfilled");
  const failure = settled.find((result) => result.status === "rejected");
  assert.ok(success && success.status === "fulfilled");
  assert.equal(success.value.status, 200);
  assert.ok(failure && failure.status === "rejected");
  assert.match(String(failure.reason), /HTTP 409/);
  assert.equal(imageCalls, 1);
  assert.equal(session.consumeGenerationToken(token), null);
});
