import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the homepage leads with the working product and custom demonstrations", () => {
  const component = readFileSync(
    new URL("../src/components/forge-studio.tsx", import.meta.url),
    "utf8",
  );
  const page = readFileSync(
    new URL("../src/app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /return <ForgeStudio \/>/);
  assert.match(component, /Make game art/);
  assert.match(component, /Asset canvas/);
  assert.match(component, /Reference/);
  assert.match(component, /Drop or paste/);
  assert.match(component, /Properties/);
  assert.match(component, /Direct the rendering/);
  assert.match(component, /Camera stage/);
  assert.match(component, /Output tray/);
  assert.match(component, /Generate/);
  assert.match(component, /Download PNG/);
  assert.match(component, /Character/);
  assert.match(component, /Pixel/);
  assert.match(component, /2D Fantasy/);
  assert.match(component, /Isometric/);
  assert.doesNotMatch(component, /atlas-forge-hero\.webp/);

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
  assert.match(component, /body\.set\("assetType", assetType\)/);
  assert.match(component, /body\.set\("visualStyle", visualStyle\)/);
  assert.match(component, /body\.set\("viewAngle", viewAngle\)/);
  assert.match(component, /fetch\("\/api\/forge"/);
  assert.match(component, /aria-pressed=/);
  assert.match(component, /aria-busy=/);
  assert.match(component, /aria-live=/);
  assert.match(component, /role="alert"/);
  assert.doesNotMatch(component, /<select/);
  assert.doesNotMatch(component, /<textarea/);
});
