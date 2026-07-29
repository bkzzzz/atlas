import {
  readWorkspaceForm,
  workspaceRouteError,
} from "@/app/api/workspace/_route-utils";
import { createCustomReference } from "@/lib/workspace-server";
import { parseWorkspaceImage } from "@/lib/workspace-upload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await readWorkspaceForm(request, ["file", "width", "height"]);
    const image = await parseWorkspaceImage(form);
    const reference = await createCustomReference(image);
    return Response.json({ reference }, { status: 201 });
  } catch (cause) {
    return workspaceRouteError(cause, "The reference could not be added.");
  }
}
