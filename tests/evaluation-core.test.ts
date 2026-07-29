import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  APPROVED_REFERENCE_PACKS,
  buildGenerationPlan,
  calculateRetrievalMetrics,
  createHumanReviewCsv,
  createGenerationRunConfig,
  createReviewKey,
  datasetHash,
  flagIrrelevantTerms,
  parseGenerationArguments,
  parseHumanReviewCsv,
  renderEvaluationReport,
  unblindWinner,
  type GenerationResultsDocument,
  type RetrievalResultsDocument,
  type GenerationCompletionState,
  type RetrievalEvaluationRecord,
  validatePromptDataset,
} from "../scripts/evaluation/core";

test("the frozen prompt dataset contains exactly 20 valid prompts across the approved scope", async () => {
  const source = await readFile("evaluation/prompts.json", "utf8");
  const prompts = validatePromptDataset(JSON.parse(source));

  assert.equal(prompts.length, 20);
  assert.deepEqual(
    [...new Set(prompts.map(({ id }) => id))],
    Array.from({ length: 20 }, (_, index) =>
      String(index + 1).padStart(3, "0"),
    ),
  );
  assert.deepEqual(
    Object.fromEntries(
      [...new Set(prompts.map(({ category }) => category))]
        .sort()
        .map((category) => [
          category,
          prompts.filter((prompt) => prompt.category === category).length,
        ]),
    ),
    {
      building: 3,
      character: 3,
      environment: 3,
      "fantasy-ui": 2,
      icon: 2,
      prop: 3,
      "sci-fi-ship": 2,
      "visual-effect": 2,
    },
  );
  assert.ok(
    prompts.every(({ expectedPacks }) =>
      expectedPacks.every((pack) => APPROVED_REFERENCE_PACKS.has(pack)),
    ),
  );
  assert.match(datasetHash(prompts), /^[a-f0-9]{64}$/);
});

test("expected-pack proxy metrics use fixed rank-slot and dataset denominators", () => {
  const records: RetrievalEvaluationRecord[] = [
    retrievalRecord({
      id: "001",
      mode: "semantic",
      latencyMs: 100,
      expectedPackHitsAt6: 2,
      top1ExpectedPackMatch: true,
    }),
    retrievalRecord({
      id: "002",
      mode: "keyword",
      latencyMs: 300,
      expectedPackHitsAt6: 1,
      top1ExpectedPackMatch: false,
    }),
    retrievalRecord({
      id: "003",
      mode: "unknown",
      latencyMs: 200,
      expectedPackHitsAt6: 0,
      top1ExpectedPackMatch: false,
      status: "failure",
    }),
  ];

  assert.deepEqual(calculateRetrievalMetrics(records), {
    expectedPackTop1MatchRate: 1 / 3,
    expectedPackPrecisionAt6: 3 / 18,
    expectedPackHitAt6: 2 / 3,
    averageLatencyMs: 200,
    medianLatencyMs: 200,
    fallbackCount: 1,
    failureCount: 1,
  });
});

test("irrelevant-term flags use normalized whole words and phrases", () => {
  assert.deepEqual(
    flagIrrelevantTerms(
      ["ship", "ui button", "art"],
      {
        id: "family-1",
        title: "Spaceship shield",
        pack: "Space Shooter Remastered",
        category: "sci-fi",
        tags: ["UI", "button"],
        score: 88,
      },
    ),
    ["ui button"],
  );
});

test("generation planning skips completed outputs and --force restores all paid stages", () => {
  const prompts = [
    evaluationPrompt("001"),
    evaluationPrompt("002"),
    evaluationPrompt("003"),
  ];
  const completion: Record<string, GenerationCompletionState> = {
    "001": {
      baseline: true,
      draft: true,
      retrieval: true,
      refined: true,
      atlas: true,
    },
    "002": {
      baseline: true,
      draft: true,
      retrieval: true,
      refined: true,
      atlas: false,
    },
  };

  const resumed = buildGenerationPlan(prompts, completion, {
    limit: 2,
    force: false,
  });
  assert.deepEqual(resumed.calls, {
    image: 1,
    styleSpec: 1,
    embedding: 0,
    total: 2,
  });
  assert.equal(resumed.items[0].skipPair, true);
  assert.deepEqual(resumed.items[1].stages, {
    baseline: false,
    draft: false,
    retrieval: false,
    refined: true,
    atlasImage: true,
  });

  const forced = buildGenerationPlan(prompts, completion, {
    limit: 2,
    force: true,
  });
  assert.deepEqual(forced.calls, {
    image: 4,
    styleSpec: 4,
    embedding: 2,
    total: 10,
  });
  assert.ok(forced.items.every(({ skipPair }) => !skipPair));
});

