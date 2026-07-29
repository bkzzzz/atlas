import {
  parseWorkspaceNodePatch,
  WorkspaceInputError,
} from "@/lib/workspace-core";
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
    const patch = parseWorkspaceNodePatch(await request.json());
    const node = await updateWorkspaceNode(nodeId, patch);
    if (!node) {
      return Response.json({ error: "Layer not found." }, { status: 404 });
    }
    return Response.json({ node });
  } catch (cause) {
    if (cause instanceof WorkspaceInputError) {
      return Response.json({ error: cause.message }, { status: cause.status });
    }
    if (cause instanceof SyntaxError) {
      return Response.json({ error: "Send a valid JSON update." }, { status: 400 });
    }
    return Response.json({ error: "The layer could not be updated." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ nodeId: string }> },
) {
  const { nodeId } = await context.params;
  const deleted = await deleteWorkspaceNode(nodeId);
  if (!deleted) {
    return Response.json({ error: "Layer not found." }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
