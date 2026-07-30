import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrivateBetaModal } from "../src/components/private-beta-modal";

test("the access prompt presents Atlas as an invitation-only beta", () => {
  const html = renderToStaticMarkup(
    React.createElement(PrivateBetaModal, {
      accessCode: "",
      error: null,
      isUnlocking: false,
      onAccessCodeChange: () => {},
      onCancel: () => {},
      onUnlock: () => {},
    }),
  );

  assert.match(html, /Private Beta/);
  assert.match(
    html,
    /Atlas is currently available to invited testers\. Enter your beta access code to unlock AI generation\./,
  );
  assert.match(html, /type="password"/);
  assert.match(html, /Access Code/);
  assert.match(html, />Unlock</);
  assert.match(html, />Cancel</);
  assert.doesNotMatch(html, /Enter Password/);
});
