import {
  assertOnlyJsonFields,
  readWorkspaceJson,
  workspaceRouteError,
} from "@/app/api/workspace/_route-utils";
import { parseWorkspaceNodeSnapshots } from "@/lib/workspace-core";
import { syncWorkspaceNodes } from "@/lib/workspace-server";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    const body = await readWorkspaceJson(request);
    assertOnlyJsonFields(body, ["nodes"]);
    const snapshots = parseWorkspaceNodeSnapshots(body.nodes);
    const nodes = await syncWorkspaceNodes(snapshots);
    return Response.json({ nodes });
  } catch (cause) {
    return workspaceRouteError(cause, "Workspace history could not be restored.");
  }
}
