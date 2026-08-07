import assert from "node:assert/strict";
import test from "node:test";
import {
  ANONYMOUS_ASSET_OWNER_COOKIE,
  anonymousAssetOwnerKeyFromToken,
  getOrCreateAnonymousAssetOwner,
} from "../src/lib/anonymous-asset-owner";

const ownerToken = "a".repeat(43);

test("creates a secure anonymous owner cookie only when one is missing", () => {
  const owner = getOrCreateAnonymousAssetOwner(
    new Request("https://atlas.example/api/parse"),
    { createToken: () => ownerToken, secureCookies: true },
  );

  assert.equal(owner.ownerKey, anonymousAssetOwnerKeyFromToken(ownerToken));
  assert.match(owner.setCookie ?? "", new RegExp(`^${ANONYMOUS_ASSET_OWNER_COOKIE}=`));
  assert.match(owner.setCookie ?? "", /HttpOnly/);
  assert.match(owner.setCookie ?? "", /SameSite=Lax/);
  assert.match(owner.setCookie ?? "", /Secure/);
});

test("reuses a valid owner cookie and rejects malformed workspace tokens", () => {
  const owner = getOrCreateAnonymousAssetOwner(
    new Request("https://atlas.example/api/parse", {
      headers: { Cookie: `${ANONYMOUS_ASSET_OWNER_COOKIE}=${ownerToken}` },
    }),
    { createToken: () => "b".repeat(43), secureCookies: true },
  );

  assert.equal(owner.ownerKey, anonymousAssetOwnerKeyFromToken(ownerToken));
  assert.equal(owner.setCookie, null);
  assert.equal(anonymousAssetOwnerKeyFromToken("tampered"), null);
});
