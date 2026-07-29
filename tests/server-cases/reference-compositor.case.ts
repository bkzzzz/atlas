import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  composeReferenceImages,
  REFERENCE_COMPOSITE_SIZE,
} from "../../src/lib/reference-compositor";

async function solidPng(red: number, green: number, blue: number) {
  return Uint8Array.from(
    await sharp({
      create: {
        width: 80,
        height: 80,
        channels: 3,
        background: { r: red, g: green, b: blue },
      },
    })
      .png()
      .toBuffer(),
  );
}

function pixelAt(
  data: Buffer,
  channels: number,
  x: number,
  y: number,
) {
  const offset = (y * REFERENCE_COMPOSITE_SIZE + x) * channels;
  return [...data.subarray(offset, offset + 3)];
}

test("composes all references left-to-right into one deterministic PNG", async () => {
  const references = await Promise.all([
    solidPng(240, 20, 20),
    solidPng(20, 230, 20),
    solidPng(20, 20, 220),
  ]);
  const first = await composeReferenceImages(references);
  const second = await composeReferenceImages(references);
  assert.deepEqual(first, second);

  const image = sharp(first);
  const metadata = await image.metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, REFERENCE_COMPOSITE_SIZE);
  assert.equal(metadata.height, REFERENCE_COMPOSITE_SIZE);

  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.deepEqual(pixelAt(data, info.channels, 177, 512), [240, 20, 20]);
  assert.deepEqual(pixelAt(data, info.channels, 511, 512), [20, 230, 20]);
  assert.deepEqual(pixelAt(data, info.channels, 846, 512), [20, 20, 220]);
});

test("rejects missing and excessive reference inputs", async () => {
  await assert.rejects(() => composeReferenceImages([]), /between 1 and 3/);
  const image = await solidPng(0, 0, 0);
  await assert.rejects(
    () => composeReferenceImages([image, image, image, image]),
    /between 1 and 3/,
  );
});
