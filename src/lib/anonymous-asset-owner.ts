import { createHash, randomBytes } from "node:crypto";

export const ANONYMOUS_ASSET_OWNER_COOKIE = "atlas_asset_owner";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const OWNER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type AnonymousAssetOwnerOptions = Readonly<{
  createToken?: () => string;
  secureCookies: boolean;
}>;

export type AnonymousAssetOwner = Readonly<{
  ownerKey: string;
  setCookie: string | null;
}>;

export function getOrCreateAnonymousAssetOwner(
  request: Request,
  options: AnonymousAssetOwnerOptions,
): AnonymousAssetOwner {
  const existing = readCookie(
    request.headers.get("cookie"),
    ANONYMOUS_ASSET_OWNER_COOKIE,
  );
  if (existing && validOwnerToken(existing)) {
    return { ownerKey: fingerprintOwnerToken(existing), setCookie: null };
  }

  const token = options.createToken?.() ?? randomBytes(32).toString("base64url");
  if (!validOwnerToken(token)) {
    throw new Error("Anonymous asset owner token is invalid.");
  }
  return {
    ownerKey: fingerprintOwnerToken(token),
    setCookie: serializeOwnerCookie(token, options.secureCookies),
  };
}

export function anonymousAssetOwnerKeyFromToken(token: string | undefined) {
  return token && validOwnerToken(token)
    ? fingerprintOwnerToken(token)
    : null;
}

function fingerprintOwnerToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function validOwnerToken(value: string) {
  return OWNER_TOKEN_PATTERN.test(value);
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}

function serializeOwnerCookie(value: string, secure: boolean) {
  return [
    `${ANONYMOUS_ASSET_OWNER_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
