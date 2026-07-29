import path from "node:path";
import { createReferenceImageHandler } from "@/lib/reference-image-handler";
import { loadReferenceFamilyIndex } from "@/lib/reference-index-server";

const KENNEY_SOURCE_ROOT = path.resolve(
  "data/reference-source/Kenney",
);

export const GET = createReferenceImageHandler({
  sourceRoot: KENNEY_SOURCE_ROOT,
  loadFamilyIndex: loadReferenceFamilyIndex,
});
