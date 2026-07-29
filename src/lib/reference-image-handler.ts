import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { ReferenceFamilyIndex } from "@/lib/reference-family";

const CACHE_CONTROL =
  "public, max-age=3600, stale-while-revalidate=86400";
const MAX_REFERENCE_IMAGE_BYTES = 25_000_000;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

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
      const approvedPath = lexicallyContainedPng(
        dependencies.sourceRoot,
        family.representativeImagePath,
      );
      const [realRoot, realCandidate] = await Promise.all([
        realpath(path.resolve(dependencies.sourceRoot)),
        realpath(approvedPath),
      ]);
      ensureContained(realRoot, realCandidate);
      const info = await stat(realCandidate);
      if (!info.isFile() || info.size > MAX_REFERENCE_IMAGE_BYTES) {
        throw new Error("Invalid reference image.");
      }
      const bytes = await readFile(
        realCandidate,
      );
      if (
        bytes.length < PNG_SIGNATURE.length ||
        PNG_SIGNATURE.some((value, index) => bytes[index] !== value)
      ) {
        throw new Error("Invalid PNG signature.");
      }
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

function lexicallyContainedPng(sourceRoot: string, relativePath: string) {
  if (
    !relativePath ||
    relativePath.includes("\0") ||
    relativePath.includes("\\") ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    path.posix.extname(relativePath).toLocaleLowerCase("en-US") !== ".png"
  ) {
    throw new Error("Unsafe reference path.");
  }
  const segments = relativePath.split("/");
  if (
    segments.some(
      (segment) => !segment || segment === "." || segment === "..",
    )
  ) {
    throw new Error("Unsafe reference path.");
  }

  const root = path.resolve(sourceRoot);
  const candidate = path.resolve(root, ...segments);
  ensureContained(root, candidate);
  return candidate;
}

function ensureContained(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Unsafe reference path.");
  }
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
