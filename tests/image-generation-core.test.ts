import assert from "node:assert/strict";
import test from "node:test";
import OpenAI, { type Uploadable } from "openai";
import {
  generateImageFromCompiledPrompt,
  ImageGenerationError,
  type ImageApiClient,
} from "../src/lib/image-generation-core";

const testApiKey = "sk-test-must-not-appear-in-output";
const testModel = "private-test-image-model";
const compiledPrompt = "SERVER-COMPILED prompt only";

function clientThat(
  implementation: () => Promise<unknown>,
  calls: { count: number; request?: unknown },
): ImageApiClient {
  return {
    images: {
      async generate(request) {
        calls.count += 1;
        calls.request = request;
        return implementation();
      },
      async edit(request) {
        calls.count += 1;
        calls.request = request;
        return implementation();
      },
    },
  };
}

function upstreamError(status: number, body: Record<string, unknown>) {
  return new OpenAI.APIError(
    status,
    body,
    `raw upstream error containing ${testApiKey} and OPENAI_IMAGE_MODEL=${testModel}`,
    new Headers({ "x-request-id": "req_test_123" }),
  );
}

async function expectCategory(
  implementation: () => Promise<unknown>,
  category: ImageGenerationError["category"],
) {
  const calls = { count: 0 };
  await assert.rejects(
    generateImageFromCompiledPrompt(compiledPrompt, {
      apiKey: testApiKey,
      model: testModel,
      createClient: () => clientThat(implementation, calls),
    }),
    (error: unknown) => {
      assert.ok(error instanceof ImageGenerationError);
      assert.equal(error.category, category);
      assert.doesNotMatch(error.message, /sk-test-must-not-appear-in-output|private-test-image-model|OPENAI_IMAGE_MODEL/);
      assert.doesNotMatch(error.stack ?? "", /sk-test-must-not-appear-in-output|private-test-image-model|OPENAI_IMAGE_MODEL/);
      return true;
    },
  );
  // The generator owns no retry loop: exactly one mocked Images API request.
  assert.equal(calls.count, 1);
}

test("returns one temporary data URL from a valid mocked b64_json response", async () => {
  const calls = { count: 0, request: undefined as unknown };
  const generated = await generateImageFromCompiledPrompt(compiledPrompt, {
    apiKey: testApiKey,
    model: testModel,
    createClient: () => clientThat(async () => ({ data: [{ b64_json: "aGVsbG8=" }] }), calls),
    now: () => new Date("2026-07-24T12:00:00.000Z"),
  });

  assert.deepEqual(generated, {
    imageUrl: "data:image/png;base64,aGVsbG8=",
    model: testModel,
    createdAt: "2026-07-24T12:00:00.000Z",
  });
  assert.equal(calls.count, 1);
  assert.deepEqual(calls.request, {
    model: testModel,
    prompt: compiledPrompt,
    n: 1,
    size: "1024x1024",
    quality: "low",
    background: "opaque",
    output_format: "png",
  });
});

test("uses image editing only when visual reference uploads are present", async () => {
  const calls: Array<{
    method: "generate" | "edit";
    request: Record<string, unknown>;
  }> = [];
  const reference = { name: "reference-1.png" } as unknown as Uploadable;
  const client: ImageApiClient = {
    images: {
      async generate(request) {
        calls.push({
          method: "generate",
          request: request as unknown as Record<string, unknown>,
        });
        return { data: [{ b64_json: "aGVsbG8=" }] };
      },
      async edit(request) {
        calls.push({
          method: "edit",
          request: request as unknown as Record<string, unknown>,
        });
        return { data: [{ b64_json: "aGVsbG8=" }] };
      },
    },
  };

  await generateImageFromCompiledPrompt(compiledPrompt, {
    apiKey: testApiKey,
    model: testModel,
    createClient: () => client,
    referenceImages: [reference],
  });
  await generateImageFromCompiledPrompt(compiledPrompt, {
    apiKey: testApiKey,
    model: testModel,
    createClient: () => client,
  });

  assert.equal(calls[0].method, "edit");
  assert.deepEqual(calls[0].request.image, [reference]);
  assert.equal(calls[1].method, "generate");
  assert.equal("image" in calls[1].request, false);
});

