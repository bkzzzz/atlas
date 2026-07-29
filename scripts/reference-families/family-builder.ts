import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type {
  ReferenceFamily,
  ReferenceFamilyIndex,
} from "../../src/lib/reference-family";

export const MIN_REFERENCE_FAMILIES = 100;
export const MAX_REFERENCE_FAMILIES = 250;
export const MAX_REFERENCE_PREVIEW_FILES = 250;
export const MAX_REFERENCE_PREVIEW_BYTES = 25_000_000;

export type PackConfig = Readonly<{
  relativePath: string;
  category: string;
  tags: readonly string[];
  familyLimit: number;
  include: (relativePath: string) => boolean;
}>;

export const SELECTED_PACKS: readonly PackConfig[] = Object.freeze([
  {
    relativePath: "2D assets/Platformer Characters 1",
    category: "characters",
    tags: ["character", "platformer", "pose", "sprite"],
    familyLimit: 35,
    include: (value) => /^PNG\/[^/]+\/Poses\//u.test(value),
  },
  {
    relativePath: "2D assets/Pirate Pack",
    category: "props",
    tags: ["pirate", "prop", "ship", "fantasy"],
    familyLimit: 25,
    include: (value) =>
      /^PNG\/(?:Default size|Retina)\/(?:Effects|Ship parts|Ships)\//u.test(value),
  },
  {
    relativePath: "2D assets/Platformer Assets Buildings",
    category: "buildings",
    tags: ["building", "architecture", "platformer", "prop"],
    familyLimit: 30,
    include: (value) => /^PNG\/[^/]+\.png$/iu.test(value),
  },
  {
    relativePath: "UI assets/UI Pack - Adventure",
    category: "ui",
    tags: ["ui", "interface", "adventure", "fantasy"],
    familyLimit: 35,
    include: (value) => /^PNG\/(?:Default|Double)\//u.test(value),
  },
  {
    relativePath: "Icons/Game Icons",
    category: "icons",
    tags: ["icon", "ui", "symbol", "game"],
    familyLimit: 40,
    include: (value) => /^PNG\/(?:Black|White)\/(?:1x|2x)\//u.test(value),
  },
  {
    relativePath: "2D assets/Isometric Medieval Town",
    category: "environment",
    tags: ["building", "environment", "fantasy", "medieval"],
    familyLimit: 30,
    include: (value) => /^PNG\//u.test(value),
  },
  {
    relativePath: "2D assets/Space Shooter Remastered",
    category: "sci-fi",
    tags: ["sci-fi", "space", "ship", "prop"],
    familyLimit: 35,
    include: (value) =>
      /^(?:Backgrounds|PNG\/(?:Damage|Effects|Enemies|Lasers|Meteors|Power-ups|UI))\//u.test(
        value,
      ),
  },
  {
    relativePath: "2D assets/Background Elements Remastered",
    category: "environment",
    tags: ["background", "environment", "landscape", "platformer"],
    familyLimit: 20,
    include: (value) =>
      /^(?:Backgrounds|PNG\/(?:Default|Retina))\//u.test(value),
  },
]);

const COLOR_TOKENS = new Set([
  "beige",
  "black",
  "blue",
  "brown",
  "cyan",
  "dark",
  "gold",
  "gray",
  "green",
  "grey",
  "light",
  "magenta",
  "orange",
  "pink",
  "purple",
  "red",
  "silver",
  "white",
  "yellow",
]);

const DIRECTION_TOKENS = new Set([
  "bottom",
  "down",
  "east",
  "left",
  "mid",
  "north",
  "right",
  "south",
  "top",
  "up",
  "west",
]);

const STRUCTURAL_SEGMENTS = new Set([
  "1x",
  "1 x",
  "2x",
  "2 x",
  "default",
  "default size",
  "double",
  "png",
  "retina",
]);

