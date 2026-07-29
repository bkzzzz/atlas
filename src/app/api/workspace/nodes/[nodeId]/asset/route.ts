import {
  readWorkspaceForm,
  requiredFormText,
  workspaceRouteError,
} from "@/app/api/workspace/_route-utils";
import {
  MAX_WORKSPACE_OPERATION_PARAMETERS_LENGTH,
  MIN_NODE_SIZE,
  parseWorkspaceOperationParameters,
  WORKSPACE_HEIGHT,
  WORKSPACE_WIDTH,
  WorkspaceInputError,
  type WorkspaceAssetOperation,
} from "@/lib/workspace-core";
import { replaceWorkspaceNodeAsset } from "@/lib/workspace-server";
import { parseWorkspaceImage } from "@/lib/workspace-upload";

export const runtime = "nodejs";

const OPERATIONS = [
  "REPLACE",
  "CROP",
  "REMOVE_SOLID_BACKGROUND",
] as const;

function operationValue(form: FormData): WorkspaceAssetOperation {
  const operation = requiredFormText(form, "operation", 40);
  if (!(OPERATIONS as readonly string[]).includes(operation)) {
    throw new WorkspaceInputError("Choose a supported image operation.");
  }
  return operation as WorkspaceAssetOperation;
}

function operationParametersValue(
  form: FormData,
  operation: WorkspaceAssetOperation,
) {
  const values = form.getAll("operationParameters");
  if (
    values.length !== 1 ||
    typeof values[0] !== "string" ||
    values[0].length > MAX_WORKSPACE_OPERATION_PARAMETERS_LENGTH
  ) {
    throw new WorkspaceInputError(
      `operationParameters must be one JSON object no longer than ${MAX_WORKSPACE_OPERATION_PARAMETERS_LENGTH} characters.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(values[0]);
  } catch {
    throw new WorkspaceInputError(
      "operationParameters must contain valid JSON.",
    );
  }
  return parseWorkspaceOperationParameters(operation, parsed);
}

function optionalDisplayDimension(
  form: FormData,
  field: "displayWidth" | "displayHeight",
) {
  const values = form.getAll(field);
  if (values.length === 0) return undefined;
  const maximum = field === "displayWidth" ? WORKSPACE_WIDTH : WORKSPACE_HEIGHT;
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new WorkspaceInputError(`${field} must be a valid canvas size.`);
  }
  const value = Number(values[0]);
  if (!Number.isFinite(value) || value < MIN_NODE_SIZE || value > maximum) {
    throw new WorkspaceInputError(
      `${field} must be between ${MIN_NODE_SIZE} and ${maximum}.`,
    );
  }
  return value;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ nodeId: string }> },
) {
  try {
    const { nodeId } = await context.params;
    const form = await readWorkspaceForm(request, [
      "file",
      "width",
      "height",
      "operation",
      "operationParameters",
      "displayWidth",
      "displayHeight",
    ]);
    const operation = operationValue(form);
    const operationParameters = operationParametersValue(form, operation);
    if (
      operation === "REMOVE_SOLID_BACKGROUND" &&
      process.env.NODE_ENV !== "development"
    ) {
      return Response.json(
        {
          error:
            "Solid-background removal is a development-only fallback and is not configured for production.",
        },
        { status: 501 },
      );
    }
    const image = await parseWorkspaceImage(form);
    const displayWidth = optionalDisplayDimension(form, "displayWidth");
    const displayHeight = optionalDisplayDimension(form, "displayHeight");
    if ((displayWidth === undefined) !== (displayHeight === undefined)) {
      throw new WorkspaceInputError(
        "Send both displayWidth and displayHeight, or omit both.",
      );
    }
    const node = await replaceWorkspaceNodeAsset({
      nodeId,
      ...image,
      operation,
      operationParameters,
      ...(displayWidth !== undefined && displayHeight !== undefined
        ? { displayWidth, displayHeight }
        : {}),
    });
    if (!node) {
      return Response.json({ error: "Image layer not found." }, { status: 404 });
    }
    return Response.json({ node });
  } catch (cause) {
    return workspaceRouteError(cause, "The image could not be replaced.");
  }
}
