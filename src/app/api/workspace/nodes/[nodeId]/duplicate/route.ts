import { workspaceRouteError } from "@/app/api/workspace/_route-utils";
import { duplicateWorkspaceNode } from "@/lib/workspace-server";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ nodeId: string }> },
) {
  try {
    const { nodeId } = await context.params;
    const node = await duplicateWorkspaceNode(nodeId);
    if (!node) {
      return Response.json({ error: "Layer not found." }, { status: 404 });
    }
    return Response.json({ node }, { status: 201 });
  } catch (cause) {
    return workspaceRouteError(cause, "The layer could not be duplicated.");
  }
}
