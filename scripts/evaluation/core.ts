import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  buildProductArtRequest,
  type AssetType,
} from "@/lib/asset-generation-flow";
import {
  formatReferenceContext,
  type SelectableReference,
} from "@/lib/reference-retrieval";
import { validateDraftStaticImageTask } from "@/lib/task-schema";
import type { StaticImageAssetSettings } from "@/lib/task-mode";

export const APPROVED_REFERENCE_PACKS: ReadonlySet<string> = new Set([
  "Background Elements Remastered",
  "Isometric Medieval Town",
  "Pirate Pack",
  "Platformer Assets Buildings",
  "Platformer Characters 1",
  "Space Shooter Remastered",
  "Game Icons",
  "UI Pack - Adventure",
]);

export const EVALUATION_CATEGORIES = [
  "character",
  "prop",
  "building",
  "environment",
  "fantasy-ui",
  "icon",
  "sci-fi-ship",
  "visual-effect",
] as const;

export type EvaluationCategory = (typeof EVALUATION_CATEGORIES)[number];

export type EvaluationPrompt = Readonly<{
  id: string;
  category: EvaluationCategory;
  prompt: string;
  expectedPacks: readonly string[];
  expectedTerms: readonly string[];
  irrelevantTerms: readonly string[];
}>;

export type NormalizedRetrievalResult = Readonly<{
  id: string;
  title: string;
  pack: string | null;
  category: string | null;
  tags: readonly string[];
  score: number;
}>;

export type RetrievalMode = "semantic" | "keyword" | "unknown";

export type IrrelevantMatch = Readonly<{
  resultId: string;
  terms: readonly string[];
}>;

export type RetrievalEvaluationRecord = Readonly<{
  id: string;
  category: EvaluationCategory;
  prompt: string;
  mode: RetrievalMode;
  latencyMs: number;
  status: "success" | "failure";
  results: readonly NormalizedRetrievalResult[];
  top1ExpectedPackMatch: boolean;
  expectedPackHitsAt6: number;
  hasExpectedPackAt6: boolean;
  irrelevantMatches: readonly IrrelevantMatch[];
  failureReason: string | null;
}>;

export type RetrievalMetrics = Readonly<{
  expectedPackTop1MatchRate: number;
  expectedPackPrecisionAt6: number;
  expectedPackHitAt6: number;
  averageLatencyMs: number;
  medianLatencyMs: number;
  fallbackCount: number;
  failureCount: number;
}>;

export const EVALUATION_PROJECT_BRIEF =
  "A cohesive, production-ready 2D game.";
export const EVALUATION_IMAGE_MODEL = "gpt-image-1.5";
export const EVALUATION_TASK_MODEL = "gpt-5.6-sol";

export const EVALUATION_ASSET_SETTINGS: StaticImageAssetSettings = {
  visualStyle: "ILLUSTRATION",
  viewAngle: "UNSPECIFIED",
  background: "TRANSPARENT",
  pixelDetail: "MEDIUM",
  groundShadow: "NONE",
};

export type EvaluationReferenceQuery = Readonly<{
  projectBrief: string;
  assetRequest: string;
  assetType: AssetType;
  settings: StaticImageAssetSettings;
}>;

export type RetrievalClient = Readonly<{
  retrieve: (query: EvaluationReferenceQuery) => Promise<unknown>;
}>;

export type RetrievalEvaluationDependencies = RetrievalClient &
  Readonly<{
    nowMs?: () => number;
    onProgress?: (
      records: readonly RetrievalEvaluationRecord[],
      metrics: RetrievalMetrics,
    ) => Promise<void>;
  }>;

export class LocalhostUnavailableError extends Error {}

export class EvaluationContractError extends Error {}

export class EvaluationPersistenceError extends Error {}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type RetrievalResultsDocument = Readonly<{
  schemaVersion: 1;
  status: "pending" | "partial" | "complete";
  datasetHash: string;
  baseUrl: string;
  gitCommit: string | null;
  startedAt: string;
  completedAt: string | null;
  methodology: Readonly<{
    metricScope: "human-labeled expected-pack proxy";
    projectBrief: string;
    resultLimit: 6;
    retrievalModeSource: "retrieval response mode";
  }>;
  records: readonly RetrievalEvaluationRecord[];
  metrics: RetrievalMetrics;
}>;

export type GenerationCompletionState = Readonly<{
  baseline: boolean;
  draft: boolean;
  retrieval: boolean;
  refined: boolean;
  atlas: boolean;
}>;

export type GenerationStagePlan = Readonly<{
  baseline: boolean;
  draft: boolean;
  retrieval: boolean;
  refined: boolean;
  atlasImage: boolean;
}>;

export type GenerationPlan = Readonly<{
  items: readonly Readonly<{
    prompt: EvaluationPrompt;
    stages: GenerationStagePlan;
    skipPair: boolean;
  }>[];
  calls: Readonly<{
    image: number;
    styleSpec: number;
    embedding: number;
    total: number;
  }>;
}>;

export type GenerationCliOptions = Readonly<{
  limit: number;
  confirmGeneration: boolean;
  force: boolean;
  characterId: string | null;
}>;

export type EvaluationVariant = "baseline" | "atlas";
export type ReviewWinner = "left" | "right" | "tie" | "";

export type ReviewKey = Readonly<{
  schemaVersion: 1;
  seed: "atlas-human-review-v1";
  datasetHash: string;
  assignments: readonly Readonly<{
    id: string;
    left: EvaluationVariant;
    right: EvaluationVariant;
  }>[];
}>;

export type HumanReviewRow = Readonly<{
  id: string;
  category: string;
  prompt: string;
  left_image: string;
  right_image: string;
  prompt_fit_winner: ReviewWinner;
  game_asset_usability_winner: ReviewWinner;
  style_coherence_winner: ReviewWinner;
  notes: string;
}>;

export const HUMAN_REVIEW_COLUMNS = [
  "id",
  "category",
  "prompt",
  "left_image",
  "right_image",
  "prompt_fit_winner",
  "game_asset_usability_winner",
  "style_coherence_winner",
  "notes",
] as const;

export type EvaluationCharacter = Readonly<{
  id: string;
  name: string;
}>;

export type EvaluationImageSettings = Readonly<{
  model: string;
  size: "1024x1024";
  quality: "low";
  outputFormat: "png";
  background: "transparent";
  count: 1;
}>;

export type GenerationRunConfig = Readonly<{
  fingerprint: string;
  datasetHash: string;
  comparison: "Baseline workflow vs complete Atlas workflow";
  character: EvaluationCharacter;
  characterContextHash: string;
  projectBrief: string;
  assetSettings: StaticImageAssetSettings;
  image: EvaluationImageSettings;
  referenceSelection: "first-three-valid-top-six";
}>;

type StageStatus = "pending" | "success" | "failure";

export type BaselineGenerationRecord = {
  status: StageStatus;
  inputPrompt: string;
  outputPath: string;
  durationMs: number | null;
  model: string | null;
  settings: EvaluationImageSettings;
  failureReason: string | null;
};

export type AtlasGenerationRecord = {
  status: StageStatus;
  outputPath: string;
  durationMs: number | null;
  model: string | null;
  settings: EvaluationImageSettings;
  draftStatus: StageStatus;
  draftDurationMs: number | null;
  draftStyleSpec: unknown;
  draftParser: unknown;
  retrievalStatus: StageStatus;
  retrievalDurationMs: number | null;
  retrievalMode: RetrievalMode;
  retrievalQuery: EvaluationReferenceQuery | null;
  retrievedReferences: NormalizedRetrievalResult[];
  selectedReferences: SelectableReference[];
  refinementMode: "deterministic-merge";
  refinedStatus: StageStatus;
  refinedDurationMs: number | null;
  refinedStyleSpec: unknown;
  refinedParser: unknown;
  generationDurationMs: number | null;
  failureReason: string | null;
};

export type GenerationEvaluationRecord = {
  id: string;
  category: EvaluationCategory;
  originalPrompt: string;
  configFingerprint: string;
  baseline: BaselineGenerationRecord;
  atlas: AtlasGenerationRecord;
};

export type AtlasEvaluationClient = RetrievalClient &
  Readonly<{
    listCharacters: () => Promise<unknown>;
    getCharacterMetadata: (characterId: string) => Promise<unknown>;
    parseTask: (
      characterId: string,
      body: {
        selectedMode: "STATIC_IMAGE";
        request: string;
        assetSettings: StaticImageAssetSettings;
        styleSourceCharacterId: null;
      },
    ) => Promise<unknown>;
    compileTask: (
      characterId: string,
      body: {
        draftStyleSpec: Record<string, unknown>;
        referenceIds: string[];
        styleSourceCharacterId: string | null;
      },
    ) => Promise<unknown>;
    generateImage: (generationToken: string) => Promise<unknown>;
  }>;

export type BaselineGenerator = (
  originalPrompt: string,
  background: "transparent",
) => Promise<{
  imageUrl: string;
  model: string;
  createdAt: string;
}>;

export type GenerationCostEstimate = Readonly<{
  currency: "USD";
  pricingDate: "2026-07-29";
  imageOutputFloorUsd: number;
  estimatedLowUsd: number;
  estimatedHighUsd: number;
  assumptions: readonly string[];
}>;

export type PreparedGenerationCommand = Readonly<{
  root: string;
  options: GenerationCliOptions;
  prompts: readonly EvaluationPrompt[];
  existingRecords: readonly GenerationEvaluationRecord[];
  config: GenerationRunConfig;
  plan: GenerationPlan;
  cost: GenerationCostEstimate;
}>;

export type GenerationResultsDocument = Readonly<{
  schemaVersion: 1;
  status: "pending" | "partial" | "complete";
  datasetHash: string;
  gitCommit: string | null;
  startedAt: string;
  completedAt: string | null;
  config: GenerationRunConfig;
  costEstimate: GenerationCostEstimate;
  summary: Readonly<{
    datasetSize: number;
    recordedPromptCount: number;
    successfulPairCount: number;
    failedPairCount: number;
    baselineSuccessCount: number;
    atlasSuccessCount: number;
  }>;
  records: readonly GenerationEvaluationRecord[];
}>;

const CATEGORY_SET = new Set<string>(EVALUATION_CATEGORIES);
const PROMPT_KEYS = new Set([
  "id",
  "category",
  "prompt",
  "expectedPacks",
  "expectedTerms",
  "irrelevantTerms",
]);

