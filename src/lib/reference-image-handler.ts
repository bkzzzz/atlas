import type { ReferenceFamilyIndex } from "@/lib/reference-family";
import { readValidatedReferencePng } from "@/lib/reference-image-inputs";

const CACHE_CONTROL =
  "public, max-age=3600, stale-while-revalidate=86400";

export type ReferenceImageHandlerDependencies = Readonly<{
  sourceRoot: string;
  loadFamilyIndex: () => Promise<ReferenceFamilyIndex>;
}>;

export function createReferenceImageHandler(
  dependencies: ReferenceImageHandlerDependencies,
) {
  return async function getReferenceImage(request: Request) {
    const id = requestedFamilyId(request);
    if (!id) {
      return Response.json(
        { error: "A valid reference family ID is required." },
        { status: 400 },
      );
    }

    let index: ReferenceFamilyIndex;
    try {
      index = await dependencies.loadFamilyIndex();
    } catch {
      return Response.json(
        { error: "Reference previews are unavailable." },
        { status: 503 },
      );
    }
    const family = index.families.find((item) => item.id === id);
    if (!family) {
      return Response.json(
        { error: "Reference preview not found." },
        { status: 404 },
      );
    }

    try {
      const bytes = await readValidatedReferencePng(
        dependencies.sourceRoot,
        family.representativeImagePath,
      );
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Cache-Control": CACHE_CONTROL,
          "Content-Length": String(bytes.length),
          "Content-Type": "image/png",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return Response.json(
        { error: "Reference preview not found." },
        { status: 404 },
      );
    }
  };
}

function requestedFamilyId(request: Request) {
  const parameters = new URL(request.url).searchParams;
  if (
    [...parameters.keys()].some((key) => key !== "id") ||
    parameters.getAll("id").length !== 1
  ) {
    return null;
  }
  const id = parameters.get("id");
  return id && /^kenney-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) && id.length <= 200
    ? id
    : null;
}
