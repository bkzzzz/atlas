import {
  readWorkspaceJson,
  workspaceRouteError,
} from "@/app/api/workspace/_route-utils";
import { parseWorkspaceNodePatch } from "@/lib/workspace-core";
import {
  deleteWorkspaceNode,
  updateWorkspaceNode,
} from "@/lib/workspace-server";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ nodeId: string }> },
) {
  try {
    const { nodeId } = await context.params;
    const patch = parseWorkspaceNodePatch(await readWorkspaceJson(request));
    const node = await updateWorkspaceNode(nodeId, patch);
    if (!node) {
      return Response.json({ error: "Layer not found." }, { status: 404 });
    }
    return Response.json({ node });
  } catch (cause) {
    return workspaceRouteError(cause, "The layer could not be updated.", {
      syntaxMessage: "Send a valid JSON update.",
    });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ nodeId: string }> },
) {
  try {
    const { nodeId } = await context.params;
    const deleted = await deleteWorkspaceNode(nodeId);
    if (!deleted) {
      return Response.json({ error: "Layer not found." }, { status: 404 });
    }
    return new Response(null, { status: 204 });
  } catch (cause) {
    return workspaceRouteError(cause, "The layer could not be deleted.");
  }
}
