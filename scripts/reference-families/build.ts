import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildReferenceFamilyIndex,
  MAX_REFERENCE_FAMILIES,
  measureReferenceRepresentatives,
  SELECTED_PACKS,
} from "./family-builder";

const SOURCE_ROOT = path.resolve("data/reference-source/Kenney");
const OUTPUT_PATH = path.resolve(
  "data/reference-index/reference-families.json",
);

async function main() {
  const index = await buildReferenceFamilyIndex(SOURCE_ROOT);
  if (index.families.length > MAX_REFERENCE_FAMILIES) {
    throw new Error(
      `Refusing to write ${index.families.length} reference families; maximum is ${MAX_REFERENCE_FAMILIES}.`,
    );
  }
  const representatives = await measureReferenceRepresentatives(
    SOURCE_ROOT,
    index.families,
  );
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  const contents = `${JSON.stringify(index, null, 2)}\n`;
  await writeFile(OUTPUT_PATH, contents, "utf8");
  process.stdout.write(
    [
      `Selected packs: ${SELECTED_PACKS.length}`,
      `Reference families: ${index.families.length}`,
      `Representative PNG files: ${representatives.fileCount}`,
      `Representative PNG bytes: ${representatives.totalBytes}`,
      `Output bytes: ${Buffer.byteLength(contents)}`,
      `Output: ${path.relative(process.cwd(), OUTPUT_PATH)}`,
    ].join("\n") + "\n",
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown build error.";
  process.stderr.write(`Reference family build failed: ${message}\n`);
  process.exitCode = 1;
});