const REPRESENTATIVE_EXCLUSIONS = [
  /(^|[/_. -])preview([/_. -]|$)/iu,
  /(^|[/_. -])sample([/_. -]|$)/iu,
  /sprites?heets?/iu,
  /tiles?heets?/iu,
  /(^|[/_. -])retina([/_. -]|$)/iu,
  /(^|[/_. -])2x([/_. -]|$)/iu,
  /(^|[/_. -])double([/_. -]|$)/iu,
  /(^|[/_. -])hd([/_. -]|$)/iu,
  /@2(?:x)?(?=\.|_|-|$)/iu,
  /(?:large|oversized)(?=[/\d_. ()-]|$)/iu,
];

type FamilyCandidate = Readonly<{
  key: string;
  memberImagePaths: readonly string[];
}>;

export async function buildReferenceFamilyIndex(
  sourceRoot: string,
  packConfigs: readonly PackConfig[] = SELECTED_PACKS,
  enforcePrototypeRange = true,
): Promise<ReferenceFamilyIndex> {
  const root = path.resolve(sourceRoot);
  const rootInfo = await stat(root).catch(() => null);
  if (!rootInfo?.isDirectory()) {
    throw new Error(`Kenney source directory was not found: ${sourceRoot}`);
  }

  const families = (
    await Promise.all(
      packConfigs.map((config) => buildPackFamilies(root, config)),
    )
  )
    .flat()
    .sort(compareFamilyId);

  if (families.length > MAX_REFERENCE_FAMILIES) {
    throw new Error(
      `Reference family limit exceeded: ${families.length}/${MAX_REFERENCE_FAMILIES}.`,
    );
  }
  if (enforcePrototypeRange && families.length < MIN_REFERENCE_FAMILIES) {
    throw new Error(
      `Reference family sample is too small: ${families.length}/${MIN_REFERENCE_FAMILIES}.`,
    );
  }
  await measureReferenceRepresentatives(root, families);

  return Object.freeze({
    schemaVersion: 1,
    sourceRoot: "data/reference-source/Kenney",
    selectedPacks: Object.freeze(
      packConfigs.map(({ relativePath }) => relativePath).sort(compareText),
    ),
    families: Object.freeze(families),
  });
}

export async function measureReferenceRepresentatives(
  sourceRoot: string,
  families: readonly ReferenceFamily[],
) {
  const root = path.resolve(sourceRoot);
  const relativePaths = [
    ...new Set(families.map(({ representativeImagePath }) => representativeImagePath)),
  ].sort(compareText);
  if (relativePaths.length > MAX_REFERENCE_PREVIEW_FILES) {
    throw new Error(
      `Representative image limit exceeded: ${relativePaths.length}/${MAX_REFERENCE_PREVIEW_FILES}.`,
    );
  }

  const sizes = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const candidate = path.resolve(root, relativePath);
      ensureInsideRoot(root, candidate);
      const info = await stat(candidate);
      if (!info.isFile()) {
        throw new Error(`Representative image is not a file: ${relativePath}`);
      }
      return info.size;
    }),
  );
  const totalBytes = sizes.reduce((total, size) => total + size, 0);
  if (totalBytes > MAX_REFERENCE_PREVIEW_BYTES) {
    throw new Error(
      `Representative image size limit exceeded: ${totalBytes}/${MAX_REFERENCE_PREVIEW_BYTES} bytes.`,
    );
  }

  return Object.freeze({
    fileCount: relativePaths.length,
    totalBytes,
  });
}

export async function buildPackFamilies(
  sourceRoot: string,
  config: PackConfig,
): Promise<ReferenceFamily[]> {
  const packRoot = path.resolve(sourceRoot, config.relativePath);
  ensureInsideRoot(path.resolve(sourceRoot), packRoot);
  const files = await collectPngPaths(packRoot);
  const candidates = groupPackFiles(
    files.filter(config.include),
    config,
  );

  return candidates
    .map((candidate) => toReferenceFamily(candidate, config))
    .filter((family): family is ReferenceFamily => Boolean(family))
    .sort(
      (left, right) =>
        right.memberImagePaths.length - left.memberImagePaths.length ||
        compareFamilyId(left, right),
    )
    .slice(0, config.familyLimit)
    .sort(compareFamilyId);
}