test("uses a validated transparent background when the server requests it", async () => {
  const calls = { count: 0, request: undefined as unknown };
  await generateImageFromCompiledPrompt(compiledPrompt, {
    apiKey: testApiKey,
    model: testModel,
    createClient: () => clientThat(async () => ({ data: [{ b64_json: "aGVsbG8=" }] }), calls),
    background: "transparent",
  });

  assert.equal((calls.request as { background?: unknown }).background, "transparent");
});

test("classifies mocked upstream API failures safely and never retries", async (t) => {
  const cases: Array<{
    name: string;
    error: Error;
    category: ImageGenerationError["category"];
  }> = [
    {
      name: "authentication failure",
      error: upstreamError(401, { code: "invalid_api_key", type: "invalid_request_error" }),
      category: "authentication_error",
    },
    {
      name: "model access failure",
      error: upstreamError(403, { code: "model_access_denied", type: "insufficient_permissions" }),
      category: "permission_or_model_access",
    },
    {
      name: "model not found",
      error: upstreamError(404, { code: "model_not_found", type: "invalid_request_error" }),
      category: "model_not_found",
    },
    {
      name: "rate limit",
      error: upstreamError(429, { code: "rate_limit_exceeded", type: "rate_limit_exceeded" }),
      category: "rate_limit_exceeded",
    },
    {
      name: "quota exhaustion",
      error: upstreamError(429, { code: "insufficient_quota", type: "insufficient_quota" }),
      category: "insufficient_quota",
    },
    {
      name: "upstream 5xx",
      error: upstreamError(500, { code: "server_error", type: "server_error" }),
      category: "unknown_upstream_error",
    },
    {
      name: "timeout",
      error: new OpenAI.APIConnectionTimeoutError({ message: `raw ${testApiKey}` }),
      category: "timeout",
    },
  ];

  for (const errorCase of cases) {
    await t.test(errorCase.name, async () => {
      await expectCategory(async () => Promise.reject(errorCase.error), errorCase.category);
    });
  }
});

test("rejects malformed and unexpected image responses without exposing base64 data", async (t) => {
  const malformedResponses: Array<{ name: string; response: unknown }> = [
    { name: "missing b64_json", response: { data: [{}] } },
    { name: "empty b64_json", response: { data: [{ b64_json: "" }] } },
    { name: "malformed base64", response: { data: [{ b64_json: "not-valid-base64%%%" }] } },
    { name: "unexpected response shape", response: { image: "not-an-images-response" } },
    { name: "missing response", response: undefined },
  ];

  for (const malformed of malformedResponses) {
    await t.test(malformed.name, async () => {
      const calls = { count: 0 };
      await assert.rejects(
        generateImageFromCompiledPrompt(compiledPrompt, {
          apiKey: testApiKey,
          model: testModel,
          createClient: () => clientThat(async () => malformed.response, calls),
        }),
        (error: unknown) => {
          assert.ok(error instanceof ImageGenerationError);
          assert.equal(error.category, "unknown_upstream_error");
          assert.doesNotMatch(error.message, /not-valid-base64|sk-test-must-not-appear-in-output/);
          return true;
        },
      );
      assert.equal(calls.count, 1);
    });
  }
});

test("does not create a client when image credentials or model configuration are absent", async () => {
  let factoryCalls = 0;
  await assert.rejects(
    generateImageFromCompiledPrompt(compiledPrompt, {
      apiKey: undefined,
      model: testModel,
      createClient: () => {
        factoryCalls += 1;
        throw new Error("should not create client");
      },
    }),
    (error: unknown) => error instanceof ImageGenerationError && error.category === "not_configured",
  );
  assert.equal(factoryCalls, 0);
});