export function validatePromptDataset(value: unknown): EvaluationPrompt[] {
  if (!Array.isArray(value) || value.length !== 20) {
    throw new Error("Evaluation prompt dataset must contain exactly 20 records.");
  }

  const prompts = value.map((item, index) => validatePrompt(item, index));
  const ids = prompts.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Evaluation prompt IDs must be unique.");
  }
  return prompts;
}

function validatePrompt(value: unknown, index: number): EvaluationPrompt {
  if (!isRecord(value) || Object.keys(value).some((key) => !PROMPT_KEYS.has(key))) {
    throw new Error(`Evaluation prompt ${index + 1} has an invalid shape.`);
  }

  const id = boundedString(value.id, `Evaluation prompt ${index + 1} id`);
  if (!/^\d{3}$/.test(id)) {
    throw new Error(`Evaluation prompt ${index + 1} must use a three-digit id.`);
  }
  const category = boundedString(
    value.category,
    `Evaluation prompt ${id} category`,
  );
  if (!CATEGORY_SET.has(category)) {
    throw new Error(`Evaluation prompt ${id} has an unsupported category.`);
  }
  const prompt = boundedString(value.prompt, `Evaluation prompt ${id} text`, 500);
  const expectedPacks = stringList(
    value.expectedPacks,
    `Evaluation prompt ${id} expected packs`,
  );
  if (expectedPacks.some((pack) => !APPROVED_REFERENCE_PACKS.has(pack))) {
    throw new Error(`Evaluation prompt ${id} names a pack outside the frozen index.`);
  }

  return {
    id,
    category: category as EvaluationCategory,
    prompt,
    expectedPacks,
    expectedTerms: stringList(
      value.expectedTerms,
      `Evaluation prompt ${id} expected terms`,
    ),
    irrelevantTerms: stringList(
      value.irrelevantTerms,
      `Evaluation prompt ${id} irrelevant terms`,
    ),
  };
}

function boundedString(value: unknown, label: string, maxLength = 120) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${label} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

