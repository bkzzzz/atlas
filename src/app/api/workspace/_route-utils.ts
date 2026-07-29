import { ArtDirectionInputError } from "@/lib/art-direction-core";
import { WorkspaceInputError } from "@/lib/workspace-core";

const KNOWN_SERVER_INPUT_ERRORS = [
  /^A game brief is required\.$/u,
  /^(?:description|genre|mood|targetPlatform|assetType) must be \d+ characters or fewer\.$/u,
  /^One or more selected references are unavailable\.$/u,
  /^The selected StyleSpec no longer exists\.$/u,
  /^One or more reference sources no longer exist\.$/u,
  /^History references an asset that no longer exists\.$/u,
];

export async function readWorkspaceJson(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:;|$)/iu.test(contentType)) {
    throw new WorkspaceInputError("Send the request as JSON.", 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new WorkspaceInputError("Send a valid JSON request.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new WorkspaceInputError("Send a JSON object.");
  }
  return body as Record<string, unknown>;
}

export async function readWorkspaceForm(
  request: Request,
  allowedFields: readonly string[],
) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data(?:;|$)/iu.test(contentType)) {
    throw new WorkspaceInputError(
      "Send the request as multipart form data.",
      415,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new WorkspaceInputError("The uploaded form could not be read.");
  }
  const allowed = new Set(allowedFields);
  for (const key of form.keys()) {
    if (!allowed.has(key)) {
      throw new WorkspaceInputError(`Unsupported form field: ${key}.`);
    }
  }
  return form;
}

export function assertOnlyJsonFields(
  body: Record<string, unknown>,
  allowedFields: readonly string[],
) {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) {
      throw new WorkspaceInputError(`Unsupported JSON field: ${key}.`);
    }
  }
}

export function requiredFormText(
  form: FormData,
  field: string,
  maximum: number,
) {
  const values = form.getAll(field);
  if (
    values.length !== 1 ||
    typeof values[0] !== "string" ||
    !values[0].trim() ||
    values[0].trim().length > maximum
  ) {
    throw new WorkspaceInputError(
      `${field} must be between 1 and ${maximum} characters.`,
    );
  }
  return values[0].trim();
}

export function optionalFormText(
  form: FormData,
  field: string,
  maximum: number,
) {
  const values = form.getAll(field);
  if (values.length === 0) return null;
  if (
    values.length !== 1 ||
    typeof values[0] !== "string" ||
    values[0].trim().length > maximum
  ) {
    throw new WorkspaceInputError(
      `${field} must be ${maximum} characters or fewer.`,
    );
  }
  return values[0].trim() || null;
}

export function workspaceRouteError(
  cause: unknown,
  fallback: string,
  options: { syntaxMessage?: string } = {},
) {
  if (
    cause instanceof WorkspaceInputError ||
    cause instanceof ArtDirectionInputError
  ) {
    return Response.json(
      { error: cause.message },
      {
        status:
          cause instanceof WorkspaceInputError
            ? cause.status
            : 400,
      },
    );
  }
  if (cause instanceof SyntaxError) {
    return Response.json(
      { error: options.syntaxMessage ?? "Send a valid request." },
      { status: 400 },
    );
  }
  if (
    cause instanceof Error &&
    KNOWN_SERVER_INPUT_ERRORS.some((pattern) => pattern.test(cause.message))
  ) {
    return Response.json({ error: cause.message }, { status: 400 });
  }
  return Response.json({ error: fallback }, { status: 500 });
}
