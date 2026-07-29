import {
  hasWorkspaceImageSignature,
  MAX_WORKSPACE_ASSET_BYTES,
  WORKSPACE_IMAGE_TYPES,
  WorkspaceInputError,
} from "@/lib/workspace-core";
import { createImageNode } from "@/lib/workspace-server";

export const runtime = "nodejs";

function dimension(value: FormDataEntryValue | null, name: string) {
  if (typeof value !== "string" || !/^\d{1,5}$/u.test(value)) {
    throw new WorkspaceInputError(`The image ${name} is invalid.`);
  }
  const parsed = Number(value);
  if (parsed < 1 || parsed > 16384) {
    throw new WorkspaceInputError(`The image ${name} is invalid.`);
  }
  return parsed;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!/^multipart\/form-data(?:;|$)/iu.test(contentType)) {
      throw new WorkspaceInputError("Send the asset as multipart form data.", 415);
    }
    const form = await request.formData();
    for (const key of form.keys()) {
      if (!["file", "width", "height"].includes(key)) {
        throw new WorkspaceInputError(`Unsupported upload field: ${key}.`);
      }
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new WorkspaceInputError("Choose a PNG, JPEG, or WebP image.");
    }
    if (file.size > MAX_WORKSPACE_ASSET_BYTES) {
      throw new WorkspaceInputError("Images must be 10 MB or smaller.", 413);
    }
    if (!(WORKSPACE_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      throw new WorkspaceInputError("Use a PNG, JPEG, or WebP image.", 415);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasWorkspaceImageSignature(bytes, file.type)) {
      throw new WorkspaceInputError("The selected file is not a valid image.");
    }
    const result = await createImageNode({
      name: file.name.trim().slice(0, 120) || "Imported asset",
      mimeType: file.type,
      bytes,
      width: dimension(form.get("width"), "width"),
      height: dimension(form.get("height"), "height"),
      source: "UPLOAD",
    });
    return Response.json({ node: result.node }, { status: 201 });
  } catch (cause) {
    if (cause instanceof WorkspaceInputError) {
      return Response.json({ error: cause.message }, { status: cause.status });
    }
    return Response.json({ error: "The asset could not be imported." }, { status: 500 });
  }
}