function stringList(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty string list.`);
  }
  const strings = value.map((item) => boundedString(item, label));
  if (new Set(strings).size !== strings.length) {
    throw new Error(`${label} must not contain duplicates.`);
  }
  return strings;
}

export function datasetHash(prompts: readonly EvaluationPrompt[]) {
  return createHash("sha256").update(canonicalJson(prompts)).digest("hex");
}

export function calculateRetrievalMetrics(
  records: readonly RetrievalEvaluationRecord[],
): RetrievalMetrics {
  if (!records.length) {
    return {
      expectedPackTop1MatchRate: 0,
      expectedPackPrecisionAt6: 0,
      expectedPackHitAt6: 0,
      averageLatencyMs: 0,
      medianLatencyMs: 0,
      fallbackCount: 0,
      failureCount: 0,
    };
  }

  const latencies = records
    .map(({ latencyMs }) => latencyMs)
    .filter((latency) => Number.isFinite(latency) && latency >= 0)
    .sort((left, right) => left - right);
  const midpoint = Math.floor(latencies.length / 2);
  const medianLatencyMs = latencies.length
    ? latencies.length % 2
      ? latencies[midpoint]
      : (latencies[midpoint - 1] + latencies[midpoint]) / 2
    : 0;
  const expectedPackHits = records.reduce(
    (total, record) => total + record.expectedPackHitsAt6,
    0,
  );

  return {
    expectedPackTop1MatchRate:
      records.filter(({ top1ExpectedPackMatch }) => top1ExpectedPackMatch)
        .length / records.length,
    expectedPackPrecisionAt6:
      expectedPackHits / (records.length * 6),
    expectedPackHitAt6:
      records.filter(({ hasExpectedPackAt6 }) => hasExpectedPackAt6).length /
      records.length,
    averageLatencyMs: latencies.length
      ? latencies.reduce((total, latency) => total + latency, 0) /
        latencies.length
      : 0,
    medianLatencyMs,
    fallbackCount: records.filter(({ mode }) => mode === "keyword").length,
    failureCount: records.filter(({ status }) => status === "failure").length,
  };
}

export function buildGenerationPlan(
  prompts: readonly EvaluationPrompt[],
  completion: Readonly<Record<string, GenerationCompletionState>>,
  options: { limit: number; force: boolean },
): GenerationPlan {
  const selected = prompts.slice(0, options.limit);
  const items = selected.map((prompt) => {
    const existing = completion[prompt.id] ?? emptyCompletion();
    const state = options.force ? emptyCompletion() : existing;
    const draft = !state.atlas && !state.draft;
    const retrieval =
      !state.atlas && (draft || !state.retrieval);
    // A generation token is deliberately never persisted. Whenever the Atlas
    // PNG is missing, rerun deterministic compilation to mint a fresh one-time
    // token. This stage is local and does not add a paid StyleSpec call.
    const refined = !state.atlas;
    const stages: GenerationStagePlan = {
      baseline: !state.baseline,
      draft,
      retrieval,
      refined,
      atlasImage: !state.atlas,
    };
    return {
      prompt,
      stages,
      skipPair: !Object.values(stages).some(Boolean),
    };
  });
  const image = items.reduce(
    (total, { stages }) =>
      total + Number(stages.baseline) + Number(stages.atlasImage),
    0,
  );
  const styleSpec = items.reduce(
    (total, { stages }) =>
      total + Number(stages.draft),
    0,
  );
  const embedding = items.reduce(
    (total, { stages }) => total + Number(stages.retrieval),
    0,
  );
  return {
    items,
    calls: {
      image,
      styleSpec,
      embedding,
      total: image + styleSpec + embedding,
    },
  };
}

function emptyCompletion(): GenerationCompletionState {
  return {
    baseline: false,
    draft: false,
    retrieval: false,
    refined: false,
    atlas: false,
  };
}

export function parseGenerationArguments(
  arguments_: readonly string[],
): GenerationCliOptions {
  let limit = 3;
  let confirmGeneration = false;
  let force = false;
  let characterId: string | null = null;
  const seen = new Set<string>();

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (
      argument !== "--limit" &&
      argument !== "--confirm-generation" &&
      argument !== "--force" &&
      argument !== "--character-id"
    ) {
      throw new Error(`Unknown evaluation argument: ${argument}`);
    }
    if (seen.has(argument)) {
      throw new Error(`Duplicate evaluation argument: ${argument}`);
    }
    seen.add(argument);

    if (argument === "--confirm-generation") {
      confirmGeneration = true;
      continue;
    }
    if (argument === "--force") {
      force = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    index += 1;
    if (argument === "--limit") {
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 20) {
        throw new Error("--limit must be a positive integer from 1 to 20.");
      }
      limit = Number(value);
    } else {
      characterId = boundedString(
        value,
        "--character-id",
        500,
      );
    }
  }

  return { limit, confirmGeneration, force, characterId };
}

export function createReviewKey(
  prompts: readonly EvaluationPrompt[],
  promptDatasetHash: string,
): ReviewKey {
  return {
    schemaVersion: 1,
    seed: "atlas-human-review-v1",
    datasetHash: promptDatasetHash,
    assignments: prompts.map(({ id }) => {
      const firstByte = createHash("sha256")
        .update(`atlas-human-review-v1:${id}`)
        .digest()[0];
      const left: EvaluationVariant =
        firstByte % 2 === 0 ? "baseline" : "atlas";
      return {
        id,
        left,
        right: left === "baseline" ? "atlas" : "baseline",
      };
    }),
  };
}

export function createHumanReviewCsv(
  prompts: readonly EvaluationPrompt[],
  completedPairIds: ReadonlySet<string>,
  existingCsv: string,
  resetIds: ReadonlySet<string> = new Set(),
) {
  const existingRows = existingCsv
    ? new Map(parseHumanReviewCsv(existingCsv).map((row) => [row.id, row]))
    : new Map<string, HumanReviewRow>();
  const rows: HumanReviewRow[] = prompts.map((prompt) => {
    const existing = existingRows.get(prompt.id);
    const reset = resetIds.has(prompt.id);
    const complete = completedPairIds.has(prompt.id);
    return {
      id: prompt.id,
      category: prompt.category,
      prompt: prompt.prompt,
      left_image: complete ? `review/${prompt.id}-left.png` : "",
      right_image: complete ? `review/${prompt.id}-right.png` : "",
      prompt_fit_winner:
        existing && !reset ? existing.prompt_fit_winner : "",
      game_asset_usability_winner:
        existing && !reset ? existing.game_asset_usability_winner : "",
      style_coherence_winner:
        existing && !reset ? existing.style_coherence_winner : "",
      notes: existing && !reset ? existing.notes : "",
    };
  });
  return serializeCsv([
    [...HUMAN_REVIEW_COLUMNS],
    ...rows.map((row) => HUMAN_REVIEW_COLUMNS.map((column) => row[column])),
  ]);
}

export function parseHumanReviewCsv(source: string): HumanReviewRow[] {
  const table = parseCsv(source);
  if (!table.length) throw new Error("Human review CSV is empty.");
  if (
    table[0].length !== HUMAN_REVIEW_COLUMNS.length ||
    table[0].some(
      (column, index) => column !== HUMAN_REVIEW_COLUMNS[index],
    )
  ) {
    throw new Error("Human review CSV has an invalid header.");
  }
  return table.slice(1).filter((row) => row.some(Boolean)).map((row, index) => {
    if (row.length !== HUMAN_REVIEW_COLUMNS.length) {
      throw new Error(`Human review row ${index + 2} is malformed.`);
    }
    const record = Object.fromEntries(
      HUMAN_REVIEW_COLUMNS.map((column, columnIndex) => [
        column,
        row[columnIndex],
      ]),
    ) as Record<(typeof HUMAN_REVIEW_COLUMNS)[number], string>;
    for (const field of [
      "prompt_fit_winner",
      "game_asset_usability_winner",
      "style_coherence_winner",
    ] as const) {
      if (
        record[field] !== "" &&
        record[field] !== "left" &&
        record[field] !== "right" &&
        record[field] !== "tie"
      ) {
        throw new Error(
          `Human review row ${index + 2} has an invalid ${field}.`,
        );
      }
    }
    return record as HumanReviewRow;
  });
}

export function unblindWinner(
  key: ReviewKey,
  id: string,
  winner: ReviewWinner,
): EvaluationVariant | "tie" | null {
  if (!winner) return null;
  if (winner === "tie") return "tie";
  const assignment = key.assignments.find((item) => item.id === id);
  if (!assignment) {
    throw new Error(`Review key has no assignment for ${id}.`);
  }
  return assignment[winner];
}

export function createGenerationRunConfig(
  prompts: readonly EvaluationPrompt[],
  character: EvaluationCharacter,
  imageModel: string,
  characterContext: unknown = { character },
): GenerationRunConfig {
  const normalizedImageModel = boundedString(
    imageModel,
    "Image model",
    200,
  );
  if (normalizedImageModel !== EVALUATION_IMAGE_MODEL) {
    throw new Error(
      `This frozen evaluation requires ${EVALUATION_IMAGE_MODEL}.`,
    );
  }
  if (!isRecord(characterContext)) {
    throw new EvaluationContractError(
      "Atlas returned invalid character metadata.",
    );
  }
  const image: EvaluationImageSettings = {
    model: normalizedImageModel,
    size: "1024x1024",
    quality: "low",
    outputFormat: "png",
    background: "transparent",
    count: 1,
  };
  const base = {
    datasetHash: datasetHash(prompts),
    comparison: "Baseline workflow vs complete Atlas workflow" as const,
    character: {
      id: boundedString(character.id, "Evaluation character id", 500),
      name: boundedString(character.name, "Evaluation character name", 120),
    },
    characterContextHash: createHash("sha256")
      .update(canonicalJson(characterContext))
      .digest("hex"),
    projectBrief: EVALUATION_PROJECT_BRIEF,
    assetSettings: EVALUATION_ASSET_SETTINGS,
    image,
    referenceSelection: "first-three-valid-top-six" as const,
  };
  return {
    fingerprint: createHash("sha256")
      .update(canonicalJson(base))
      .digest("hex"),
    ...base,
  };
}

export async function runPairedGeneration({
  root,
  plan,
  existingRecords,
  config,
  atlasClient,
  generateBaseline,
  nowMs = () => performance.now(),
  onProgress,
}: {
  root: string;
  plan: GenerationPlan;
  existingRecords: readonly GenerationEvaluationRecord[];
  config: GenerationRunConfig;
  atlasClient: AtlasEvaluationClient;
  generateBaseline: BaselineGenerator;
  nowMs?: () => number;
  onProgress?: (
    records: readonly GenerationEvaluationRecord[],
  ) => Promise<void>;
}) {
  const records = new Map(
    existingRecords.map((record) => [record.id, record]),
  );

  const persist = async () => {
    await onProgress?.(
      [...records.values()].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    );
  };

  for (const item of plan.items) {
    if (item.skipPair) continue;
    let record = records.get(item.prompt.id);
    if (
      !record ||
      record.configFingerprint !== config.fingerprint ||
      record.originalPrompt !== item.prompt.prompt
    ) {
      record = emptyGenerationRecord(item.prompt, config);
      records.set(item.prompt.id, record);
    }

    const baselineWork = async () => {
      if (!item.stages.baseline) return;
      const startedAt = nowMs();
      try {
        const image = await generateBaseline(
          item.prompt.prompt,
          config.image.background,
        );
        assertMatchingModel(image.model, config.image.model);
        await writePngDataUrlAtomic(
          path.join(root, record!.baseline.outputPath),
          image.imageUrl,
        );
        record!.baseline = {
          ...record!.baseline,
          status: "success",
          durationMs: elapsedMs(startedAt, nowMs()),
          model: image.model,
          failureReason: null,
        };
      } catch (error) {
        record!.baseline = {
          ...record!.baseline,
          status: "failure",
          durationMs: elapsedMs(startedAt, nowMs()),
          failureReason: "Baseline image generation failed.",
        };
        await persist();
        if (isFatalEvaluationError(error)) throw error;
        return;
      }
      await persist();
    };

    const atlasWork = async () => {
      if (!item.stages.atlasImage) return;
      const atlasStartedAt = nowMs();
      try {
        if (item.stages.draft) {
          const startedAt = nowMs();
          record!.atlas.draftStatus = "pending";
          try {
            const request = productRequest(
              item.prompt,
              config.character,
            );
            const draft = parsedTaskResponse(
              await atlasClient.parseTask(
                config.character.id,
                parseTaskBody(request),
              ),
              "Draft StyleSpec",
            );
            record!.atlas.draftStatus = "success";
            record!.atlas.draftDurationMs = elapsedMs(
              startedAt,
              nowMs(),
            );
            record!.atlas.draftStyleSpec = draft.parsedTask;
            record!.atlas.draftParser = draft.parser;
            record!.atlas.failureReason = null;
            await persist();
          } catch (error) {
            record!.atlas.draftStatus = "failure";
            record!.atlas.draftDurationMs = elapsedMs(
              startedAt,
              nowMs(),
            );
            if (isFatalEvaluationError(error)) throw error;
            throw new Error("Draft StyleSpec failed.");
          }
        }

        const draftStyleSpec = validatedDraftStyleSpecSnapshot(
          record!.atlas.draftStyleSpec,
        );
        if (!draftStyleSpec) {
          throw new Error("Draft StyleSpec is unavailable.");
        }
        // Legacy evaluation records predate referenceGuidance. Hydrate the
        // empty field only after validating the complete stored Draft shape.
        record!.atlas.draftStyleSpec = draftStyleSpec;

        if (item.stages.retrieval) {
          const startedAt = nowMs();
          record!.atlas.retrievalStatus = "pending";
          try {
            const query = referenceQueryFromDraft(
              item.prompt,
              draftStyleSpec,
            );
            const retrieval = retrievalForGeneration(
              await atlasClient.retrieve(query),
            );
            record!.atlas.retrievalStatus = "success";
            record!.atlas.retrievalDurationMs = elapsedMs(
              startedAt,
              nowMs(),
            );
            record!.atlas.retrievalMode = retrieval.mode;
            record!.atlas.retrievalQuery = query;
            record!.atlas.retrievedReferences = retrieval.results;
            record!.atlas.selectedReferences =
              retrieval.selectedReferences;
            record!.atlas.failureReason = null;
            await persist();
          } catch (error) {
            record!.atlas.retrievalStatus = "failure";
            record!.atlas.retrievalDurationMs = elapsedMs(
              startedAt,
              nowMs(),
            );
            if (isFatalEvaluationError(error)) throw error;
            throw new Error("Reference retrieval failed.");
          }
        }

        if (
          record!.atlas.selectedReferences.length < 1 ||
          record!.atlas.selectedReferences.length > 3
        ) {
          throw new Error("Selected references are unavailable.");
        }

        const refinedStartedAt = nowMs();
        record!.atlas.refinedStatus = "pending";
        record!.atlas.refinementMode = "deterministic-merge";
        record!.atlas.refinedParser = null;
        let generationToken: string;
        try {
          const refined = compiledTaskResponse(
            await atlasClient.compileTask(config.character.id, {
              draftStyleSpec,
              referenceIds: record!.atlas.selectedReferences.map(
                ({ id }) => id,
              ),
              styleSourceCharacterId: null,
            }),
          );
          generationToken = refined.generationToken;
          record!.atlas.refinedStatus = "success";
          record!.atlas.refinedDurationMs = elapsedMs(
            refinedStartedAt,
            nowMs(),
          );
          record!.atlas.refinedStyleSpec = refined.parsedTask;
          record!.atlas.failureReason = null;
          await persist();
        } catch (error) {
          record!.atlas.refinedStatus = "failure";
          record!.atlas.refinedDurationMs = elapsedMs(
            refinedStartedAt,
            nowMs(),
          );
          if (isFatalEvaluationError(error)) throw error;
          throw new Error("Deterministic StyleSpec merge failed.");
        }

        const generationStartedAt = nowMs();
        const payload = await atlasClient.generateImage(generationToken);
        const image = generatedImageResponse(payload);
        assertMatchingModel(image.model, config.image.model);
        await writePngDataUrlAtomic(
          path.join(root, record!.atlas.outputPath),
          image.imageUrl,
        );
        record!.atlas.status = "success";
        record!.atlas.model = image.model;
        record!.atlas.generationDurationMs = elapsedMs(
          generationStartedAt,
          nowMs(),
        );
        record!.atlas.durationMs = elapsedMs(
          atlasStartedAt,
          nowMs(),
        );
        record!.atlas.failureReason = null;
      } catch (error) {
        record!.atlas.status = "failure";
        record!.atlas.durationMs = elapsedMs(
          atlasStartedAt,
          nowMs(),
        );
        record!.atlas.failureReason =
          record!.atlas.draftStatus === "failure"
            ? "Draft StyleSpec failed."
            : record!.atlas.retrievalStatus === "failure"
              ? "Reference retrieval failed."
              : record!.atlas.refinedStatus === "failure"
                ? "Deterministic StyleSpec merge failed."
                : error instanceof Error &&
                    [
                      "Draft StyleSpec is unavailable.",
                      "Selected references are unavailable.",
                    ].includes(error.message)
                  ? error.message
                  : "Atlas image generation failed.";
        await persist();
        if (isFatalEvaluationError(error)) throw error;
        return;
      }
      await persist();
    };

    if (atlasRunsFirst(item.prompt.id)) {
      await atlasWork();
      await baselineWork();
    } else {
      await baselineWork();
      await atlasWork();
    }
  }

  return {
    records: [...records.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  };
}

export async function inspectGenerationCompletion(
  root: string,
  prompts: readonly EvaluationPrompt[],
  configFingerprint: string,
  records: readonly GenerationEvaluationRecord[],
) {
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const entries = await Promise.all(
    prompts.map(async (prompt) => {
      const record = recordsById.get(prompt.id);
      if (
        !record ||
        record.configFingerprint !== configFingerprint ||
        record.originalPrompt !== prompt.prompt
      ) {
        return [prompt.id, emptyCompletion()] as const;
      }
      const baselinePath = `evaluation/baseline/${prompt.id}.png`;
      const atlasPath = `evaluation/atlas/${prompt.id}.png`;
      const draft =
        record.atlas.draftStatus === "success" &&
        validatedDraftStyleSpecSnapshot(record.atlas.draftStyleSpec) !== null;
      const retrieval =
        draft &&
        record.atlas.retrievalStatus === "success" &&
        record.atlas.selectedReferences.length >= 1 &&
        record.atlas.selectedReferences.length <= 3;
      const refined =
        retrieval &&
        record.atlas.refinedStatus === "success" &&
        isRecord(record.atlas.refinedStyleSpec);
      return [
        prompt.id,
        {
          baseline:
            record.baseline.status === "success" &&
            record.baseline.inputPrompt === prompt.prompt &&
            record.baseline.outputPath === baselinePath &&
            (await hasPngSignature(path.join(root, baselinePath))),
          draft,
          retrieval,
          refined,
          atlas:
            record.atlas.status === "success" &&
            record.atlas.outputPath === atlasPath &&
            (await hasPngSignature(path.join(root, atlasPath))),
        },
      ] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<
    string,
    GenerationCompletionState
  >;
}

export async function prepareGenerationCommand({
  root = process.cwd(),
  options,
  imageModel,
  atlasClient,
}: {
  root?: string;
  options: GenerationCliOptions;
  imageModel: string;
  atlasClient: AtlasEvaluationClient;
}): Promise<PreparedGenerationCommand> {
  const prompts = validatePromptDataset(
    JSON.parse(
      await readFile(path.join(root, "evaluation/prompts.json"), "utf8"),
    ),
  );
  const character = resolveEvaluationCharacter(
    await atlasClient.listCharacters(),
    options.characterId,
  );
  const characterContext = validatedCharacterContext(
    await atlasClient.getCharacterMetadata(character.id),
    character.id,
  );
  const config = createGenerationRunConfig(
    prompts,
    character,
    imageModel,
    characterContext,
  );
  const existingRecords = await readExistingGenerationRecords(
    path.join(root, "evaluation/generation-results.json"),
    config,
  );
  const completion = await inspectGenerationCompletion(
    root,
    prompts,
    config.fingerprint,
    existingRecords,
  );
  await refuseOrphanedOutputs(
    root,
    prompts.slice(0, options.limit),
    completion,
    options.force,
  );
  const plan = buildGenerationPlan(prompts, completion, {
    limit: options.limit,
    force: options.force,
  });
  return {
    root,
    options,
    prompts,
    existingRecords,
    config,
    plan,
    cost: estimateGenerationCost(plan),
  };
}

export async function refreshReviewArtifacts({
  root,
  prompts,
  records,
  config,
  resetIds = new Set(),
}: {
  root: string;
  prompts: readonly EvaluationPrompt[];
  records: readonly GenerationEvaluationRecord[];
  config: GenerationRunConfig;
  resetIds?: ReadonlySet<string>;
}) {
  const completion = await inspectGenerationCompletion(
    root,
    prompts,
    config.fingerprint,
    records,
  );
  const completedPairIds = new Set(
    prompts
      .filter(
        ({ id }) =>
          completion[id]?.baseline === true &&
          completion[id]?.atlas === true,
      )
      .map(({ id }) => id),
  );
  const key = createReviewKey(prompts, config.datasetHash);
  await writeJsonAtomic(
    path.join(root, "evaluation/review-key.json"),
    key,
  );

  const assignments = new Map(
    key.assignments.map((assignment) => [assignment.id, assignment]),
  );
  for (const { id } of prompts) {
    if (completedPairIds.has(id)) continue;
    await Promise.all([
      removeFileIfPresent(
        path.join(root, `evaluation/review/${id}-left.png`),
      ),
      removeFileIfPresent(
        path.join(root, `evaluation/review/${id}-right.png`),
      ),
    ]);
  }
  for (const id of completedPairIds) {
    const assignment = assignments.get(id);
    if (!assignment) continue;
    const sources: Record<EvaluationVariant, string> = {
      baseline: path.join(root, `evaluation/baseline/${id}.png`),
      atlas: path.join(root, `evaluation/atlas/${id}.png`),
    };
    await copyFileAtomic(
      sources[assignment.left],
      path.join(root, `evaluation/review/${id}-left.png`),
    );
    await copyFileAtomic(
      sources[assignment.right],
      path.join(root, `evaluation/review/${id}-right.png`),
    );
  }

  const csvPath = path.join(root, "evaluation/human-review.csv");
  let existingCsv = "";
  try {
    existingCsv = await readFile(csvPath, "utf8");
  } catch {
    // A first run has no reviewer input to preserve.
  }
  const csv = createHumanReviewCsv(
    prompts,
    completedPairIds,
    existingCsv,
    resetIds,
  );
  await writeTextAtomic(csvPath, csv);
  return { completedPairIds, key, csv };
}

export async function executeGenerationCommand({
  prepared,
  atlasClient,
  generateBaseline,
  now = () => new Date(),
  nowMs,
  gitCommit = null,
}: {
  prepared: PreparedGenerationCommand;
  atlasClient: AtlasEvaluationClient;
  generateBaseline: BaselineGenerator;
  now?: () => Date;
  nowMs?: () => number;
  gitCommit?: string | null;
}) {
  requireGenerationConfirmation(prepared);
  const resultPath = path.join(
    prepared.root,
    "evaluation/generation-results.json",
  );
  const startedAt = now().toISOString();
  const documentFor = (
    records: readonly GenerationEvaluationRecord[],
    completedAt: string | null,
  ) =>
    createGenerationResultsDocument({
      prompts: prepared.prompts,
      config: prepared.config,
      records,
      startedAt,
      completedAt,
      gitCommit,
      costEstimate: prepared.cost,
    });

  const result = await runPairedGeneration({
    root: prepared.root,
    plan: prepared.plan,
    existingRecords: prepared.existingRecords,
    config: prepared.config,
    atlasClient,
    generateBaseline,
    nowMs,
    onProgress: async (records) => {
      await writeJsonAtomic(resultPath, documentFor(records, null));
    },
  });
  const document = documentFor(result.records, now().toISOString());
  await writeJsonAtomic(resultPath, document);
  await refreshReviewArtifacts({
    root: prepared.root,
    prompts: prepared.prompts,
    records: result.records,
    config: prepared.config,
    resetIds: prepared.options.force
      ? new Set(prepared.plan.items.map(({ prompt }) => prompt.id))
      : new Set(
          prepared.plan.items
            .filter(
              ({ stages }) =>
                stages.baseline || stages.atlasImage,
            )
            .map(({ prompt }) => prompt.id),
        ),
  });
  return document;
}

export function createGenerationResultsDocument({
  prompts,
  config,
  records,
  startedAt,
  completedAt,
  gitCommit,
  costEstimate,
}: {
  prompts: readonly EvaluationPrompt[];
  config: GenerationRunConfig;
  records: readonly GenerationEvaluationRecord[];
  startedAt: string;
  completedAt: string | null;
  gitCommit: string | null;
  costEstimate: GenerationCostEstimate;
}): GenerationResultsDocument {
  const successfulPairCount = records.filter(
    ({ baseline, atlas }) =>
      baseline.status === "success" && atlas.status === "success",
  ).length;
  const failedPairCount = records.filter(
    ({ baseline, atlas }) =>
      baseline.status === "failure" || atlas.status === "failure",
  ).length;
  return {
    schemaVersion: 1,
    status:
      successfulPairCount === prompts.length
        ? "complete"
        : records.length
          ? "partial"
          : "pending",
    datasetHash: config.datasetHash,
    gitCommit,
    startedAt,
    completedAt,
    config,
    costEstimate,
    summary: {
      datasetSize: prompts.length,
      recordedPromptCount: records.length,
      successfulPairCount,
      failedPairCount,
      baselineSuccessCount: records.filter(
        ({ baseline }) => baseline.status === "success",
      ).length,
      atlasSuccessCount: records.filter(
        ({ atlas }) => atlas.status === "success",
      ).length,
    },
    records,
  };
}

export function renderEvaluationReport({
  prompts,
  retrieval,
  generation,
  humanReviewCsv,
  reviewKey,
}: {
  prompts: readonly EvaluationPrompt[];
  retrieval: RetrievalResultsDocument | null;
  generation: GenerationResultsDocument | null;
  humanReviewCsv: string;
  reviewKey: ReviewKey | null;
}) {
  const promptDatasetHash = datasetHash(prompts);
  const retrievalCurrent = currentRetrievalForReport(
    retrieval,
    prompts,
    promptDatasetHash,
  );
  const generationCurrent = currentGenerationForReport(
    generation,
    prompts,
    promptDatasetHash,
  );
  const review = humanReviewSummary(
    prompts,
    generationCurrent,
    humanReviewCsv,
    reviewKey,
    promptDatasetHash,
  );
  const lines = [
    "# Atlas Local Evaluation Report",
    "",
    `Dataset: ${prompts.length} frozen prompts`,
    `Dataset SHA-256: \`${promptDatasetHash}\``,
    "",
    "## Methodology",
    "",
    "- Retrieval is evaluated with human-labeled proxy metrics based on expected-pack annotations against the eight frozen Kenney packs. These labels are benchmark annotations, not universal measures of semantic relevance.",
    `- The retrieval endpoint returns at most six candidates. Missing positions and failed queries count as non-matches in the fixed ${prompts.length * 6}-slot Precision@6 denominator.`,
    "- Image comparison: **Baseline workflow vs complete Atlas workflow**.",
    "- Baseline receives only the original prompt. Atlas performs Draft StyleSpec → reference retrieval → deterministic first-three-valid selection → deterministic StyleSpec merge → the existing prompt compiler and image pipeline.",
    "- Each workflow produces one image per prompt with matching model, size, quality, format, and background settings. The image model is nondeterministic.",
    "- No LLM judge is used. Reference images are metadata-only guidance and are not image-to-image inputs.",
    "",
    "## Retrieval proxy metrics",
    "",
  ];

  if (retrievalCurrent?.status === "complete") {
    lines.push(
      `- Expected-pack Top-1 match rate: ${formatPercent(retrievalCurrent.metrics.expectedPackTop1MatchRate)}`,
      `- Expected-pack Precision@6: ${formatPercent(retrievalCurrent.metrics.expectedPackPrecisionAt6)}`,
      `- Expected-pack Hit@6: ${formatPercent(retrievalCurrent.metrics.expectedPackHitAt6)}`,
      `- Average observed localhost latency: ${formatMilliseconds(retrievalCurrent.metrics.averageLatencyMs)}`,
      `- Median observed localhost latency: ${formatMilliseconds(retrievalCurrent.metrics.medianLatencyMs)}`,
      `- Confirmed keyword-fallback queries: ${retrievalCurrent.metrics.fallbackCount}`,
      `- Failed queries: ${retrievalCurrent.metrics.failureCount}`,
    );
  } else {
    lines.push(
      "Retrieval evaluation is pending or does not match the frozen dataset.",
    );
  }

  lines.push("", "## Paired generation", "");
  if (generationCurrent) {
    const { summary, config } = generationCurrent;
    lines.push(
      `- Comparison: ${config.comparison}`,
      `- Successful pairs: ${summary.successfulPairCount}/${summary.datasetSize}`,
      `- Failed pairs: ${summary.failedPairCount}`,
      `- Baseline outputs completed: ${summary.baselineSuccessCount}`,
      `- Atlas outputs completed: ${summary.atlasSuccessCount}`,
      `- Image settings: ${config.image.model}, ${config.image.size}, ${config.image.quality}, ${config.image.outputFormat.toUpperCase()}, ${config.image.background} background`,
      `- Average Baseline duration among successful outputs: ${averageSuccessfulDuration(generationCurrent.records, "baseline")}`,
      `- Average Atlas workflow duration among successful outputs: ${averageSuccessfulDuration(generationCurrent.records, "atlas")}`,
    );
  } else {
    lines.push(
      "Paired generation is pending or does not match the frozen dataset.",
    );
  }

  lines.push("", "## Human review", "");
  if (!review.complete) {
    lines.push(
      `**Human review: pending (${review.completedRows}/${prompts.length} fully scored pairs).**`,
      "",
      "No comparative image-quality, usability, or style-coherence result is reported while review is incomplete.",
    );
  } else {
    lines.push(
      `Human review is complete for ${prompts.length} pairs in this single-reviewer blinded comparison.`,
      "",
      ...review.criteria.flatMap((criterion) => [
        `- ${criterion.label}: Atlas selected ${criterion.atlas}/${prompts.length}; Baseline selected ${criterion.baseline}/${prompts.length}; ties ${criterion.tie}/${prompts.length}.`,
      ]),
    );
  }

  lines.push(
    "",
    "## Limitations",
    "",
    "- Expected-pack labels are human-authored proxies for this frozen Kenney sample; plausible results outside those labels are counted as non-matches.",
    "- Semantic and keyword-fallback scores use different scales and are not aggregated as confidence.",
    "- Baseline workflow vs complete Atlas workflow compares the complete systems. It does not isolate retrieval as a causal factor and is not a controlled RAG ablation.",
    "- The parser and image model are nondeterministic, and one image per workflow per prompt cannot establish statistical significance.",
    "- Atlas uses one fixed local character/project context. Its metadata hash prevents silent mixed-context resumes, but the benchmark remains specific to that snapshot and reference index.",
    "- Human findings, when complete, describe this 20-prompt single-reviewer benchmark only.",
    "",
  );
  return lines.join("\n");
}

