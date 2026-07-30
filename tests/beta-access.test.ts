import assert from "node:assert/strict";
import test from "node:test";
import {
  createBetaAccessHandler,
  requireBetaAccess,
} from "../src/lib/beta-access-handler";

const accessCode = "atlas-beta-2026";

function postCode(code: string) {
  return new Request("https://atlas.example/api/beta-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

test("invalid beta access codes return only a failure", async () => {
  const handler = createBetaAccessHandler({
    accessCode,
    secureCookies: true,
  });

  const response = await handler.POST(postCode("wrong-code"));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    success: false,
    error: "Invalid beta access code.",
  });
  assert.equal(response.headers.get("set-cookie"), null);
});

test("valid codes set a persistent signed cookie without exposing the code", async () => {
  const handler = createBetaAccessHandler({
    accessCode,
    secureCookies: true,
  });

  const response = await handler.POST(postCode(accessCode));
  const setCookie = response.headers.get("set-cookie");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.ok(setCookie);
  assert.match(setCookie, /^atlas_beta_access=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\//i);
  assert.match(setCookie, /Max-Age=2592000/i);
  assert.doesNotMatch(setCookie, /atlas-beta-2026/);
});

test("the signed cookie persists access across requests and rejects tampering", async () => {
  const handler = createBetaAccessHandler({
    accessCode,
    secureCookies: true,
  });
  const unlock = await handler.POST(postCode(accessCode));
  const cookie = unlock.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);

  const persisted = await handler.GET(
    new Request("https://atlas.example/api/beta-access", {
      headers: { Cookie: cookie },
    }),
  );
  assert.deepEqual(await persisted.json(), { unlocked: true });

  const tampered = await handler.GET(
    new Request("https://atlas.example/api/beta-access", {
      headers: { Cookie: `${cookie}tampered` },
    }),
  );
  assert.deepEqual(await tampered.json(), { unlocked: false });
});

test("protected generation endpoints reject direct calls without beta access", async () => {
  let generationCalls = 0;
  const protectedHandler = requireBetaAccess(
    async () => {
      generationCalls += 1;
      return Response.json({ ok: true });
    },
    () => false,
  );

  const response = await protectedHandler(
    new Request("https://atlas.example/api/generate-image", {
      method: "POST",
    }),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "Private beta access is required.",
  });
  assert.equal(generationCalls, 0);
});

test("a persisted beta cookie reaches the protected generation handler", async () => {
  const access = createBetaAccessHandler({
    accessCode,
    secureCookies: true,
  });
  const unlock = await access.POST(postCode(accessCode));
  const cookie = unlock.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  let generationCalls = 0;
  const protectedHandler = requireBetaAccess(
    async () => {
      generationCalls += 1;
      return Response.json({ ok: true });
    },
    access.hasAccess,
  );

  const response = await protectedHandler(
    new Request("https://atlas.example/api/generate-image", {
      method: "POST",
      headers: { Cookie: cookie },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(generationCalls, 1);
});