test("generation CLI arguments are strict and require explicit confirmation state", () => {
  assert.deepEqual(parseGenerationArguments([]), {
    limit: 3,
    confirmGeneration: false,
    force: false,
    characterId: null,
  });
  assert.deepEqual(
    parseGenerationArguments([
      "--limit",
      "3",
      "--confirm-generation",
      "--character-id",
      "character-1",
    ]),
    {
      limit: 3,
      confirmGeneration: true,
      force: false,
      characterId: "character-1",
    },
  );
  assert.throws(
    () => parseGenerationArguments(["--limit", "0"]),
    /positive integer/,
  );
  assert.throws(
    () => parseGenerationArguments(["--confirm-generation", "--unknown"]),
    /Unknown evaluation argument/,
  );
});

test("fixed review randomization stays blinded in CSV and the hidden key restores identity", () => {
  const prompts = [
    evaluationPrompt("001"),
    evaluationPrompt("002"),
    evaluationPrompt("003"),
  ];
  const key = createReviewKey(prompts, "dataset-hash");

  assert.deepEqual(key.assignments, [
    { id: "001", left: "atlas", right: "baseline" },
    { id: "002", left: "atlas", right: "baseline" },
    { id: "003", left: "baseline", right: "atlas" },
  ]);
  const csv = createHumanReviewCsv(prompts, new Set(["001"]), "");
  assert.equal(
    csv.split("\n")[0],
    [
      "id",
      "category",
      "prompt",
      "left_image",
      "right_image",
      "prompt_fit_winner",
      "game_asset_usability_winner",
      "style_coherence_winner",
      "notes",
    ].join(","),
  );
  assert.match(csv, /review\/001-left\.png,review\/001-right\.png/);
  assert.doesNotMatch(csv, /baseline|atlas/i);
  assert.equal(unblindWinner(key, "001", "left"), "atlas");
  assert.equal(unblindWinner(key, "003", "right"), "atlas");
  assert.equal(unblindWinner(key, "002", "tie"), "tie");

  const scored = csv.replace(
    "review/001-right.png,,,,",
    "review/001-right.png,left,right,tie,reviewed",
  );
  const reset = parseHumanReviewCsv(
    createHumanReviewCsv(
      prompts,
      new Set(["001"]),
      scored,
      new Set(["001"]),
    ),
  )[0];
  assert.equal(reset.prompt_fit_winner, "");
  assert.equal(reset.game_asset_usability_winner, "");
  assert.equal(reset.style_coherence_winner, "");
  assert.equal(reset.notes, "");
});

test("generation fingerprints change when the local Atlas context changes", () => {
  const prompts = [evaluationPrompt("001")];
  const character = { id: "character-1", name: "Evaluation Project" };
  const first = createGenerationRunConfig(
    prompts,
    character,
    "gpt-image-1.5",
    { character: { id: character.id }, memory: { lore: "first" } },
  );
  const second = createGenerationRunConfig(
    prompts,
    character,
    "gpt-image-1.5",
    { character: { id: character.id }, memory: { lore: "second" } },
  );

  assert.notEqual(first.characterContextHash, second.characterContextHash);
  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.throws(
    () =>
      createGenerationRunConfig(
        prompts,
        character,
        "another-image-model",
      ),
    /requires gpt-image-1\.5/,
  );
});