function currentRetrievalForReport(
  retrieval: RetrievalResultsDocument | null,
  prompts: readonly EvaluationPrompt[],
  promptDatasetHash: string,
): RetrievalResultsDocument | null {
  if (
    !retrieval ||
    retrieval.datasetHash !== promptDatasetHash ||
    retrieval.status !== "complete" ||
    retrieval.records.length !== prompts.length ||
    !retrieval.records.every((record, index) =>
      retrievalRecordMatchesPrompt(record, prompts[index]),
    )
  ) {
    return null;
  }
  const records = retrieval.records.map((record, index) => {
    const prompt = prompts[index];
    const expectedPackHitsAt6 = record.results.filter(
      ({ pack }) =>
        pack !== null && prompt.expectedPacks.includes(pack),
    ).length;
    return {
      ...record,
      top1ExpectedPackMatch: Boolean(
        record.results[0]?.pack &&
          prompt.expectedPacks.includes(record.results[0].pack),
      ),
      expectedPackHitsAt6,
      hasExpectedPackAt6: expectedPackHitsAt6 > 0,
    };
  });
  return {
    ...retrieval,
    records,
    metrics: calculateRetrievalMetrics(records),
  };
}

function currentGenerationForReport(
  generation: GenerationResultsDocument | null,
  prompts: readonly EvaluationPrompt[],
  promptDatasetHash: string,
): GenerationResultsDocument | null {
  if (
    !generation ||
    generation.datasetHash !== promptDatasetHash ||
    !validGenerationReportConfig(generation.config, promptDatasetHash) ||
    generation.records.length > prompts.length
  ) {
    return null;
  }
  const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const rawRecords: readonly unknown[] = generation.records;
  const recordIds = rawRecords.map((record) =>
    isRecord(record) && typeof record.id === "string"
      ? record.id
      : null,
  );
  if (
    recordIds.some((id) => id === null) ||
    new Set(recordIds).size !== rawRecords.length ||
    !rawRecords.every((record) => {
      const prompt =
        isRecord(record) && typeof record.id === "string"
          ? promptById.get(record.id)
          : undefined;
      return (
        prompt !== undefined &&
        generationRecordMatchesPrompt(
          record,
          prompt,
          generation.config,
        )
      );
    })
  ) {
    return null;
  }
  const successfulPairCount = generation.records.filter(
    ({ baseline, atlas }) =>
      baseline.status === "success" && atlas.status === "success",
  ).length;
  const summary = {
    datasetSize: prompts.length,
    recordedPromptCount: generation.records.length,
    successfulPairCount,
    failedPairCount: generation.records.filter(
      ({ baseline, atlas }) =>
        baseline.status === "failure" || atlas.status === "failure",
    ).length,
    baselineSuccessCount: generation.records.filter(
      ({ baseline }) => baseline.status === "success",
    ).length,
    atlasSuccessCount: generation.records.filter(
      ({ atlas }) => atlas.status === "success",
    ).length,
  };
  return {
    ...generation,
    status:
      successfulPairCount === prompts.length
        ? "complete"
        : generation.records.length
          ? "partial"
          : "pending",
    summary,
  };
}

