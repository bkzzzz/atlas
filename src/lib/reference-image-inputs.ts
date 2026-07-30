import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { toFile, type Uploadable } from "openai";
import type { ReferenceFamilyIndex } from "@/lib/reference-family";

const MAX_REFERENCE_IMAGE_BYTES = 25_000_000;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ResolvedReferenceImageInput = Readonly<{
  id: string;
  title: string;
  bytes: Buffer;
}>;

export type ReferenceImageInputResolverDependencies = Readonly<{
  sourceRoot: string;
  loadFamilyIndex: () => Promise<ReferenceFamilyIndex>;
}>;

export class ReferenceImageInputError extends Error {
  constructor() {
    super("One or more selected visual references are unavailable.");
  }
}

export async function createReferenceImageUploads(
  inputs: readonly ResolvedReferenceImageInput[],
  convertToFile: typeof toFile = toFile,
): Promise<readonly Uploadable[]> {
  return Promise.all(
    inputs.map(({ bytes }, index) =>
      convertToFile(bytes, `reference-${index + 1}.png`, {
        type: "image/png",
      }),
    ),
  );
}

export function createReferenceImageInputResolver(
  dependencies: ReferenceImageInputResolverDependencies,
) {
  return async function resolveReferenceImageInputs(
    referenceFamilyIds: readonly string[],
  ): Promise<readonly ResolvedReferenceImageInput[]> {
    if (
      referenceFamilyIds.length < 1 ||
      referenceFamilyIds.length > 3 ||
      referenceFamilyIds.some((id) => !id.trim()) ||
      new Set(referenceFamilyIds).size !== referenceFamilyIds.length
    ) {
      throw new ReferenceImageInputError();
    }

    try {
      const index = await dependencies.loadFamilyIndex();
      const families = new Map(
        index.families.map((family) => [family.id, family]),
      );
      return await Promise.all(
        referenceFamilyIds.map(async (id) => {
          const family = families.get(id);
          if (!family) throw new ReferenceImageInputError();
          return Object.freeze({
            id,
            title: family.title,
            bytes: await readValidatedReferencePng(
              dependencies.sourceRoot,
              family.representativeImagePath,
            ),
          });
        }),
      );
    } catch {
      throw new ReferenceImageInputError();
    }
  };
}

export async function readValidatedReferencePng(
  sourceRoot: string,
  relativePath: string,
) {
  const approvedPath = lexicallyContainedPng(sourceRoot, relativePath);
  const [realRoot, realCandidate] = await Promise.all([
    realpath(path.resolve(sourceRoot)),
    realpath(approvedPath),
  ]);
  ensureContained(realRoot, realCandidate);
  const info = await stat(realCandidate);
  if (!info.isFile() || info.size > MAX_REFERENCE_IMAGE_BYTES) {
    throw new Error("Invalid reference image.");
  }
  const bytes = await readFile(realCandidate);
  if (
    bytes.length > MAX_REFERENCE_IMAGE_BYTES ||
    bytes.length < PNG_SIGNATURE.length ||
    PNG_SIGNATURE.some((value, index) => bytes[index] !== value)
  ) {
    throw new Error("Invalid reference image.");
  }
  return bytes;
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
