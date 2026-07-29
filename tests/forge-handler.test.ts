import assert from "node:assert/strict";
import test from "node:test";
import { createForgeHandler } from "../src/lib/forge-handler";
import {
  MAX_FORGE_PROMPT_LENGTH,
  MAX_FORGE_REFERENCE_BYTES,
  type ForgeReferenceImage,
} from "../src/lib/forge-request";
import type { GeneratedImage } from "../src/lib/image-generation-core";

const generatedImage: GeneratedImage = {
  imageUrl: "data:image/png;base64,aGVsbG8=",
  model: "mock-image-model",
  createdAt: "2026-07-28T12:00:00.000Z",
};

const pngSignature = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function validForm() {
  const formData = new FormData();
  formData.set("assetType", "CHARACTER");
  formData.set("visualStyle", "PIXEL_ART");
  formData.set("viewAngle", "FRONT");
  return formData;
}

function requestFor(formData: FormData) {
  return new Request("http://localhost/api/forge", {
    method: "POST",
    body: formData,
  });
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

test("accepts the three required selections and returns only the generated image", async () => {
  const calls: Array<{
    prompt: string;
    referenceImage: ForgeReferenceImage | null;
  }> = [];
  const handler = createForgeHandler({
    generateForgeImage: async (prompt, referenceImage) => {
      calls.push({ prompt, referenceImage });
      return generatedImage;
    },
  });
  const formData = validForm();
  formData.set("prompt", "A tiny moss knight");

  const response = await handler(requestFor(formData));

  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { image: generatedImage });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].referenceImage, null);
  assert.match(calls[0].prompt, /Additional creative direction: A tiny moss knight/);
  assert.doesNotMatch(JSON.stringify(await Promise.resolve(calls)), /OPENAI_API_KEY/);
});

test("validates and forwards a real PNG reference image", async () => {
  const receivedReferences: Array<ForgeReferenceImage | null> = [];
  const handler = createForgeHandler({
    generateForgeImage: async (_prompt, referenceImage) => {
      receivedReferences.push(referenceImage);
      return generatedImage;
    },
  });
  const formData = validForm();
  formData.set(
    "referenceImage",
    new File([pngSignature], "hero.png", { type: "image/png" }),
  );

  const response = await handler(requestFor(formData));

  assert.equal(response.status, 200);
  assert.equal(receivedReferences.length, 1);
  const receivedReference = receivedReferences[0];
  assert.ok(receivedReference);
  assert.equal(receivedReference.mimeType, "image/png");
  assert.deepEqual(new Uint8Array(receivedReference.bytes), pngSignature);
});