export function groupPackFiles(
  packRelativePaths: readonly string[],
  config: Pick<PackConfig, "relativePath" | "category">,
): FamilyCandidate[] {
  const groups = new Map<string, string[]>();

  for (const relativePath of [...packRelativePaths].sort(compareText)) {
    const normalizedPath = toPosix(relativePath);
    if (!isIndividualPng(normalizedPath)) continue;
    const key = familyKey(normalizedPath, config);
    if (!key) continue;
    const members = groups.get(key) ?? [];
    members.push(normalizedPath);
    groups.set(key, members);
  }

  return [...groups.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([key, members]) =>
      Object.freeze({
        key,
        memberImagePaths: Object.freeze([...members].sort(compareText)),
      }),
    )
    .sort((left, right) => compareText(left.key, right.key));
}

export function selectRepresentativeImage(
  memberImagePaths: readonly string[],
): string | null {
  const candidates = memberImagePaths
    .filter((value) => value.toLocaleLowerCase("en-US").endsWith(".png"))
    .filter(
      (value) =>
        !REPRESENTATIVE_EXCLUSIONS.some((pattern) => pattern.test(value)),
    )
    .sort((left, right) => {
      const leftRank = standardResolutionRank(left);
      const rightRank = standardResolutionRank(right);
      return leftRank - rightRank || compareText(normalizedPath(left), normalizedPath(right));
    });
  return candidates[0] ?? null;
}

function toReferenceFamily(
  candidate: FamilyCandidate,
  config: PackConfig,
): ReferenceFamily | null {
  const representative = selectRepresentativeImage(candidate.memberImagePaths);
  if (!representative) return null;

  const packName = config.relativePath.split("/").at(-1) ?? config.relativePath;
  const familySlug = slugify(candidate.key);
  const baseId = `kenney-${slugify(packName)}-${familySlug}`;
  const suffix = createHash("sha256")
    .update(`${config.relativePath}\0${candidate.key}`)
    .digest("hex")
    .slice(0, 8);
  const id = `${baseId}-${suffix}`;
  const tagTokens = candidate.key
    .split("/")
    .flatMap(words)
    .filter((token) => token.length > 1 && !/^\d+$/u.test(token));
  const tags = [...new Set([...config.tags, ...tagTokens])]
    .map((tag) => normalizeTag(tag))
    .filter(Boolean)
    .sort(compareText);
  const title = `${packName} · ${titleCase(candidate.key.replaceAll("/", " "))}`;
  const memberImagePaths = candidate.memberImagePaths.map(
    (value) => `${config.relativePath}/${value}`,
  );
  const representativeImagePath = `${config.relativePath}/${representative}`;
  const embeddingText = [
    title,
    `Pack: ${packName}.`,
    `Category: ${config.category}.`,
    `Tags: ${tags.join(", ")}.`,
    `Contains ${memberImagePaths.length} related Kenney game asset variants.`,
  ].join(" ");

  return Object.freeze({
    id,
    title,
    pack: packName,
    category: config.category,
    tags: Object.freeze(tags),
    source: "Kenney",
    author: "Kenney",
    license: "CC0-1.0",
    representativeImagePath,
    memberImagePaths: Object.freeze(memberImagePaths),
    embeddingText,
  });
}