test("report uses expected-pack proxy wording and withholds incomplete human-review claims", async () => {
  const prompts = validatePromptDataset(
    JSON.parse(await readFile("evaluation/prompts.json", "utf8")),
  );
  const hash = datasetHash(prompts);
  const retrieval = {
    schemaVersion: 1,
    status: "complete",
    datasetHash: hash,
    baseUrl: "http://localhost:3000",
    gitCommit: "abc123",
    startedAt: "2026-07-29T12:00:00.000Z",
    completedAt: "2026-07-29T12:01:00.000Z",
    methodology: {
      metricScope: "human-labeled expected-pack proxy",
      projectBrief: "A cohesive, production-ready 2D game.",
      resultLimit: 6,
      retrievalModeSource: "reference-shape discriminator",
    },
    records: prompts.map((prompt) => ({
      id: prompt.id,
      category: prompt.category,
      prompt: prompt.prompt,
      mode: "semantic" as const,
      latencyMs: 100,
      status: "success" as const,
      results: [
        {
          id: `${prompt.id}-expected`,
          title: "Expected family",
          pack: prompt.expectedPacks[0],
          category: "benchmark",
          tags: [],
          score: 0.9,
        },
      ],
      top1ExpectedPackMatch: false,
      expectedPackHitsAt6: 0,
      hasExpectedPackAt6: false,
      irrelevantMatches: [],
      failureReason: null,
    })),
    metrics: {
      expectedPackTop1MatchRate: 0,
      expectedPackPrecisionAt6: 0,
      expectedPackHitAt6: 0,
      averageLatencyMs: 0,
      medianLatencyMs: 0,
      fallbackCount: 20,
      failureCount: 20,
    },
  } satisfies RetrievalResultsDocument;
  const report = renderEvaluationReport({
    prompts,
    retrieval,
    generation: null,
    humanReviewCsv: createHumanReviewCsv(prompts, new Set(), ""),
    reviewKey: null,
  });

  assert.match(report, /Expected-pack Top-1 match rate/);
  assert.match(report, /Expected-pack Precision@6/);
  assert.match(report, /Expected-pack Hit@6/);
  assert.match(report, /Expected-pack Top-1 match rate: 100\.0%/);
  assert.match(report, /Expected-pack Precision@6: 16\.7%/);
  assert.match(report, /Confirmed keyword-fallback queries: 0/);
  assert.match(report, /human-labeled proxy/i);
  assert.match(report, /Baseline workflow vs complete Atlas workflow/);
  assert.match(report, /Human review: pending/i);
  assert.match(report, /not a controlled RAG ablation/i);
  assert.doesNotMatch(
    report,
    /retrieval caused|is an isolated RAG ablation|semantic relevance accuracy|universal retrieval accuracy|quality improved/i,
  );
});

