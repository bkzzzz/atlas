import { createRectangleNode, readWorkspace } from "@/lib/workspace-server";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(await readWorkspace());
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid workspace action." }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    (body as { action?: unknown }).action !== "CREATE_RECTANGLE"
  ) {
    return Response.json({ error: "Choose a supported workspace action." }, { status: 400 });
  }

  return Response.json({ node: await createRectangleNode() }, { status: 201 });
}
