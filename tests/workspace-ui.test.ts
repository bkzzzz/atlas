import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the homepage renders the persisted workspace instead of the Forge demo", () => {
  const page = readFileSync(
    new URL("../src/app/page.tsx", import.meta.url),
    "utf8",
  );
  const component = readFileSync(
    new URL("../src/components/workspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /readWorkspace/);
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /<Workspace initialWorkspace=/);
  assert.match(component, /AI asset panel/);
  assert.match(component, /Editable canvas/);
  assert.match(component, /aria-label="Inspector"/);
  assert.match(component, /startInteraction\(event, item, "drag"\)/);
  assert.match(component, /startInteraction\(event, item, "resize", handle\)/);
  assert.match(component, /CREATE_RECTANGLE/);
  assert.match(component, /\/api\/workspace\/assets/);
  assert.match(component, /\/api\/workspace\/generate/);
  assert.match(component, /BRING_TO_FRONT/);
  assert.match(component, /SEND_TO_BACK/);
  assert.match(component, /type="color"/);
  assert.match(component, /aria-label="Opacity"/);
  assert.doesNotMatch(component, /Camera stage|Output tray|Direction lab|Download PNG/);
});