function validGenerationReportConfig(
  value: unknown,
  promptDatasetHash: string,
): value is GenerationRunConfig {
  if (
    !isRecord(value) ||
    typeof value.fingerprint !== "string" ||
    value.datasetHash !== promptDatasetHash ||
    value.comparison !== "Baseline workflow vs complete Atlas workflow" ||
    typeof value.characterContextHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.characterContextHash) ||
    !isRecord(value.image)
  ) {
    return false;
  }
  const image = value.image;
  return (
    image.model === EVALUATION_IMAGE_MODEL &&
    image.size === "1024x1024" &&
    image.quality === "low" &&
    image.outputFormat === "png" &&
    image.background === "transparent" &&
    image.count === 1
  );
}

function generationRecordMatchesPrompt(
  value: unknown,
  prompt: EvaluationPrompt,
  config: GenerationRunConfig,
): value is GenerationEvaluationRecord {
  if (
    !isRecord(value) ||
    value.id !== prompt.id ||
    value.category !== prompt.category ||
    value.originalPrompt !== prompt.prompt ||
    value.configFingerprint !== config.fingerprint ||
    !isRecord(value.baseline) ||
    !isRecord(value.atlas)
  ) {
    return false;
  }
  const baseline = value.baseline;
  const atlas = value.atlas;
  const baselineStatus = baseline.status;
  const atlasStatus = atlas.status;
  return (
    (baselineStatus === "pending" ||
      baselineStatus === "success" ||
      baselineStatus === "failure") &&
    (atlasStatus === "pending" ||
      atlasStatus === "success" ||
      atlasStatus === "failure") &&
    baseline.inputPrompt === prompt.prompt &&
    baseline.outputPath === `evaluation/baseline/${prompt.id}.png` &&
    atlas.outputPath === `evaluation/atlas/${prompt.id}.png` &&
    canonicalJson(baseline.settings) === canonicalJson(config.image) &&
    canonicalJson(atlas.settings) === canonicalJson(config.image) &&
    (atlasStatus !== "success" ||
      (atlas.draftStatus === "success" &&
        atlas.retrievalStatus === "success" &&
        atlas.refinedStatus === "success"))
  );
}

function retrievalRecordMatchesPrompt(
  value: unknown,
  prompt: EvaluationPrompt,
): value is RetrievalEvaluationRecord {
  return (
    isRecord(value) &&
    value.id === prompt.id &&
    value.category === prompt.category &&
    value.prompt === prompt.prompt &&
    (value.mode === "semantic" ||
      value.mode === "keyword" ||
      value.mode === "unknown") &&
    typeof value.latencyMs === "number" &&
    Number.isFinite(value.latencyMs) &&
    value.latencyMs >= 0 &&
    (value.status === "success" || value.status === "failure") &&
    Array.isArray(value.results) &&
    value.results.length <= 6 &&
    value.results.every(isNormalizedRetrievalResult) &&
    typeof value.top1ExpectedPackMatch === "boolean" &&
    Number.isInteger(value.expectedPackHitsAt6) &&
    Number(value.expectedPackHitsAt6) >= 0 &&
    Number(value.expectedPackHitsAt6) <= 6 &&
    typeof value.hasExpectedPackAt6 === "boolean" &&
    Array.isArray(value.irrelevantMatches) &&
    (value.failureReason === null ||
      typeof value.failureReason === "string")
  );
}

function isNormalizedRetrievalResult(
  value: unknown,
): value is NormalizedRetrievalResult {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (value.pack === null || typeof value.pack === "string") &&
    (value.category === null || typeof value.category === "string") &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    typeof value.score === "number" &&
    Number.isFinite(value.score)
  );
}

export async function runReportCommand({
  root = process.cwd(),
}: {
  root?: string;
} = {}) {
  const evaluationRoot = path.join(root, "evaluation");
  const prompts = validatePromptDataset(
    JSON.parse(
      await readFile(path.join(evaluationRoot, "prompts.json"), "utf8"),
    ),
  );
  const retrievalValue = await readOptionalJson(
    path.join(evaluationRoot, "retrieval-results.json"),
  );
  const generationValue = await readOptionalJson(
    path.join(evaluationRoot, "generation-results.json"),
  );
  const reviewKeyValue = await readOptionalJson(
    path.join(evaluationRoot, "review-key.json"),
  );
  const humanReviewCsv = await readOptionalText(
    path.join(evaluationRoot, "human-review.csv"),
  );
  const report = renderEvaluationReport({
    prompts,
    retrieval: isRetrievalResultsDocument(retrievalValue)
      ? retrievalValue
      : null,
    generation: isGenerationResultsDocument(generationValue)
      ? generationValue
      : null,
    humanReviewCsv,
    reviewKey: isReviewKey(reviewKeyValue) ? reviewKeyValue : null,
  });
  await writeTextAtomic(path.join(evaluationRoot, "report.md"), report);
  return report;
}

async function readOptionalText(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function readOptionalJson(filePath: string) {
  const source = await readOptionalText(filePath);
  if (!source) return null;
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error(`${path.basename(filePath)} contains invalid JSON.`);
  }
}

function isRetrievalResultsDocument(
  value: unknown,
): value is RetrievalResultsDocument {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.datasetHash === "string" &&
    typeof value.status === "string" &&
    Array.isArray(value.records) &&
    isRecord(value.metrics)
  );
}

function isGenerationResultsDocument(
  value: unknown,
): value is GenerationResultsDocument {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.datasetHash === "string" &&
    typeof value.status === "string" &&
    Array.isArray(value.records) &&
    isRecord(value.summary) &&
    isRecord(value.config)
  );
}

