import assert from "node:assert/strict";
import test from "node:test";
import {
  forgeBackgroundForModel,
  generateForgeImageFromPrompt,
  type ForgeImageApiClient,
} from "../src/lib/forge-image-core";
import { ImageGenerationError } from "../src/lib/image-generation-core";

const testApiKey = "sk-forge-test-secret";
const compiledPrompt = "trusted deterministic Forge prompt";

type ImageCalls = {
  generate: unknown[];
  edit: unknown[];
};

function mockClient(calls: ImageCalls): ForgeImageApiClient {
  return {
    images: {
      async generate(request) {
        calls.generate.push(request);
        return { data: [{ b64_json: "aGVsbG8=" }] };
      },
      async edit(request) {
        calls.edit.push(request);
        return { data: [{ b64_json: "d29ybGQ=" }] };
      },
    },
  };
}

test("uses images.generate once with fixed low-quality square PNG settings", async () => {
  const calls: ImageCalls = { generate: [], edit: [] };
  const image = await generateForgeImageFromPrompt(compiledPrompt, null, {
    apiKey: testApiKey,
    model: "gpt-image-1.5",
    createClient: () => mockClient(calls),
    now: () => new Date("2026-07-28T12:00:00.000Z"),
  });

  assert.deepEqual(image, {
    imageUrl: "data:image/png;base64,aGVsbG8=",
    model: "gpt-image-1.5",
    createdAt: "2026-07-28T12:00:00.000Z",
  });
  assert.equal(calls.generate.length, 1);
  assert.equal(calls.edit.length, 0);
  assert.deepEqual(calls.generate[0], {
    model: "gpt-image-1.5",
    prompt: compiledPrompt,
    n: 1,
    size: "1024x1024",
    quality: "low",
    background: "transparent",
    output_format: "png",
  });
});

test("passes a validated reference file through images.edit and never calls generate", async () => {
  const calls: ImageCalls = { generate: [], edit: [] };
  const referenceBytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  ]);

  const image = await generateForgeImageFromPrompt(
    compiledPrompt,
    {
      bytes: referenceBytes.buffer,
      mimeType: "image/webp",
    },
    {
      apiKey: testApiKey,
      model: "gpt-image-2",
      createClient: () => mockClient(calls),
    },
  );

  assert.equal(image.imageUrl, "data:image/png;base64,d29ybGQ=");
  assert.equal(calls.generate.length, 0);
  assert.equal(calls.edit.length, 1);

  const editRequest = calls.edit[0] as Record<string, unknown>;
  assert.equal(editRequest.model, "gpt-image-2");
  assert.equal(editRequest.prompt, compiledPrompt);
  assert.equal(editRequest.n, 1);
  assert.equal(editRequest.size, "1024x1024");
  assert.equal(editRequest.quality, "low");
  assert.equal(editRequest.background, "opaque");
  assert.equal(editRequest.output_format, "png");
  assert.ok(editRequest.image instanceof File);
  assert.equal(editRequest.image.name, "reference.webp");
  assert.equal(editRequest.image.type, "image/webp");
  assert.deepEqual(
    new Uint8Array(await editRequest.image.arrayBuffer()),
    referenceBytes,
  );
});

test("uses an opaque background for all gpt-image-2 model IDs", () => {
  assert.equal(forgeBackgroundForModel("gpt-image-2"), "opaque");
  assert.equal(forgeBackgroundForModel("gpt-image-2-2026-04-21"), "opaque");
  assert.equal(forgeBackgroundForModel("gpt-image-2-future"), "opaque");
  assert.equal(forgeBackgroundForModel("gpt-image-1.5"), "transparent");
});

test("does not create a client without server-side image configuration", async () => {
  let clientCalls = 0;
  await assert.rejects(
    generateForgeImageFromPrompt(compiledPrompt, null, {
      apiKey: "",
      model: "gpt-image-2",
      createClient: () => {
        clientCalls += 1;
        throw new Error("must not run");
      },
    }),
    (error: unknown) =>
      error instanceof ImageGenerationError &&
      error.category === "not_configured",
  );
  assert.equal(clientCalls, 0);
});

test("rejects malformed provider responses with a safe classified error", async () => {
  const client: ForgeImageApiClient = {
    images: {
      async generate() {
        return { data: [{ b64_json: `invalid-${testApiKey}` }] };
      },
      async edit() {
        throw new Error("unused");
      },
    },
  };

  await assert.rejects(
    generateForgeImageFromPrompt(compiledPrompt, null, {
      apiKey: testApiKey,
      model: "gpt-image-2",
      createClient: () => client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ImageGenerationError);
      assert.equal(error.category, "unknown_upstream_error");
      assert.doesNotMatch(error.message, /sk-forge-test-secret|invalid-/);
      return true;
    },
  );
});
