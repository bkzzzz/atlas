import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { parseWorkspaceImage } from "../../src/lib/workspace-upload";

async function png(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 50, g: 100, b: 150, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

function imageForm(
  bytes: Uint8Array,
  width: number,
  height: number,
) {
  const form = new FormData();
  form.set(
    "file",
    new File([Buffer.from(bytes)], "asset.png", { type: "image/png" }),
  );
  form.set("width", String(width));
  form.set("height", String(height));
  return form;
}

test("decodes uploads and verifies their real format and dimensions", async () => {
  const bytes = await png(37, 23);
  const parsed = await parseWorkspaceImage(imageForm(bytes, 37, 23));
  assert.equal(parsed.mimeType, "image/png");
  assert.equal(parsed.pixelWidth, 37);
  assert.equal(parsed.pixelHeight, 23);
  assert.deepEqual(parsed.bytes, Uint8Array.from(bytes));

  await assert.rejects(
    () => parseWorkspaceImage(imageForm(bytes, 1, 1)),
    /do not match the decoded 37 × 23 image/,
  );
});

test("rejects duplicate dimensions and files that only spoof a signature", async () => {
  const bytes = await png(8, 8);
  const duplicateDimensions = imageForm(bytes, 8, 8);
  duplicateDimensions.append("width", "8");
  await assert.rejects(
    () => parseWorkspaceImage(duplicateDimensions),
    /exactly one width and height/,
  );

  const spoofed = imageForm(
    Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]),
    1,
    1,
  );
  await assert.rejects(
    () => parseWorkspaceImage(spoofed),
    /could not be safely decoded/,
  );
});