test("report only unblinds human preferences when every pair and review field is complete", async () => {
  const prompts = validatePromptDataset(
    JSON.parse(await readFile("evaluation/prompts.json", "utf8")),
  );
  const hash = datasetHash(prompts);
  const key = createReviewKey(prompts, hash);
  const imageSettings = {
    model: "gpt-image-1.5",
    size: "1024x1024",
    quality: "low",
    outputFormat: "png",
    background: "transparent",
    count: 1,
  } as const;
  const fingerprint = "evaluation-config-fingerprint";
  const generation = {
    schemaVersion: 1,
    status: "complete",
    datasetHash: hash,
    gitCommit: "abc123",
    startedAt: "2026-07-29T12:00:00.000Z",
    completedAt: "2026-07-29T12:20:00.000Z",
    config: {
      fingerprint,
      datasetHash: hash,
      comparison: "Baseline workflow vs complete Atlas workflow",
      character: { id: "character-1", name: "Evaluation Project" },
      characterContextHash: "a".repeat(64),
      projectBrief: "A cohesive, production-ready 2D game.",
      assetSettings: {
        visualStyle: "ILLUSTRATION",
        viewAngle: "UNSPECIFIED",
        background: "TRANSPARENT",
        pixelDetail: "MEDIUM",
        groundShadow: "NONE",
      },
      image: imageSettings,
      referenceSelection: "first-three-valid-top-six",
    },
    summary: {
      datasetSize: 20,
      recordedPromptCount: 0,
      successfulPairCount: 0,
      failedPairCount: 20,
      baselineSuccessCount: 0,
      atlasSuccessCount: 0,
    },
    records: prompts.map((prompt) => ({
      id: prompt.id,
      category: prompt.category,
      originalPrompt: prompt.prompt,
      configFingerprint: fingerprint,
      baseline: {
        status: "success",
        inputPrompt: prompt.prompt,
        outputPath: `evaluation/baseline/${prompt.id}.png`,
        settings: imageSettings,
        durationMs: 100,
      },
      atlas: {
        status: "success",
        outputPath: `evaluation/atlas/${prompt.id}.png`,
        settings: imageSettings,
        durationMs: 200,
        draftStatus: "success",
        retrievalStatus: "success",
        refinedStatus: "success",
      },
    })),
  } as unknown as GenerationResultsDocument;
  const csv = completedReviewCsv(prompts);

  const pending = renderEvaluationReport({
    prompts,
    retrieval: null,
    generation,
    humanReviewCsv: csv,
    reviewKey: null,
  });
  assert.match(pending, /Human review: pending/i);
  assert.doesNotMatch(pending, /Atlas selected/);

  const complete = renderEvaluationReport({
    prompts,
    retrieval: null,
    generation,
    humanReviewCsv: csv,
    reviewKey: key,
  });
  assert.match(complete, /single-reviewer blinded comparison/i);
  assert.match(complete, /Atlas selected/);
  assert.doesNotMatch(complete, /Human review: pending/i);
  assert.doesNotMatch(complete, /001-left|001-right/);

  const duplicateRows = csv.trimEnd().split("\n");
  duplicateRows[duplicateRows.length - 1] = duplicateRows[1];
  const invalid = renderEvaluationReport({
    prompts,
    retrieval: null,
    generation,
    humanReviewCsv: `${duplicateRows.join("\n")}\n`,
    reviewKey: key,
  });
  assert.match(invalid, /Human review: pending/i);
  assert.doesNotMatch(invalid, /Atlas selected/);

  const tamperedKey = {
    ...key,
    assignments: key.assignments.map((assignment, index) =>
      index === 0
        ? {
            ...assignment,
            left: assignment.right,
            right: assignment.left,
          }
        : assignment,
    ),
  };
  const tampered = renderEvaluationReport({
    prompts,
    retrieval: null,
    generation,
    humanReviewCsv: csv,
    reviewKey: tamperedKey,
  });
  assert.match(tampered, /Human review: pending/i);
  assert.doesNotMatch(tampered, /Atlas selected/);
});

function retrievalRecord(
  overrides: Partial<RetrievalEvaluationRecord> &
    Pick<RetrievalEvaluationRecord, "id">,
): RetrievalEvaluationRecord {
  return {
    category: "prop",
    prompt: "Prompt",
    mode: "semantic",
    latencyMs: 1,
    status: "success",
    results: [],
    top1ExpectedPackMatch: false,
    expectedPackHitsAt6: 0,
    hasExpectedPackAt6: (overrides.expectedPackHitsAt6 ?? 0) > 0,
    irrelevantMatches: [],
    failureReason: null,
    ...overrides,
    id: overrides.id,
  };
}

function evaluationPrompt(id: string): import("../scripts/evaluation/core").EvaluationPrompt {
  return {
    category: "prop",
    prompt: `Prompt ${id}`,
    expectedPacks: ["Pirate Pack"],
    expectedTerms: ["prop"],
    irrelevantTerms: ["space"],
    id,
  };
}

function completedReviewCsv(
  prompts: readonly import("../scripts/evaluation/core").EvaluationPrompt[],
) {
  const rows = [
    [
      "id",
      "category",
      "prompt",
      "left_image",
      "right_image",
      "prompt_fit_winner",
      "game_asset_usability_winner",
      "style_coherence_winner",
      "notes",
    ],
    ...prompts.map((prompt) => [
      prompt.id,
      prompt.category,
      prompt.prompt,
      `review/${prompt.id}-left.png`,
      `review/${prompt.id}-right.png`,
      "left",
      "right",
      "tie",
      "",
    ]),
  ];
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
