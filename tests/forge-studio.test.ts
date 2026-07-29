import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the playtest homepage presents one focused Forge workflow", () => {
  const component = readFileSync(
    new URL("../src/components/forge-studio.tsx", import.meta.url),
    "utf8",
  );
  const page = readFileSync(
    new URL("../src/app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /return <ForgeStudio \/>/);
  assert.match(component, /Forge game art/);
  assert.match(component, /Reference/);
  assert.match(component, /Drop, paste, or browse/);
  assert.match(component, /What are we making/);
  assert.match(component, /Choose a look/);
  assert.match(component, /Add a detail/);
  assert.match(component, /Forge asset/);
  assert.match(component, /Character/);
  assert.match(component, /Pixel/);
  assert.match(component, /2D Fantasy/);
  assert.match(component, /Isometric/);
  assert.match(component, /atlas-forge-hero.webp/);

  assert.doesNotMatch(component, /Metadata preview/);
  assert.doesNotMatch(component, /Developer details/);
  assert.doesNotMatch(component, /Structured context/);
  assert.doesNotMatch(component, /Advanced controls/);
  assert.doesNotMatch(component, /Output format/);
  assert.doesNotMatch(component, /Experimental · unavailable/);
  assert.doesNotMatch(component, /Character memory/);
  assert.doesNotMatch(component, /API key|provider model|token usage/i);
});

test("the Forge form keeps only the intended required selectors", () => {
  const component = readFileSync(
    new URL("../src/components/forge-studio.tsx", import.meta.url),
    "utf8",
  );

  assert.match(component, /useState<AssetType>\("CHARACTER"\)/);
  assert.match(component, /useState<VisualStyle>\("PIXEL_ART"\)/);
  assert.match(component, /useState<ViewAngle>\("FRONT"\)/);
  assert.match(component, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(component, /maxLength=\{280\}/);
  assert.match(component, /PNG output · one asset per forge/);
  assert.doesNotMatch(component, /<select/);
  assert.doesNotMatch(component, /<textarea/);
});
