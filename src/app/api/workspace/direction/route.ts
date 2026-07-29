import {
  assertOnlyJsonFields,
  readWorkspaceJson,
  workspaceRouteError,
} from "@/app/api/workspace/_route-utils";
import { parseReferenceIds, WorkspaceInputError } from "@/lib/workspace-core";
import {
  buildAndSaveStyleSpec,
  saveArtDirectionDraft,
} from "@/lib/workspace-server";

export const runtime = "nodejs";

const DIRECTION_FIELDS = ["brief", "selectedReferenceIds"] as const;

function requireCompleteBrief(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspaceInputError("Complete the game brief before creating a StyleSpec.");
  }
  const brief = value as Record<string, unknown>;
  for (const field of [
    "description",
    "genre",
    "mood",
    "targetPlatform",
    "assetType",
  ]) {
    if (typeof brief[field] !== "string" || !brief[field].trim()) {
      throw new WorkspaceInputError(
        "Complete the game brief before creating a StyleSpec.",
      );
    }
  }
}

async function directionInput(request: Request, requireReferences: boolean) {
  const body = await readWorkspaceJson(request);
  assertOnlyJsonFields(body, DIRECTION_FIELDS);
  const selectedReferenceIds = parseReferenceIds(body.selectedReferenceIds);
  if (requireReferences) requireCompleteBrief(body.brief);
  if (requireReferences && selectedReferenceIds.length === 0) {
    throw new WorkspaceInputError(
      "Choose between 1 and 3 references before creating a StyleSpec.",
    );
  }
  return {
    brief: body.brief,
    referenceIds: selectedReferenceIds,
  };
}

export async function PATCH(request: Request) {
  try {
    const input = await directionInput(request, false);
    const saved = await saveArtDirectionDraft(input);
    return Response.json({
      brief: saved.brief,
      selectedReferenceIds: saved.referenceIds,
      currentStyleSpecId: saved.currentStyleSpecId,
      directionRevision: saved.directionRevision,
    });
  } catch (cause) {
    return workspaceRouteError(cause, "The art-direction draft could not be saved.");
  }
}

export async function POST(request: Request) {
  try {
    const input = await directionInput(request, true);
    const styleSpec = await buildAndSaveStyleSpec(input);
    return Response.json({ styleSpec }, { status: 201 });
  } catch (cause) {
    return workspaceRouteError(cause, "The StyleSpec could not be created.");
  }
}
