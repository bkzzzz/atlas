import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  LocalhostUnavailableError,
  buildGenerationPlan,
  createHumanReviewCsv,
  createAtlasHttpClient,
  createGenerationRunConfig,
  executeGenerationCommand,
  formatGenerationPreflight,
  inspectGenerationCompletion,
  prepareGenerationCommand,
  refreshReviewArtifacts,
  requireGenerationConfirmation,
  runReportCommand,
  runPairedGeneration,
  runRetrievalCommand,
  runRetrievalEvaluation,
  type EvaluationPrompt,
  type GenerationEvaluationRecord,
  type GenerationRunConfig,
} from "../scripts/evaluation/core";

test("retrieval evaluation records objective expected-pack proxy metrics and failures", async () => {
  const prompts = [
    prompt({
      id: "001",
      category: "building",
      expectedPacks: ["Isometric Medieval Town"],
      irrelevantTerms: ["spaceship"],
    }),
    prompt({
      id: "002",
      category: "icon",
      expectedPacks: ["Game Icons"],
      irrelevantTerms: ["pirate ship"],
    }),
    prompt({
      id: "003",
      category: "prop",
      expectedPacks: ["Pirate Pack"],
      irrelevantTerms: ["spaceship"],
    }),
  ];
  const responses: unknown[] = [
    {
      mode: "semantic",
      results: [
        {
          reference: {
            kind: "kenney-family",
            id: "medieval-wall",
            title: "Medieval Wall",
            pack: "Isometric Medieval Town",
            category: "environment",
            tags: ["medieval", "wall"],
          },
          score: 91,
          matchedFields: [],
        },
        {
          reference: {
            kind: "kenney-family",
            id: "space-ship",
            title: "Spaceship",
            pack: "Space Shooter Remastered",
            category: "sci-fi",
            tags: ["ship"],
          },
          score: 70,
          matchedFields: [],
        },
      ],
    },
    {
      mode: "keyword",
      results: [
        {
          reference: {
            kind: "kenney-family",
            id: "fallback-icon",
            title: "Simple Game Icon",
            pack: "Unrelated Pack",
            category: "icons",
            tags: ["icon", "menu"],
          },
          score: 12,
          matchedFields: ["tags"],
        },
      ],
    },
    new Error("upstream unavailable"),
  ];
  const times = [0, 100, 100, 300, 300, 600];

  const result = await runRetrievalEvaluation(prompts, {
    retrieve: async () => {
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    nowMs: () => times.shift() ?? 600,
  });

  assert.equal(result.records[0].mode, "semantic");
  assert.equal(result.records[0].top1ExpectedPackMatch, true);
  assert.equal(result.records[0].expectedPackHitsAt6, 1);
  assert.deepEqual(result.records[0].irrelevantMatches, [
    { resultId: "space-ship", terms: ["spaceship"] },
  ]);
  assert.equal(result.records[1].mode, "keyword");
  assert.equal(result.records[1].top1ExpectedPackMatch, false);
  assert.equal(result.records[2].status, "failure");
  assert.equal(result.records[2].failureReason, "Retrieval request failed.");
  assert.deepEqual(result.metrics, {
    expectedPackTop1MatchRate: 1 / 3,
    expectedPackPrecisionAt6: 1 / 18,
    expectedPackHitAt6: 1 / 3,
    averageLatencyMs: 200,
    medianLatencyMs: 200,
    fallbackCount: 1,
    failureCount: 1,
  });
});

test("the localhost client reports an unavailable server without exposing the raw error", async () => {
  const client = createAtlasHttpClient("http://localhost:3000", {
    fetch: async () => {
      throw new TypeError("connect ECONNREFUSED 127.0.0.1:3000");
    },
  });

  await assert.rejects(
    () =>
      client.retrieve({
        projectBrief: "Brief",
        assetRequest: "Asset",
        assetType: "PROP",
        settings: {
          visualStyle: "ILLUSTRATION",
          viewAngle: "UNSPECIFIED",
          background: "TRANSPARENT",
          pixelDetail: "MEDIUM",
          groundShadow: "NONE",
        },
      }),
    (error: unknown) =>
      error instanceof LocalhostUnavailableError &&
      error.message ===
        "Atlas is unavailable at http://localhost:3000. Start npm run dev first.",
  );
});

test("the localhost client sends only the structured deterministic compile contract", async () => {
  const requests: { input: string; init: RequestInit | undefined }[] = [];
  const client = createAtlasHttpClient("http://localhost:3000", {
    fetch: async (input, init) => {
      requests.push({ input: String(input), init });
      return Response.json({
        parsedTask: {},
        generationToken: "token",
        compiledPrompt: "prompt",
        refinementMode: "deterministic-merge",
      });
    },
  });
  const body = {
    draftStyleSpec: {
      assetKind: "prop",
      referenceGuidance: [],
    },
    referenceIds: ["family-b", "family-a"],
    styleSourceCharacterId: null,
  };

  await client.compileTask("character / one", body);

  assert.equal(
    requests[0].input,
    "http://localhost:3000/api/characters/character%20%2F%20one/compile-task",
  );
  assert.equal(requests[0].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), body);
});