function isReviewKey(value: unknown): value is ReviewKey {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    value.seed === "atlas-human-review-v1" &&
    typeof value.datasetHash === "string" &&
    Array.isArray(value.assignments) &&
    value.assignments.every(
      (assignment) =>
        isRecord(assignment) &&
        typeof assignment.id === "string" &&
        (assignment.left === "baseline" || assignment.left === "atlas") &&
        (assignment.right === "baseline" || assignment.right === "atlas") &&
        assignment.left !== assignment.right,
    )
  );
}

function humanReviewSummary(
  prompts: readonly EvaluationPrompt[],
  generation: GenerationResultsDocument | null,
  csv: string,
  key: ReviewKey | null,
  promptDatasetHash: string,
) {
  let rows: HumanReviewRow[] = [];
  try {
    rows = parseHumanReviewCsv(csv);
  } catch {
    // Invalid or absent reviewer input stays pending.
  }
  const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const fullyScored = rows.filter(
    (row) => {
      const prompt = promptById.get(row.id);
      return (
        prompt !== undefined &&
        row.category === prompt.category &&
        row.prompt === prompt.prompt &&
        row.left_image === `review/${row.id}-left.png` &&
        row.right_image === `review/${row.id}-right.png` &&
        Boolean(row.prompt_fit_winner) &&
        Boolean(row.game_asset_usability_winner) &&
        Boolean(row.style_coherence_winner)
      );
    },
  );
  const successfulPairs =
    generation?.records.filter(
      ({ baseline, atlas }) =>
        baseline.status === "success" && atlas.status === "success",
    ).length ?? 0;
  const keyValid =
    key !== null &&
    canonicalJson(key) ===
      canonicalJson(createReviewKey(prompts, promptDatasetHash));
  const reviewRowsValid =
    rows.length === prompts.length &&
    new Set(rows.map(({ id }) => id)).size === prompts.length;
  const complete =
    generation?.status === "complete" &&
    successfulPairs === prompts.length &&
    fullyScored.length === prompts.length &&
    reviewRowsValid &&
    keyValid;
  if (!complete || !key) {
    return {
      complete: false as const,
      completedRows: fullyScored.length,
      criteria: [],
    };
  }

  const criterionFields = [
    ["Prompt fit", "prompt_fit_winner"],
    ["Game-asset usability", "game_asset_usability_winner"],
    ["Style coherence", "style_coherence_winner"],
  ] as const;
  return {
    complete: true as const,
    completedRows: fullyScored.length,
    criteria: criterionFields.map(([label, field]) => {
      const winners = rows.map((row) =>
        unblindWinner(key, row.id, row[field]),
      );
      return {
        label,
        atlas: winners.filter((winner) => winner === "atlas").length,
        baseline: winners.filter((winner) => winner === "baseline").length,
        tie: winners.filter((winner) => winner === "tie").length,
      };
    }),
  };
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMilliseconds(value: number) {
  return `${Math.round(value * 10) / 10} ms`;
}

function averageSuccessfulDuration(
  records: readonly GenerationEvaluationRecord[],
  variant: EvaluationVariant,
) {
  const values = records
    .map((record) => record[variant])
    .filter(({ status, durationMs }) => status === "success" && durationMs !== null)
    .map(({ durationMs }) => durationMs as number);
  if (!values.length) return "pending";
  return formatMilliseconds(
    values.reduce((total, value) => total + value, 0) / values.length,
  );
}

export function requireGenerationConfirmation(
  prepared: PreparedGenerationCommand,
) {
  if (
    prepared.plan.calls.total > 0 &&
    !prepared.options.confirmGeneration
  ) {
    throw new Error(
      "Generation is blocked. Re-run with --confirm-generation after reviewing the call and cost estimate.",
    );
  }
}

export function formatGenerationPreflight(
  prepared: PreparedGenerationCommand,
) {
  const { calls } = prepared.plan;
  const { cost } = prepared;
  return [
    `Selected prompts: ${prepared.plan.items.length}`,
    `Character context SHA-256: ${prepared.config.characterContextHash}`,
    `Image settings: ${prepared.config.image.model}, ${prepared.config.image.size}, ${prepared.config.image.quality}, ${prepared.config.image.outputFormat}, ${prepared.config.image.background}, n=${prepared.config.image.count}`,
    `Pending paid calls: ${calls.total} total`,
    `  ${calls.image} image API calls`,
    `  ${calls.styleSpec} Draft StyleSpec calls`,
    `  ${calls.embedding} embedding calls`,
    `Cost estimate: $${cost.estimatedLowUsd.toFixed(2)}–$${(
      Math.ceil(cost.estimatedHighUsd * 100) / 100
    ).toFixed(2)} USD`,
    `  $${cost.imageOutputFloorUsd.toFixed(3)} image-output floor`,
    "Assumptions: current configured models, approximately 1,500 Draft parser input tokens, 250–500 Draft parser output tokens, deterministic merge adds no paid call, and estimated image-prompt lengths.",
    prepared.options.confirmGeneration
      ? "Paid execution explicitly confirmed."
      : "No paid work will run without --confirm-generation.",
  ].join("\n");
}

function estimateGenerationCost(
  plan: GenerationPlan,
): GenerationCostEstimate {
  const baselineImages = plan.items.filter(
    ({ stages }) => stages.baseline,
  ).length;
  const atlasImages = plan.items.filter(
    ({ stages }) => stages.atlasImage,
  ).length;
  const imageOutputFloorUsd = plan.calls.image * 0.009;
  const imageInputUsd =
    (baselineImages * 50 + atlasImages * 1_000) * (5 / 1_000_000);
  const parserInputUsd =
    plan.calls.styleSpec * 1_500 * (5 / 1_000_000);
  const parserOutputLowUsd =
    plan.calls.styleSpec * 250 * (30 / 1_000_000);
  const parserOutputHighUsd =
    plan.calls.styleSpec * 500 * (30 / 1_000_000);
  const embeddingUsd =
    plan.calls.embedding * 200 * (0.02 / 1_000_000);

  return {
    currency: "USD",
    pricingDate: "2026-07-29",
    imageOutputFloorUsd: roundedCost(imageOutputFloorUsd),
    estimatedLowUsd: roundedCost(
      imageOutputFloorUsd +
        imageInputUsd +
        parserInputUsd +
        parserOutputLowUsd +
        embeddingUsd,
    ),
    estimatedHighUsd: roundedCost(
      imageOutputFloorUsd +
        imageInputUsd +
        parserInputUsd +
        parserOutputHighUsd +
        embeddingUsd,
    ),
    assumptions: [
      `${EVALUATION_IMAGE_MODEL} low 1024x1024 output at $0.009 per image`,
      "image text input at $5 per 1M tokens",
      `${EVALUATION_TASK_MODEL} at $5 input and $30 output per 1M tokens`,
      "text-embedding-3-small at $0.02 per 1M tokens",
      "no retries",
    ],
  };
}

function roundedCost(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function resolveEvaluationCharacter(
  value: unknown,
  requestedId: string | null,
): EvaluationCharacter {
  if (!Array.isArray(value)) {
    throw new EvaluationContractError(
      "Atlas returned an invalid character list.",
    );
  }
  const characters = value
    .filter(isRecord)
    .map((character) => {
      try {
        return {
          id: boundedString(character.id, "Character id", 500),
          name: boundedString(character.name, "Character name", 120),
        };
      } catch {
        return null;
      }
    })
    .filter((character): character is EvaluationCharacter =>
      Boolean(character),
    );
  if (requestedId) {
    const selected = characters.find(({ id }) => id === requestedId);
    if (!selected) {
      throw new Error(
        `Evaluation character ${requestedId} was not found on localhost.`,
      );
    }
    return selected;
  }
  if (characters.length !== 1) {
    throw new Error(
      "Set --character-id when Atlas does not contain exactly one character.",
    );
  }
  return characters[0];
}

function validatedCharacterContext(value: unknown, characterId: string) {
  if (
    !isRecord(value) ||
    !isRecord(value.character) ||
    value.character.id !== characterId
  ) {
    throw new EvaluationContractError(
      "Atlas returned invalid character metadata.",
    );
  }
  return value;
}

async function refuseOrphanedOutputs(
  root: string,
  prompts: readonly EvaluationPrompt[],
  completion: Readonly<Record<string, GenerationCompletionState>>,
  force: boolean,
) {
  if (force) return;
  for (const prompt of prompts) {
    for (const variant of ["baseline", "atlas"] as const) {
      const filePath = path.join(
        root,
        `evaluation/${variant}/${prompt.id}.png`,
      );
      if (!completion[prompt.id]?.[variant] && (await pathExists(filePath))) {
        throw new Error(
          `Found an orphaned evaluation PNG at evaluation/${variant}/${prompt.id}.png. Inspect it, then use --force to replace it.`,
        );
      }
    }
  }
}

async function readExistingGenerationRecords(
  filePath: string,
  config: GenerationRunConfig,
): Promise<GenerationEvaluationRecord[]> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (
      isRecord(error) &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return [];
    }
    throw new Error(
      "generation-results.json is unreadable; refusing to plan paid work.",
    );
  }
  if (
    !isRecord(value) ||
    value.datasetHash !== config.datasetHash ||
    !isRecord(value.config) ||
    value.config.fingerprint !== config.fingerprint ||
    !Array.isArray(value.records)
  ) {
    return [];
  }
  return value.records.filter(isGenerationEvaluationRecord);
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (
      isRecord(error) &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return false;
    }
    throw new EvaluationPersistenceError(
      "Could not inspect local evaluation outputs.",
    );
  }
}

function isGenerationEvaluationRecord(
  value: unknown,
): value is GenerationEvaluationRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.category === "string" &&
    typeof value.originalPrompt === "string" &&
    typeof value.configFingerprint === "string" &&
    isRecord(value.baseline) &&
    isRecord(value.atlas) &&
    Array.isArray(value.atlas.selectedReferences)
  );
}

async function copyFileAtomic(sourcePath: string, destinationPath: string) {
  if (!(await hasPngSignature(sourcePath))) {
    throw new Error("Cannot create a blinded alias from an invalid PNG.");
  }
  await mkdir(path.dirname(destinationPath), { recursive: true });
  const temporaryPath = `${destinationPath}.${process.pid}.${randomUUID()}.tmp`;
  await copyFile(sourcePath, temporaryPath);
  await rename(temporaryPath, destinationPath);
}

