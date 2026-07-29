import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the homepage renders the real art-directed workspace instead of the Forge demo", () => {
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
  assert.match(component, /aria-label="Art direction"/);
  assert.match(component, /Editable canvas/);
  assert.match(component, /aria-label="Inspector"/);
  assert.match(component, /startInteraction\(event, item, "drag"\)/);
  assert.match(component, /startInteraction\(event, item, "resize", handle\)/);
  assert.match(component, /resizeRectFromCorner/);
  assert.match(component, /dragRectWithSnapping/);
  assert.match(component, /undoHistory/);
  assert.match(component, /redoHistory/);
  assert.match(component, /duplicateSelected/);
  assert.match(component, /\/api\/workspace\/assets/);
  assert.match(component, /\/api\/workspace\/generate/);
  assert.match(component, /\/api\/workspace\/direction/);
  assert.match(component, /\/api\/workspace\/references/);
  assert.match(component, /removeBorderConnectedBackground/);
  assert.match(component, /normalizedCropToPixels/);
  assert.match(component, /createWorkspaceExportPlan/);
  assert.match(component, /BRING_FORWARD/);
  assert.match(component, /SEND_BACKWARD/);
  assert.match(component, /type="color"/);
  assert.match(component, /aria-label="Opacity"/);
  assert.doesNotMatch(
    component,
    /AI asset panel|CREATE_RECTANGLE|Camera stage|Output tray|Direction lab|Download PNG/,
  );
});
