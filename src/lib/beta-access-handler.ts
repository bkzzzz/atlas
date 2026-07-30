import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export const BETA_ACCESS_COOKIE = "atlas_beta_access";
const COOKIE_PAYLOAD = "atlas-private-beta-access";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type BetaAccessOptions = Readonly<{
  accessCode?: string;
  secureCookies: boolean;
}>;

export function createBetaAccessHandler(options: BetaAccessOptions) {
  const accessCode = options.accessCode?.trim() ?? "";
  const expectedCookie = accessCode
    ? signedCookieValue(accessCode)
    : "";

  function hasAccess(request: Request) {
    if (!expectedCookie) return false;
    const received = readCookie(
      request.headers.get("cookie"),
      BETA_ACCESS_COOKIE,
    );
    return safeEqual(received, expectedCookie);
  }

  return {
    async GET(request: Request) {
      return Response.json(
        { unlocked: hasAccess(request) },
        { headers: { "Cache-Control": "no-store" } },
      );
    },
    async POST(request: Request) {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return invalidCodeResponse();
      }
      const code =
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as { code?: unknown }).code
          : undefined;
      if (
        !accessCode ||
        typeof code !== "string" ||
        !safeCodeEqual(code, accessCode)
      ) {
        return invalidCodeResponse();
      }
      const response = Response.json({ success: true });
      response.headers.append(
        "Set-Cookie",
        serializeAccessCookie(expectedCookie, options.secureCookies),
      );
      return response;
    },
    hasAccess,
  };
}

type RouteHandler<Args extends unknown[]> = (
  request: Request,
  ...args: Args
) => Response | Promise<Response>;

export function requireBetaAccess<Args extends unknown[]>(
  handler: RouteHandler<Args>,
  hasAccess: (request: Request) => boolean | Promise<boolean>,
): RouteHandler<Args> {
  return async (request, ...args) => {
    if (!(await hasAccess(request))) {
      return Response.json(
        { error: "Private beta access is required." },
        { status: 403 },
      );
    }
    return handler(request, ...args);
  };
}

function invalidCodeResponse() {
  return Response.json(
    {
      success: false,
      error: "Invalid beta access code.",
    },
    { status: 403 },
  );
}

function safeCodeEqual(candidate: string, expected: string) {
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

function signedCookieValue(accessCode: string) {
  const signature = createHmac(
    "sha256",
    `atlas-beta-cookie:${accessCode}`,
  )
    .update(COOKIE_PAYLOAD)
    .digest("base64url");
  return `v1.${signature}`;
}

function safeEqual(candidate: string | null, expected: string) {
  if (!candidate) return false;
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return (
    candidateBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(candidateBytes, expectedBytes)
  );
}

function readCookie(
  cookieHeader: string | null,
  name: string,
) {
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

function serializeAccessCookie(value: string, secure: boolean) {
  return [
    `${BETA_ACCESS_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