function familyKey(
  relativePath: string,
  config: Pick<PackConfig, "relativePath" | "category">,
) {
  const parsed = path.posix.parse(relativePath);
  const directoryTokens = parsed.dir
    .split("/")
    .map((segment) => normalizePhrase(segment))
    .filter((segment) => segment && !STRUCTURAL_SEGMENTS.has(segment));
  const filenameTokens = words(parsed.name)
    .map((token) => token.replace(/^(?:0+)(?=\d)/u, ""))
    .filter((token) => !COLOR_TOKENS.has(token))
    .filter((token) => !DIRECTION_TOKENS.has(token))
    .filter((token) => !/^(?:alt|default|large|medium|small)$/u.test(token));

  while (
    filenameTokens.length > 1 &&
    /^\d+$/u.test(filenameTokens.at(-1) ?? "")
  ) {
    filenameTokens.pop();
  }
  if (!filenameTokens.some((token) => /[a-z]/u.test(token))) return null;

  const directoryKey = compactDirectoryKey(directoryTokens, config);
  const filenameKey = compactFilenameKey(filenameTokens, config);
  if (!filenameKey) return null;
  return [directoryKey, filenameKey].filter(Boolean).join("/");
}

function compactDirectoryKey(
  segments: readonly string[],
  config: Pick<PackConfig, "relativePath" | "category">,
) {
  if (config.relativePath.endsWith("Platformer Characters 1")) {
    return segments.find((segment) =>
      /^(?:adventurer|female|player|soldier|zombie)$/u.test(segment),
    ) ?? "character";
  }
  return segments
    .filter((segment) => !/^(?:backgrounds?|parts?|poses?)$/u.test(segment))
    .filter((segment) => !COLOR_TOKENS.has(segment))
    .at(-1) ?? "";
}

function compactFilenameKey(
  tokens: readonly string[],
  config: Pick<PackConfig, "relativePath" | "category">,
) {
  if (!tokens.length) return "";
  const genericPrefix = tokens[0];
  if (
    /^(?:background|genericitem|medievaltile|naturepack|rpgtiles?|sprite|tile|towerdefense)$/u.test(
      genericPrefix,
    ) &&
    tokens.length === 1
  ) {
    return "";
  }

  const limit =
    config.category === "ui" || config.category === "icons"
      ? 3
      : config.category === "environment"
        ? 3
        : 2;
  return tokens.slice(0, limit).join("-");
}

async function collectPngPaths(root: string) {
  const output: string[] = [];

  async function visit(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (
        entry.isFile() &&
        entry.name.toLocaleLowerCase("en-US").endsWith(".png") &&
        !entry.name.endsWith(":Zone.Identifier")
      ) {
        output.push(toPosix(path.relative(root, absolutePath)));
      }
    }
  }

  await visit(root);
  return output.sort(compareText);
}

function isIndividualPng(value: string) {
  return (
    value.toLocaleLowerCase("en-US").endsWith(".png") &&
    !/(^|\/)(?:sprites?heets?|tiles?heets?)(\/|$)/iu.test(value) &&
    !/(^|[/_. -])(?:preview|sample)([/_. -]|$)/iu.test(value)
  );
}

function standardResolutionRank(value: string) {
  if (/(^|\/)(?:default|default size|1x)(\/|$)/iu.test(value)) return 0;
  return 1;
}

function words(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([\p{L}])(\d)/gu, "$1 $2")
    .replace(/(\d)([\p{L}])/gu, "$1 $2")
    .toLocaleLowerCase("en-US")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function normalizePhrase(value: string) {
  return words(value).join(" ");
}

function normalizeTag(value: string) {
  return words(value).join("-");
}

function normalizedPath(value: string) {
  return toPosix(value).normalize("NFC").toLocaleLowerCase("en-US");
}

function slugify(value: string) {
  return words(value).join("-") || "reference";
}

function titleCase(value: string) {
  return words(value)
    .map((word) => word[0]?.toLocaleUpperCase("en-US") + word.slice(1))
    .join(" ");
}

function ensureInsideRoot(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("A selected pack resolved outside the Kenney source directory.");
  }
}

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}

function compareFamilyId(left: ReferenceFamily, right: ReferenceFamily) {
  return compareText(left.id, right.id);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