test("rejects malformed multipart requests before generation", async (t) => {
  const invalidRequests: Array<{
    name: string;
    request: Request;
    status: number;
    message: RegExp;
  }> = [];

  invalidRequests.push({
    name: "JSON body",
    request: new Request("http://localhost/api/forge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    status: 415,
    message: /multipart form data/,
  });
  invalidRequests.push({
    name: "missing multipart boundary",
    request: new Request("http://localhost/api/forge", {
      method: "POST",
      headers: { "content-type": "multipart/form-data" },
      body: "not multipart",
    }),
    status: 400,
    message: /could not be read/,
  });

  const missingField = validForm();
  missingField.delete("viewAngle");
  invalidRequests.push({
    name: "missing required selection",
    request: requestFor(missingField),
    status: 400,
    message: /viewAngle/,
  });

  const duplicateField = validForm();
  duplicateField.append("assetType", "ITEM");
  invalidRequests.push({
    name: "duplicate required selection",
    request: requestFor(duplicateField),
    status: 400,
    message: /assetType/,
  });

  const unknownField = validForm();
  unknownField.set("model", "browser-controlled-model");
  invalidRequests.push({
    name: "unsupported field",
    request: requestFor(unknownField),
    status: 400,
    message: /unsupported field/,
  });

  for (const invalid of invalidRequests) {
    await t.test(invalid.name, async () => {
      let generationCalls = 0;
      const handler = createForgeHandler({
        generateForgeImage: async () => {
          generationCalls += 1;
          return generatedImage;
        },
      });
      const response = await handler(invalid.request);
      const body = await responseBody(response);
      assert.equal(response.status, invalid.status);
      assert.match(body.error as string, invalid.message);
      assert.equal(generationCalls, 0);
    });
  }
});

test("rejects invalid enums and an overlong prompt", async (t) => {
  const cases = [
    { field: "assetType", value: "SPRITE_SHEET", message: /asset type/ },
    { field: "visualStyle", value: "PHOTOREAL", message: /visual style/ },
    { field: "viewAngle", value: "THREE_QUARTER", message: /view angle/ },
    {
      field: "prompt",
      value: "x".repeat(MAX_FORGE_PROMPT_LENGTH + 1),
      message: /280 characters/,
    },
  ];

  for (const invalid of cases) {
    await t.test(invalid.field, async () => {
      const formData = validForm();
      formData.set(invalid.field, invalid.value);
      let generationCalls = 0;
      const response = await createForgeHandler({
        generateForgeImage: async () => {
          generationCalls += 1;
          return generatedImage;
        },
      })(requestFor(formData));

      assert.equal(response.status, 400);
      assert.match((await responseBody(response)).error as string, invalid.message);
      assert.equal(generationCalls, 0);
    });
  }
});

test("rejects unsupported, spoofed, empty, duplicate, and oversized reference images", async (t) => {
  const cases: Array<{
    name: string;
    addImage: (formData: FormData) => void;
    status: number;
    message: RegExp;
  }> = [
    {
      name: "unsupported MIME",
      addImage(formData) {
        formData.set(
          "referenceImage",
          new File(["GIF89a"], "asset.gif", { type: "image/gif" }),
        );
      },
      status: 415,
      message: /PNG, JPEG, or WebP/,
    },
    {
      name: "spoofed MIME",
      addImage(formData) {
        formData.set(
          "referenceImage",
          new File(["not a png"], "asset.png", { type: "image/png" }),
        );
      },
      status: 400,
      message: /does not appear to be a valid/,
    },
    {
      name: "empty image",
      addImage(formData) {
        formData.set(
          "referenceImage",
          new File([], "asset.png", { type: "image/png" }),
        );
      },
      status: 400,
      message: /empty/,
    },
    {
      name: "duplicate images",
      addImage(formData) {
        formData.append(
          "referenceImage",
          new File([pngSignature], "one.png", { type: "image/png" }),
        );
        formData.append(
          "referenceImage",
          new File([pngSignature], "two.png", { type: "image/png" }),
        );
      },
      status: 400,
      message: /at most one/,
    },
    {
      name: "oversized image",
      addImage(formData) {
        const bytes = new Uint8Array(MAX_FORGE_REFERENCE_BYTES + 1);
        bytes.set(pngSignature);
        formData.set(
          "referenceImage",
          new File([bytes], "huge.png", { type: "image/png" }),
        );
      },
      status: 413,
      message: /10 MB or smaller/,
    },
  ];

  for (const invalid of cases) {
    await t.test(invalid.name, async () => {
      const formData = validForm();
      invalid.addImage(formData);
      let generationCalls = 0;
      const response = await createForgeHandler({
        generateForgeImage: async () => {
          generationCalls += 1;
          return generatedImage;
        },
      })(requestFor(formData));

      assert.equal(response.status, invalid.status);
      assert.match((await responseBody(response)).error as string, invalid.message);
      assert.equal(generationCalls, 0);
    });
  }
});

test("returns safe friendly image-generation errors without logging raw data", async () => {
  const logs: Array<Record<string, unknown>> = [];
  const handler = createForgeHandler({
    generateForgeImage: async () => {
      throw new Error(
        "provider failure containing sk-secret, OPENAI_IMAGE_MODEL=gpt-private, and base64 aGVsbG8=",
      );
    },
    logError: (_message, details) => logs.push(details),
  });

  const response = await handler(requestFor(validForm()));
  const body = await responseBody(response);

  assert.equal(response.status, 502);
  assert.deepEqual(body, {
    error: "The forge cooled down before finishing. Please try again.",
    category: "unknown_upstream_error",
  });
  assert.doesNotMatch(
    JSON.stringify({ body, logs }),
    /sk-secret|OPENAI_IMAGE_MODEL|gpt-private|aGVsbG8=/,
  );
});