async function removeFileIfPresent(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (
      isRecord(error) &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return;
    }
    throw new EvaluationPersistenceError(
      "Could not refresh blinded evaluation files.",
    );
  }
}

function emptyGenerationRecord(
  prompt: EvaluationPrompt,
  config: GenerationRunConfig,
): GenerationEvaluationRecord {
  return {
    id: prompt.id,
    category: prompt.category,
    originalPrompt: prompt.prompt,
    configFingerprint: config.fingerprint,
    baseline: {
      status: "pending",
      inputPrompt: prompt.prompt,
      outputPath: `evaluation/baseline/${prompt.id}.png`,
      durationMs: null,
      model: null,
      settings: config.image,
      failureReason: null,
    },
    atlas: {
      status: "pending",
      outputPath: `evaluation/atlas/${prompt.id}.png`,
      durationMs: null,
      model: null,
      settings: config.image,
      draftStatus: "pending",
      draftDurationMs: null,
      draftStyleSpec: null,
      draftParser: null,
      retrievalStatus: "pending",
      retrievalDurationMs: null,
      retrievalMode: "unknown",
      retrievalQuery: null,
      retrievedReferences: [],
      selectedReferences: [],
      refinementMode: "deterministic-merge",
      refinedStatus: "pending",
      refinedDurationMs: null,
      refinedStyleSpec: null,
      refinedParser: null,
      generationDurationMs: null,
      failureReason: null,
    },
  };
}

function productRequest(
  prompt: EvaluationPrompt,
  character: EvaluationCharacter,
) {
  return buildProductArtRequest({
    characterName: character.name,
    assetType: assetTypeForCategory(prompt.category),
    artDirection: [
      `Project brief: ${EVALUATION_PROJECT_BRIEF}`,
      `Asset request: ${prompt.prompt}`,
    ].join("\n"),
    selectedReferences: [],
  });
}

function parseTaskBody(request: string) {
  return {
    selectedMode: "STATIC_IMAGE" as const,
    request,
    assetSettings: EVALUATION_ASSET_SETTINGS,
    styleSourceCharacterId: null,
  };
}

function parsedTaskResponse(value: unknown, label: string) {
  if (
    !isRecord(value) ||
    !isRecord(value.parsedTask) ||
    (value.generationToken !== null &&
      typeof value.generationToken !== "string") ||
    typeof value.compiledPrompt !== "string" ||
    !isRecord(value.parser) ||
    typeof value.parser.model !== "string"
  ) {
    throw new EvaluationContractError(`${label} response is invalid.`);
  }
  if (
    value.parser.model !== EVALUATION_TASK_MODEL &&
    !new RegExp(
      `^${EVALUATION_TASK_MODEL.replaceAll(".", "\\.")}-\\d{4}-\\d{2}-\\d{2}$`,
    ).test(value.parser.model)
  ) {
    throw new EvaluationContractError(
      `${label} used an unexpected parser model.`,
    );
  }
  return {
    parsedTask: value.parsedTask,
    generationToken: value.generationToken,
    parser: value.parser,
  };
}

const STORED_DRAFT_KEYS = [
  "assetKind",
  "visualSubject",
  "visualStyle",
  "composition",
  "dimensions",
  "background",
  "positiveConstraints",
  "negativeConstraints",
  "referenceAssets",
  "assumptions",
  "assetSettings",
  "userRequest",
] as const;

function validatedDraftStyleSpecSnapshot(
  value: unknown,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  const legacy =
    keys.length === STORED_DRAFT_KEYS.length &&
    keys.every((key) =>
      (STORED_DRAFT_KEYS as readonly string[]).includes(key),
    );
  const candidate = legacy
    ? { ...value, referenceGuidance: [] }
    : value;
  const validated = validateDraftStaticImageTask(candidate);
  return validated ? { ...validated } : null;
}

function compiledTaskResponse(value: unknown) {
  if (
    !isRecord(value) ||
    !isRecord(value.parsedTask) ||
    typeof value.generationToken !== "string" ||
    !value.generationToken ||
    typeof value.compiledPrompt !== "string" ||
    value.refinementMode !== "deterministic-merge"
  ) {
    throw new EvaluationContractError(
      "Deterministic StyleSpec merge response is invalid.",
    );
  }
  return {
    parsedTask: value.parsedTask,
    generationToken: value.generationToken,
  };
}

function referenceQueryFromDraft(
  prompt: EvaluationPrompt,
  draft: Record<string, unknown>,
): EvaluationReferenceQuery {
  const visualStyle = requiredTaskText(draft.visualStyle);
  const composition = requiredTaskText(draft.composition);
  const background = requiredTaskText(draft.background);
  const visualSubject = requiredTaskText(draft.visualSubject);
  const assetKind = requiredTaskText(draft.assetKind);
  const positiveConstraints = optionalStringList(
    draft.positiveConstraints,
  );
  return {
    projectBrief: [
      EVALUATION_PROJECT_BRIEF,
      visualStyle,
      composition,
      background,
      ...positiveConstraints,
    ].join(" "),
    assetRequest: [
      prompt.prompt,
      visualSubject,
      assetKind,
    ].join(" "),
    assetType: assetTypeForCategory(prompt.category),
    settings: EVALUATION_ASSET_SETTINGS,
  };
}

function requiredTaskText(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new EvaluationContractError("StyleSpec is missing retrieval fields.");
  }
  return value.trim();
}

function retrievalForGeneration(value: unknown) {
  const normalized = normalizeRetrievalPayload(value);
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw new EvaluationContractError("Atlas returned invalid retrieval data.");
  }
  const selectedReferences: SelectableReference[] = [];
  const seen = new Set<string>();
  for (const result of value.results.slice(0, 6)) {
    if (!isRecord(result) || !isRecord(result.reference)) continue;
    const reference = selectableReference(result.reference);
    if (!reference || seen.has(reference.id)) continue;
    seen.add(reference.id);
    selectedReferences.push(reference);
    if (selectedReferences.length === 3) break;
  }
  if (!selectedReferences.length) {
    throw new EvaluationContractError(
      "Atlas returned no valid selectable references.",
    );
  }
  return { ...normalized, selectedReferences };
}

function selectableReference(
  value: Record<string, unknown>,
): SelectableReference | null {
  try {
    if (value.kind === "kenney-family") {
      if (
        value.source !== "Kenney" ||
        value.author !== "Kenney" ||
        value.license !== "CC0-1.0"
      ) {
        return null;
      }
      const reference = {
        kind: "kenney-family" as const,
        id: boundedString(value.id, "Reference id", 500),
        title: boundedString(value.title, "Reference title", 500),
        previewUrl: boundedString(
          value.previewUrl,
          "Reference preview URL",
          1_000,
        ),
        pack: boundedString(value.pack, "Reference pack", 500),
        category: boundedString(
          value.category,
          "Reference category",
          500,
        ),
        tags: optionalStringList(value.tags),
        source: "Kenney" as const,
        author: "Kenney" as const,
        license: "CC0-1.0" as const,
      };
      formatReferenceContext([reference]);
      return reference;
    }
    const reference = value as unknown as SelectableReference;
    formatReferenceContext([reference]);
    return reference;
  } catch {
    return null;
  }
}

function generatedImageResponse(value: unknown) {
  if (
    !isRecord(value) ||
    !isRecord(value.image) ||
    typeof value.image.imageUrl !== "string" ||
    typeof value.image.model !== "string"
  ) {
    throw new EvaluationContractError("Atlas returned invalid image data.");
  }
  return {
    imageUrl: value.image.imageUrl,
    model: value.image.model,
  };
}

function assertMatchingModel(actual: string, expected: string) {
  if (actual !== expected) {
    throw new EvaluationContractError(
      "Baseline and Atlas image model settings do not match.",
    );
  }
}

function isFatalEvaluationError(error: unknown) {
  return (
    error instanceof EvaluationContractError ||
    error instanceof EvaluationPersistenceError ||
    error instanceof LocalhostUnavailableError
  );
}

function atlasRunsFirst(id: string) {
  return (
    createHash("sha256")
      .update(`atlas-generation-order-v1:${id}`)
      .digest()[0] %
      2 ===
    0
  );
}

export async function runRetrievalEvaluation(
  prompts: readonly EvaluationPrompt[],
  dependencies: RetrievalEvaluationDependencies,
) {
  const records: RetrievalEvaluationRecord[] = [];
  const nowMs = dependencies.nowMs ?? (() => performance.now());

  for (const prompt of prompts) {
    const startedAt = nowMs();
    try {
      const payload = await dependencies.retrieve(
        referenceQueryForPrompt(prompt),
      );
      const { mode, results } = normalizeRetrievalPayload(payload);
      const expectedPackHitsAt6 = results.filter(
        ({ pack }) => pack !== null && prompt.expectedPacks.includes(pack),
      ).length;
      records.push({
        id: prompt.id,
        category: prompt.category,
        prompt: prompt.prompt,
        mode,
        latencyMs: elapsedMs(startedAt, nowMs()),
        status: "success",
        results,
        top1ExpectedPackMatch: Boolean(
          results[0]?.pack &&
            prompt.expectedPacks.includes(results[0].pack),
        ),
        expectedPackHitsAt6,
        hasExpectedPackAt6: expectedPackHitsAt6 > 0,
        irrelevantMatches: results
          .map((result) => ({
            resultId: result.id,
            terms: flagIrrelevantTerms(prompt.irrelevantTerms, result),
          }))
          .filter(({ terms }) => terms.length > 0),
        failureReason: null,
      });
    } catch (error) {
      if (error instanceof LocalhostUnavailableError && records.length === 0) {
        throw error;
      }
      records.push({
        id: prompt.id,
        category: prompt.category,
        prompt: prompt.prompt,
        mode: "unknown",
        latencyMs: elapsedMs(startedAt, nowMs()),
        status: "failure",
        results: [],
        top1ExpectedPackMatch: false,
        expectedPackHitsAt6: 0,
        hasExpectedPackAt6: false,
        irrelevantMatches: [],
        failureReason: "Retrieval request failed.",
      });
    }
    await dependencies.onProgress?.(
      records,
      calculateRetrievalMetrics(records),
    );
  }

  return {
    records,
    metrics: calculateRetrievalMetrics(records),
  };
}