test("retrieval command writes a resume-safe result document and preserves it when localhost is missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-evaluation-"));
  try {
    await mkdir(path.join(root, "evaluation"), { recursive: true });
    await writeFile(
      path.join(root, "evaluation/prompts.json"),
      await readFile("evaluation/prompts.json", "utf8"),
      "utf8",
    );
    const resultPath = path.join(root, "evaluation/retrieval-results.json");
    const semanticResult = {
      results: [
        {
          reference: {
            kind: "kenney-family",
            id: "expected",
            title: "Expected family",
            pack: "Pirate Pack",
            category: "props",
            tags: ["prop"],
          },
          score: 80,
          matchedFields: [],
        },
      ],
    };

    const document = await runRetrievalCommand({
      root,
      client: { retrieve: async () => semanticResult },
      now: () => new Date("2026-07-29T12:00:00.000Z"),
      nowMs: (() => {
        let time = 0;
        return () => (time += 10);
      })(),
    });

    assert.equal(document.status, "complete");
    assert.equal(document.records.length, 20);
    assert.deepEqual(
      JSON.parse(await readFile(resultPath, "utf8")),
      document,
    );

    const before = await readFile(resultPath, "utf8");
    await assert.rejects(
      () =>
        runRetrievalCommand({
          root,
          client: {
            retrieve: async () => {
              throw new LocalhostUnavailableError("offline");
            },
          },
        }),
      LocalhostUnavailableError,
    );
    assert.equal(await readFile(resultPath, "utf8"), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("paired generation gives Baseline only the original prompt and records the complete Atlas workflow", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-generation-"));
  try {
    const prompts = [prompt({ id: "001" })];
    const plan = buildGenerationPlan(prompts, {}, { limit: 1, force: false });
    const parsedTask = {
      assetKind: "game prop",
      visualSubject: "wooden cannon",
      visualStyle: "painted game art",
      composition: "centered side view",
      dimensions: "1024x1024",
      background: "transparent",
      positiveConstraints: ["readable silhouette"],
      negativeConstraints: ["no text"],
      referenceAssets: [],
      assumptions: [],
      assetSettings: {
        visualStyle: "ILLUSTRATION",
        viewAngle: "UNSPECIFIED",
        background: "TRANSPARENT",
        pixelDetail: "MEDIUM",
        groundShadow: "NONE",
      },
      userRequest: "request",
      referenceGuidance: [],
    };
    const draftResponse = {
      parsedTask,
      generationToken: "unused-draft-token",
      compiledPrompt: "draft compiled prompt",
      parser: {
        model: "gpt-5.6-sol",
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          estimatedCostUsd: 0.002,
        },
      },
    };
    const mergedTask = {
      ...parsedTask,
      referenceGuidance: [
        {
          id: "reference-1",
          title: "Reference 1",
          pack: "Pirate Pack",
          category: "props",
          tags: ["pirate", "prop"],
        },
      ],
    };
    let parseCount = 0;
    let compileCount = 0;
    let baselineInput = "";

    const result = await runPairedGeneration({
      root,
      plan,
      existingRecords: [],
      config: createGenerationRunConfig(
        prompts,
        { id: "character-1", name: "Evaluation Project" },
        "gpt-image-1.5",
      ),
      atlasClient: {
        retrieve: async () => ({
          results: Array.from({ length: 4 }, (_, index) => ({
            reference: {
              kind: "kenney-family",
              id: `reference-${index + 1}`,
              title: `Reference ${index + 1}`,
              pack: "Pirate Pack",
              category: "props",
              tags: ["pirate", "prop"],
              source: "Kenney",
              author: "Kenney",
              license: "CC0-1.0",
              previewUrl: `/api/references/image?id=reference-${index + 1}`,
            },
            score: 90 - index,
            matchedFields: [],
          })),
        }),
        listCharacters: async () => [],
        getCharacterMetadata: async () => ({
          character: { id: "character-1" },
        }),
        parseTask: async () => {
          parseCount += 1;
          return draftResponse;
        },
        compileTask: async (characterId, body) => {
          compileCount += 1;
          assert.equal(characterId, "character-1");
          assert.deepEqual(body, {
            draftStyleSpec: parsedTask,
            referenceIds: [
              "reference-1",
              "reference-2",
              "reference-3",
            ],
            styleSourceCharacterId: null,
          });
          return {
            parsedTask: mergedTask,
            generationToken: "refined-token",
            compiledPrompt: "refined compiled prompt",
            refinementMode: "deterministic-merge",
          };
        },
        generateImage: async (generationToken) => {
          assert.equal(generationToken, "refined-token");
          return {
            image: {
              imageUrl: pngDataUrl(),
              model: "gpt-image-1.5",
              compiledPrompt: "refined compiled prompt",
              createdAt: "2026-07-29T12:00:00.000Z",
            },
          };
        },
      },
      generateBaseline: async (originalPrompt) => {
        baselineInput = originalPrompt;
        return {
          imageUrl: pngDataUrl(),
          model: "gpt-image-1.5",
          createdAt: "2026-07-29T12:00:00.000Z",
        };
      },
      nowMs: (() => {
        let time = 0;
        return () => (time += 10);
      })(),
    });

    assert.equal(baselineInput, prompts[0].prompt);
    assert.equal(parseCount, 1);
    assert.equal(compileCount, 1);
    assert.equal(result.records[0].baseline.inputPrompt, prompts[0].prompt);
    assert.equal(result.records[0].baseline.status, "success");
    assert.equal(result.records[0].atlas.status, "success");
    assert.deepEqual(
      result.records[0].baseline.settings,
      result.records[0].atlas.settings,
    );
    assert.deepEqual(result.records[0].atlas.draftStyleSpec, parsedTask);
    assert.deepEqual(result.records[0].atlas.refinedStyleSpec, mergedTask);
    assert.equal(
      result.records[0].atlas.refinementMode,
      "deterministic-merge",
    );
    assert.equal(result.records[0].atlas.refinedParser, null);
    assert.deepEqual(
      result.records[0].atlas.selectedReferences.map(({ id }) => id),
      ["reference-1", "reference-2", "reference-3"],
    );
    assert.doesNotMatch(JSON.stringify(result), /generationToken|refined-token/);
    assert.ok(
      await fileHasPngSignature(path.join(root, "evaluation/baseline/001.png")),
    );
    assert.ok(
      await fileHasPngSignature(path.join(root, "evaluation/atlas/001.png")),
    );
    assert.deepEqual(
      await inspectGenerationCompletion(
        root,
        prompts,
        result.records[0].configFingerprint,
        result.records,
      ),
      {
        "001": {
          baseline: true,
          draft: true,
          retrieval: true,
          refined: true,
          atlas: true,
        },
      },
    );
    await refreshReviewArtifacts({
      root,
      prompts,
      records: result.records,
      config: createGenerationRunConfig(
        prompts,
        { id: "character-1", name: "Evaluation Project" },
        "gpt-image-1.5",
      ),
    });
    const reviewCsv = await readFile(
      path.join(root, "evaluation/human-review.csv"),
      "utf8",
    );
    assert.doesNotMatch(reviewCsv, /baseline|atlas/i);
    assert.ok(
      await fileHasPngSignature(
        path.join(root, "evaluation/review/001-left.png"),
      ),
    );
    assert.ok(
      await fileHasPngSignature(
        path.join(root, "evaluation/review/001-right.png"),
      ),
    );
    const reviewKey = JSON.parse(
      await readFile(
        path.join(root, "evaluation/review-key.json"),
        "utf8",
      ),
    );
    assert.equal(reviewKey.assignments[0].id, "001");
    assert.notEqual(
      reviewKey.assignments[0].left,
      reviewKey.assignments[0].right,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resume planning only trusts exact stored Draft StyleSpec snapshots", async () => {
  const prompts = [prompt({ id: "001" })];
  const config = createGenerationRunConfig(
    prompts,
    { id: "character-1", name: "Evaluation Project" },
    "gpt-image-1.5",
  );
  const invalid = generationRecord(prompts[0], config);
  invalid.atlas.draftStyleSpec = {
    ...(invalid.atlas.draftStyleSpec as Record<string, unknown>),
    unexpected: "must not be accepted",
  };

  const completion = await inspectGenerationCompletion(
    "/tmp/nonexistent-atlas-evaluation",
    prompts,
    config.fingerprint,
    [invalid],
  );

  assert.equal(completion["001"].draft, false);
  assert.equal(completion["001"].retrieval, false);
});

test("a partial pilot reuses Baseline, Draft, and retrieval before deterministic compilation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-resume-"));
  try {
    const prompts = [prompt({ id: "001" })];
    const config = createGenerationRunConfig(
      prompts,
      { id: "character-1", name: "Evaluation Project" },
      "gpt-image-1.5",
    );
    const existing = generationRecord(prompts[0], config);
    existing.baseline.status = "success";
    existing.baseline.model = "gpt-image-1.5";
    existing.baseline.durationMs = 10;
    await mkdir(path.join(root, "evaluation/baseline"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, existing.baseline.outputPath),
      Buffer.from(pngDataUrl().split(",")[1], "base64"),
    );

    const completion = await inspectGenerationCompletion(
      root,
      prompts,
      config.fingerprint,
      [existing],
    );
    assert.deepEqual(completion["001"], {
      baseline: true,
      draft: true,
      retrieval: true,
      refined: false,
      atlas: false,
    });
    const plan = buildGenerationPlan(prompts, completion, {
      limit: 1,
      force: false,
    });
    assert.deepEqual(plan.calls, {
      image: 1,
      styleSpec: 0,
      embedding: 0,
      total: 1,
    });

    let compileBody: unknown;
    let imageCalls = 0;
    const result = await runPairedGeneration({
      root,
      plan,
      existingRecords: [existing],
      config,
      atlasClient: {
        listCharacters: async () => [],
        getCharacterMetadata: async () => ({}),
        parseTask: async () => {
          throw new Error("completed Draft must not repeat");
        },
        retrieve: async () => {
          throw new Error("completed retrieval must not repeat");
        },
        compileTask: async (_characterId, body) => {
          compileBody = body;
          return {
            parsedTask: {
              ...body.draftStyleSpec,
              referenceGuidance: body.referenceIds.map((id) => ({
                id,
                title: id,
                pack: "Pirate Pack",
                category: "props",
                tags: ["prop"],
              })),
            },
            generationToken: "fresh-one-time-token",
            compiledPrompt: "deterministically compiled",
            refinementMode: "deterministic-merge",
          };
        },
        generateImage: async (token) => {
          imageCalls += 1;
          assert.equal(token, "fresh-one-time-token");
          return {
            image: {
              imageUrl: pngDataUrl(),
              model: "gpt-image-1.5",
            },
          };
        },
      },
      generateBaseline: async () => {
        throw new Error("successful Baseline must not repeat");
      },
    });

    assert.deepEqual(compileBody, {
      draftStyleSpec: {
        ...(existing.atlas.draftStyleSpec as Record<string, unknown>),
        referenceGuidance: [],
      },
      referenceIds: ["reference-1", "reference-2", "reference-3"],
      styleSourceCharacterId: null,
    });
    assert.equal(imageCalls, 1);
    assert.equal(result.records[0].baseline.status, "success");
    assert.equal(result.records[0].atlas.status, "success");
    assert.equal(
      result.records[0].atlas.refinementMode,
      "deterministic-merge",
    );
    assert.equal(result.records[0].atlas.refinedParser, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a model mismatch aborts the paired run before spending on later prompts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-model-mismatch-"));
  try {
    const prompts = [prompt({ id: "001" }), prompt({ id: "002" })];
    let imageCalls = 0;
    const parsedTask = {
      assetKind: "game prop",
      visualSubject: "pirate cannon",
      visualStyle: "painted game art",
      composition: "centered side view",
      background: "transparent",
      positiveConstraints: ["readable"],
    };

    await assert.rejects(
      () =>
        runPairedGeneration({
          root,
          plan: buildGenerationPlan(
            prompts,
            {},
            { limit: 2, force: false },
          ),
          existingRecords: [],
          config: createGenerationRunConfig(
            prompts,
            { id: "character-1", name: "Evaluation Project" },
            "gpt-image-1.5",
          ),
          atlasClient: {
            listCharacters: async () => [],
            getCharacterMetadata: async () => ({
              character: { id: "character-1" },
            }),
            parseTask: async () => ({
              parsedTask,
              generationToken: "token",
              compiledPrompt: "compiled",
              parser: { model: "gpt-5.6-sol" },
            }),
            compileTask: async () => {
              throw new Error("must not compile after model mismatch");
            },
            retrieve: async () => ({
              results: [
                {
                  reference: {
                    kind: "kenney-family",
                    id: "pirate-prop",
                    title: "Pirate prop",
                    previewUrl: "/api/references/image?id=pirate-prop",
                    pack: "Pirate Pack",
                    category: "props",
                    tags: ["pirate", "prop"],
                    source: "Kenney",
                    author: "Kenney",
                    license: "CC0-1.0",
                  },
                  score: 90,
                  matchedFields: [],
                },
              ],
            }),
            generateImage: async () => {
              imageCalls += 1;
              return {
                image: {
                  imageUrl: pngDataUrl(),
                  model: "wrong-image-model",
                },
              };
            },
          },
          generateBaseline: async () => {
            imageCalls += 1;
            return {
              imageUrl: pngDataUrl(),
              model: "wrong-image-model",
              createdAt: "2026-07-29T12:00:00.000Z",
            };
          },
        }),
      /image model settings do not match/,
    );
    assert.equal(imageCalls, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an unexpected localhost parser model aborts and persists a sanitized failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-parser-mismatch-"));
  try {
    const prompts = [prompt({ id: "003" })];
    let baselineCalls = 0;
    let retrievalCalls = 0;
    let imageCalls = 0;
    const snapshots: (readonly import("../scripts/evaluation/core").GenerationEvaluationRecord[])[] =
      [];

    await assert.rejects(
      () =>
        runPairedGeneration({
          root,
          plan: buildGenerationPlan(
            prompts,
            {},
            { limit: 1, force: false },
          ),
          existingRecords: [],
          config: createGenerationRunConfig(
            prompts,
            { id: "character-1", name: "Evaluation Project" },
            "gpt-image-1.5",
          ),
          atlasClient: {
            listCharacters: async () => [],
            getCharacterMetadata: async () => ({
              character: { id: "character-1" },
            }),
            parseTask: async () => ({
              parsedTask: {
                assetKind: "game prop",
                visualSubject: "pirate cannon",
                visualStyle: "painted game art",
                composition: "centered side view",
                background: "transparent",
                positiveConstraints: ["readable"],
              },
              generationToken: "token",
              compiledPrompt: "compiled",
              parser: { model: "unexpected-parser-model" },
            }),
            compileTask: async () => {
              throw new Error("must not compile an invalid Draft");
            },
            retrieve: async () => {
              retrievalCalls += 1;
              return {};
            },
            generateImage: async () => {
              imageCalls += 1;
              return {};
            },
          },
          generateBaseline: async () => {
            baselineCalls += 1;
            throw new Error("must not run");
          },
          onProgress: async (records) => {
            snapshots.push(structuredClone(records));
          },
        }),
      /unexpected parser model/,
    );

    assert.equal(baselineCalls, 0);
    assert.equal(retrievalCalls, 0);
    assert.equal(imageCalls, 0);
    const persisted = snapshots.at(-1);
    assert.ok(persisted);
    assert.equal(persisted[0].atlas.status, "failure");
    assert.equal(persisted[0].atlas.draftStatus, "failure");
    assert.equal(
      persisted[0].atlas.failureReason,
      "Draft StyleSpec failed.",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a partial Atlas failure preserves the successful Baseline and sanitizes the failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-partial-"));
  try {
    const prompts = [prompt({ id: "002" })];
    let parseCount = 0;
    const result = await runPairedGeneration({
      root,
      plan: buildGenerationPlan(prompts, {}, { limit: 1, force: false }),
      existingRecords: [],
      config: createGenerationRunConfig(
        prompts,
        { id: "character-1", name: "Evaluation Project" },
        "gpt-image-1.5",
      ),
      atlasClient: {
        listCharacters: async () => [],
        getCharacterMetadata: async () => ({
          character: { id: "character-1" },
        }),
        parseTask: async () => {
          parseCount += 1;
          return {
            parsedTask: {
              assetKind: "game prop",
              visualSubject: "pirate cannon",
              visualStyle: "painted game art",
              composition: "centered side view",
              dimensions: "1024x1024",
              background: "transparent",
              positiveConstraints: ["readable"],
              negativeConstraints: ["no text"],
              referenceAssets: [],
              assumptions: [],
              assetSettings: {
                visualStyle: "ILLUSTRATION",
                viewAngle: "UNSPECIFIED",
                background: "TRANSPARENT",
                pixelDetail: "MEDIUM",
                groundShadow: "NONE",
              },
              userRequest: "request",
              referenceGuidance: [],
            },
            generationToken: "unused",
            compiledPrompt: "draft",
            parser: { model: "gpt-5.6-sol" },
          };
        },
        retrieve: async () => ({
          results: [
            {
              reference: {
                kind: "kenney-family",
                id: "pirate-prop",
                title: "Pirate prop",
                previewUrl: "/api/references/image?id=pirate-prop",
                pack: "Pirate Pack",
                category: "props",
                tags: ["pirate", "prop"],
                source: "Kenney",
                author: "Kenney",
                license: "CC0-1.0",
              },
              score: 90,
              matchedFields: [],
            },
          ],
        }),
        compileTask: async () => {
          throw new Error("secret provider payload");
        },
        generateImage: async () => {
          throw new Error("must not generate without a compiled token");
        },
      },
      generateBaseline: async () => ({
        imageUrl: pngDataUrl(),
        model: "gpt-image-1.5",
        createdAt: "2026-07-29T12:00:00.000Z",
      }),
    });

    assert.equal(result.records[0].baseline.status, "success");
    assert.equal(result.records[0].atlas.status, "failure");
    assert.equal(parseCount, 1);
    assert.equal(
      result.records[0].atlas.failureReason,
      "Deterministic StyleSpec merge failed.",
    );
    assert.doesNotMatch(JSON.stringify(result), /secret provider payload/);
    assert.ok(
      await fileHasPngSignature(path.join(root, "evaluation/baseline/002.png")),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generation preflight resolves only local state and requires confirmation before paid work", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-preflight-"));
  try {
    await mkdir(path.join(root, "evaluation"), { recursive: true });
    await writeFile(
      path.join(root, "evaluation/prompts.json"),
      await readFile("evaluation/prompts.json", "utf8"),
      "utf8",
    );
    const prepared = await prepareGenerationCommand({
      root,
      options: {
        limit: 3,
        confirmGeneration: false,
        force: false,
        characterId: null,
      },
      imageModel: "gpt-image-1.5",
      atlasClient: {
        listCharacters: async () => [
          { id: "character-1", name: "Evaluation Project" },
        ],
        getCharacterMetadata: async () => ({
          character: { id: "character-1" },
          memory: null,
          approvedAssets: [],
          rejectedAssets: [],
        }),
        retrieve: async () => {
          throw new Error("paid retrieval must not run during preflight");
        },
        parseTask: async () => {
          throw new Error("paid parser must not run during preflight");
        },
        compileTask: async () => {
          throw new Error("local compile must not run during preflight");
        },
        generateImage: async () => {
          throw new Error("paid image must not run during preflight");
        },
      },
    });

    assert.deepEqual(prepared.plan.calls, {
      image: 6,
      styleSpec: 3,
      embedding: 3,
      total: 12,
    });
    const summary = formatGenerationPreflight(prepared);
    assert.match(summary, /6 image API calls/);
    assert.match(summary, /3 Draft StyleSpec calls/);
    assert.match(summary, /\$0\.054 image-output floor/);
    assert.match(summary, /Cost estimate: \$0\.11–\$0\.14 USD/);
    assert.match(summary, /deterministic merge adds no paid call/i);
    assert.match(summary, /estimate/i);
    assert.throws(
      () => requireGenerationConfirmation(prepared),
      /--confirm-generation/,
    );
    let paidCallbacks = 0;
    await assert.rejects(
      () =>
        executeGenerationCommand({
          prepared,
          atlasClient: {
            listCharacters: async () => {
              paidCallbacks += 1;
              return [];
            },
            getCharacterMetadata: async () => {
              paidCallbacks += 1;
              return {};
            },
            retrieve: async () => {
              paidCallbacks += 1;
              return {};
            },
            parseTask: async () => {
              paidCallbacks += 1;
              return {};
            },
            compileTask: async () => {
              paidCallbacks += 1;
              return {};
            },
            generateImage: async () => {
              paidCallbacks += 1;
              return {};
            },
          },
          generateBaseline: async () => {
            paidCallbacks += 1;
            throw new Error("must not run");
          },
        }),
      /--confirm-generation/,
    );
    assert.equal(paidCallbacks, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generation preflight refuses a corrupt resume manifest before planning paid work", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-preflight-corrupt-"));
  try {
    await mkdir(path.join(root, "evaluation"), { recursive: true });
    await writeFile(
      path.join(root, "evaluation/prompts.json"),
      await readFile("evaluation/prompts.json", "utf8"),
      "utf8",
    );
    await writeFile(
      path.join(root, "evaluation/generation-results.json"),
      "{not-json",
      "utf8",
    );

    await assert.rejects(
      () =>
        prepareGenerationCommand({
          root,
          options: {
            limit: 3,
            confirmGeneration: false,
            force: false,
            characterId: null,
          },
          imageModel: "gpt-image-1.5",
          atlasClient: {
            listCharacters: async () => [
              { id: "character-1", name: "Evaluation Project" },
            ],
            getCharacterMetadata: async () => ({
              character: { id: "character-1" },
            }),
            retrieve: async () => {
              throw new Error("must not run");
            },
            parseTask: async () => {
              throw new Error("must not run");
            },
            compileTask: async () => {
              throw new Error("must not run");
            },
            generateImage: async () => {
              throw new Error("must not run");
            },
          },
        }),
      /generation-results\.json is unreadable; refusing to plan paid work/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generation preflight refuses to overwrite an orphaned PNG without --force", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-preflight-orphan-"));
  try {
    await mkdir(path.join(root, "evaluation/baseline"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, "evaluation/prompts.json"),
      await readFile("evaluation/prompts.json", "utf8"),
      "utf8",
    );
    await writeFile(
      path.join(root, "evaluation/baseline/001.png"),
      Buffer.from(pngDataUrl().split(",")[1], "base64"),
    );

    await assert.rejects(
      () =>
        prepareGenerationCommand({
          root,
          options: {
            limit: 1,
            confirmGeneration: false,
            force: false,
            characterId: null,
          },
          imageModel: "gpt-image-1.5",
          atlasClient: {
            listCharacters: async () => [
              { id: "character-1", name: "Evaluation Project" },
            ],
            getCharacterMetadata: async () => ({
              character: { id: "character-1" },
            }),
            retrieve: async () => {
              throw new Error("must not run");
            },
            parseTask: async () => {
              throw new Error("must not run");
            },
            compileTask: async () => {
              throw new Error("must not run");
            },
            generateImage: async () => {
              throw new Error("must not run");
            },
          },
        }),
      /orphaned evaluation PNG.*--force/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("report command writes a pending report without inventing missing results", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atlas-report-"));
  try {
    await mkdir(path.join(root, "evaluation"), { recursive: true });
    const promptSource = await readFile("evaluation/prompts.json", "utf8");
    await writeFile(
      path.join(root, "evaluation/prompts.json"),
      promptSource,
      "utf8",
    );
    const prompts = JSON.parse(promptSource);
    await writeFile(
      path.join(root, "evaluation/human-review.csv"),
      createHumanReviewCsv(prompts, new Set(), ""),
      "utf8",
    );

    const report = await runReportCommand({ root });
    assert.equal(
      await readFile(path.join(root, "evaluation/report.md"), "utf8"),
      report,
    );
    assert.match(report, /Retrieval evaluation is pending/);
    assert.match(report, /Human review: pending/i);
    assert.doesNotMatch(report, /Atlas selected/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function prompt(
  overrides: Partial<EvaluationPrompt> & Pick<EvaluationPrompt, "id">,
): EvaluationPrompt {
  return {
    category: "prop",
    prompt: `Prompt ${overrides.id}`,
    expectedPacks: ["Pirate Pack"],
    expectedTerms: ["asset"],
    irrelevantTerms: ["spaceship"],
    ...overrides,
    id: overrides.id,
  };
}

function pngDataUrl() {
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/l4eT7wAAAABJRU5ErkJggg==";
}

async function fileHasPngSignature(filePath: string) {
  const contents = await readFile(filePath);
  return contents
    .subarray(0, 8)
    .equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
}

function generationRecord(
  evaluationPrompt: EvaluationPrompt,
  config: GenerationRunConfig,
): GenerationEvaluationRecord {
  return {
    id: evaluationPrompt.id,
    category: evaluationPrompt.category,
    originalPrompt: evaluationPrompt.prompt,
    configFingerprint: config.fingerprint,
    baseline: {
      status: "pending",
      inputPrompt: evaluationPrompt.prompt,
      outputPath: `evaluation/baseline/${evaluationPrompt.id}.png`,
      durationMs: null,
      model: null,
      settings: config.image,
      failureReason: null,
    },
    atlas: {
      status: "failure",
      outputPath: `evaluation/atlas/${evaluationPrompt.id}.png`,
      durationMs: 10,
      model: null,
      settings: config.image,
      draftStatus: "success",
      draftDurationMs: 10,
      draftStyleSpec: {
        assetKind: "game prop",
        visualSubject: "wooden cannon",
        visualStyle: "painted game art",
        composition: "centered side view",
        dimensions: "1024x1024",
        background: "transparent",
        positiveConstraints: ["readable silhouette"],
        negativeConstraints: ["no text"],
        referenceAssets: [],
        assumptions: [],
        assetSettings: config.assetSettings,
        userRequest: "request",
      },
      draftParser: { model: "gpt-5.6-sol" },
      retrievalStatus: "success",
      retrievalDurationMs: 10,
      retrievalMode: "semantic",
      retrievalQuery: {
        projectBrief: config.projectBrief,
        assetRequest: evaluationPrompt.prompt,
        assetType: "PROP",
        settings: config.assetSettings,
      },
      retrievedReferences: [],
      selectedReferences: Array.from({ length: 3 }, (_, index) => {
        const number = index + 1;
        return {
          kind: "kenney-family",
          id: `reference-${number}`,
          title: `Reference ${number}`,
          previewUrl: `/api/references/image?id=reference-${number}`,
          pack: "Pirate Pack",
          category: "props",
          tags: ["pirate", "prop"],
          source: "Kenney",
          author: "Kenney",
          license: "CC0-1.0",
        };
      }),
      refinementMode: "deterministic-merge",
      refinedStatus: "failure",
      refinedDurationMs: 10,
      refinedStyleSpec: null,
      refinedParser: null,
      generationDurationMs: null,
      failureReason: "Deterministic StyleSpec merge failed.",
    },
  };
}