export async function runRetrievalCommand({
  root = process.cwd(),
  client,
  baseUrl = "http://localhost:3000",
  now = () => new Date(),
  nowMs,
  gitCommit = null,
}: {
  root?: string;
  client: RetrievalClient;
  baseUrl?: string;
  now?: () => Date;
  nowMs?: () => number;
  gitCommit?: string | null;
}): Promise<RetrievalResultsDocument> {
  const promptPath = path.join(root, "evaluation/prompts.json");
  const resultPath = path.join(root, "evaluation/retrieval-results.json");
  const prompts = validatePromptDataset(
    JSON.parse(await readFile(promptPath, "utf8")),
  );
  const promptDatasetHash = datasetHash(prompts);
  const startedAt = now().toISOString();

  const progressDocument = (
    records: readonly RetrievalEvaluationRecord[],
    metrics: RetrievalMetrics,
    completedAt: string | null,
  ): RetrievalResultsDocument => ({
    schemaVersion: 1,
    status:
      records.length === 0
        ? "pending"
        : records.length === prompts.length
          ? "complete"
          : "partial",
    datasetHash: promptDatasetHash,
    baseUrl,
    gitCommit,
    startedAt,
    completedAt,
    methodology: {
      metricScope: "human-labeled expected-pack proxy",
      projectBrief: EVALUATION_PROJECT_BRIEF,
      resultLimit: 6,
      retrievalModeSource: "retrieval response mode",
    },
    records,
    metrics,
  });

  const result = await runRetrievalEvaluation(prompts, {
    ...client,
    nowMs,
    onProgress: async (records, metrics) => {
      await writeJsonAtomic(
        resultPath,
        progressDocument(records, metrics, null),
      );
    },
  });
  const document = progressDocument(
    result.records,
    result.metrics,
    now().toISOString(),
  );
  await writeJsonAtomic(resultPath, document);
  return document;
}

export function referenceQueryForPrompt(
  prompt: EvaluationPrompt,
): EvaluationReferenceQuery {
  return {
    projectBrief: EVALUATION_PROJECT_BRIEF,
    assetRequest: prompt.prompt,
    assetType: assetTypeForCategory(prompt.category),
    settings: EVALUATION_ASSET_SETTINGS,
  };
}

export function assetTypeForCategory(
  category: EvaluationCategory,
): AssetType {
  if (category === "character") return "CHARACTER_SPRITE";
  if (category === "icon") return "ICON";
  if (category === "fantasy-ui") return "UI_ASSET";
  return "PROP";
}

export function createAtlasHttpClient(
  baseUrl: string,
  dependencies: { fetch?: FetchLike } = {},
): AtlasEvaluationClient {
  const origin = loopbackOrigin(baseUrl);
  const fetchImplementation = dependencies.fetch ?? fetch;

  return {
    listCharacters: () =>
      requestJson(
        fetchImplementation,
        origin,
        "/api/characters",
        undefined,
        10_000,
        "GET",
      ),
    getCharacterMetadata: (characterId) =>
      requestJson(
        fetchImplementation,
        origin,
        `/api/characters/${encodeURIComponent(characterId)}/metadata`,
        undefined,
        10_000,
        "GET",
      ),
    retrieve: (query) =>
      requestJson(
        fetchImplementation,
        origin,
        "/api/references/retrieve",
        { query },
        35_000,
      ),
    parseTask: (characterId, body) =>
      requestJson(
        fetchImplementation,
        origin,
        `/api/characters/${encodeURIComponent(characterId)}/parse-task`,
        body,
        20_000,
      ),
    compileTask: (characterId, body) =>
      requestJson(
        fetchImplementation,
        origin,
        `/api/characters/${encodeURIComponent(characterId)}/compile-task`,
        body,
        20_000,
      ),
    generateImage: (generationToken) =>
      requestJson(
        fetchImplementation,
        origin,
        "/api/generate-image",
        { generationToken },
        70_000,
      ),
  };
}

function normalizeRetrievalPayload(value: unknown): {
  mode: Exclude<RetrievalMode, "unknown">;
  results: NormalizedRetrievalResult[];
} {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw new EvaluationContractError("Atlas returned invalid retrieval data.");
  }
  const rawResults = value.results.slice(0, 6);
  if (!rawResults.length) {
    throw new EvaluationContractError(
      "Atlas returned no classifiable retrieval results.",
    );
  }
  const kenneyFlags = rawResults.map(
    (result) =>
      isRecord(result) &&
      isRecord(result.reference) &&
      result.reference.kind === "kenney-family",
  );
  const legacyMode =
    kenneyFlags.every(Boolean)
      ? "semantic"
      : kenneyFlags.every((flag) => !flag)
        ? "keyword"
        : null;
  const explicitMode =
    value.mode === "semantic" || value.mode === "keyword"
      ? value.mode
      : null;
  if (
    ("mode" in value && !explicitMode) ||
    (!explicitMode && !legacyMode)
  ) {
    throw new EvaluationContractError(
      "Atlas returned an invalid retrieval mode.",
    );
  }
  const mode = explicitMode ?? legacyMode;
  if (!mode) {
    throw new EvaluationContractError(
      "Atlas returned an invalid retrieval mode.",
    );
  }

  return {
    mode,
    results: rawResults.map((result, index) =>
      normalizedResult(result, mode, index),
    ),
  };
}

function normalizedResult(
  value: unknown,
  mode: "semantic" | "keyword",
  index: number,
): NormalizedRetrievalResult {
  if (
    !isRecord(value) ||
    !isRecord(value.reference) ||
    typeof value.score !== "number" ||
    !Number.isFinite(value.score)
  ) {
    throw new EvaluationContractError(
      `Atlas retrieval result ${index + 1} is invalid.`,
    );
  }
  const reference = value.reference;
  const id = boundedString(
    reference.id,
    `Atlas retrieval result ${index + 1} id`,
    500,
  );
  const title = boundedString(
    reference.title,
    `Atlas retrieval result ${index + 1} title`,
    500,
  );
  if (reference.kind === "kenney-family") {
    const pack = boundedString(
      reference.pack,
      `Atlas retrieval result ${index + 1} pack`,
      500,
    );
    const category = boundedString(
      reference.category,
      `Atlas retrieval result ${index + 1} category`,
      500,
    );
    return {
      id,
      title,
      pack,
      category,
      tags: optionalStringList(reference.tags),
      score: value.score,
    };
  }
  if (mode === "semantic") {
    throw new EvaluationContractError(
      `Atlas retrieval result ${index + 1} is not a ReferenceFamily.`,
    );
  }
  return {
    id,
    title,
    pack: null,
    category: null,
    tags: optionalStringList(reference.subjectTags),
    score: value.score,
  };
}

function optionalStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && Boolean(item.trim()),
      ).map((item) => item.trim())
    : [];
}

async function requestJson(
  fetchImplementation: FetchLike,
  origin: string,
  pathname: string,
  body: unknown,
  timeoutMs: number,
  method: "GET" | "POST" = "POST",
) {
  let response: Response;
  try {
    response = await fetchImplementation(`${origin}${pathname}`, {
      method,
      ...(method === "POST"
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new LocalhostUnavailableError(
      `Atlas is unavailable at ${origin}. Start npm run dev first.`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new EvaluationContractError("Atlas returned an unreadable response.");
  }
  if (!response.ok) {
    const safeMessage =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error.slice(0, 300)
        : "Atlas rejected the evaluation request.";
    throw new EvaluationContractError(safeMessage);
  }
  return payload;
}

function loopbackOrigin(baseUrl: string) {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Evaluation base URL must be a valid loopback HTTP URL.");
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (
    url.protocol !== "http:" ||
    !loopback ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error("Evaluation base URL must be a loopback HTTP origin.");
  }
  return url.origin;
}

function elapsedMs(startedAt: number, completedAt: number) {
  return Math.max(0, Math.round((completedAt - startedAt) * 1000) / 1000);
}

function serializeCsv(rows: readonly (readonly string[])[]) {
  return `${rows
    .map((row) =>
      row
        .map((value) =>
          /[",\r\n]/.test(value)
            ? `"${value.replaceAll('"', '""')}"`
            : value,
        )
        .join(","),
    )
    .join("\n")}\n`;
}

function parseCsv(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("Human review CSV has an unterminated quote.");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

export async function writeJsonAtomic(filePath: string, value: unknown) {
  await writeTextAtomic(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

export async function writeTextAtomic(filePath: string, contents: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, filePath);
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export async function writePngDataUrlAtomic(
  filePath: string,
  imageUrl: string,
) {
  const prefix = "data:image/png;base64,";
  if (!imageUrl.startsWith(prefix)) {
    throw new EvaluationContractError("Generated image is not a PNG data URL.");
  }
  const encoded = imageUrl.slice(prefix.length);
  if (
    !encoded ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) ||
    encoded.length % 4 !== 0
  ) {
    throw new EvaluationContractError("Generated PNG data is malformed.");
  }
  const image = Buffer.from(encoded, "base64");
  if (!hasValidPngStructure(image)) {
    throw new EvaluationContractError(
      "Generated image does not contain a complete PNG.",
    );
  }
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, image);
    await rename(temporaryPath, filePath);
  } catch {
    throw new EvaluationPersistenceError(
      "Could not persist a generated evaluation PNG.",
    );
  }
}

export async function hasPngSignature(filePath: string) {
  try {
    const image = await readFile(filePath);
    return hasValidPngStructure(image);
  } catch {
    return false;
  }
}

function hasValidPngStructure(image: Buffer) {
  if (
    image.length < PNG_SIGNATURE.length + 12 ||
    !image.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    return false;
  }

  let offset = PNG_SIGNATURE.length;
  let chunkIndex = 0;
  let hasImageData = false;
  while (offset + 12 <= image.length) {
    const dataLength = image.readUInt32BE(offset);
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > image.length) return false;
    const type = image.toString("ascii", offset + 4, offset + 8);
    if (chunkIndex === 0) {
      if (
        type !== "IHDR" ||
        dataLength !== 13 ||
        image.readUInt32BE(offset + 8) === 0 ||
        image.readUInt32BE(offset + 12) === 0
      ) {
        return false;
      }
    } else if (type === "IHDR") {
      return false;
    }
    if (type === "IDAT") hasImageData = true;
    if (type === "IEND") {
      return dataLength === 0 && hasImageData && chunkEnd === image.length;
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }
  return false;
}

export function flagIrrelevantTerms(
  irrelevantTerms: readonly string[],
  result: NormalizedRetrievalResult,
) {
  const searchable = normalizeText(
    [
      result.title,
      result.pack ?? "",
      result.category ?? "",
      ...result.tags,
    ].join(" "),
  );
  const padded = ` ${searchable} `;
  return irrelevantTerms.filter((term) => {
    const normalizedTerm = normalizeText(term);
    return normalizedTerm && padded.includes(` ${normalizedTerm} `);
  });
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
