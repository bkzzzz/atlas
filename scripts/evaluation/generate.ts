import { execFileSync } from "node:child_process";
import OpenAI from "openai";
import {
  generateImageFromCompiledPrompt,
  type ImageApiClient,
} from "@/lib/image-generation-core";
import {
  EVALUATION_IMAGE_MODEL,
  EVALUATION_TASK_MODEL,
  createAtlasHttpClient,
  executeGenerationCommand,
  formatGenerationPreflight,
  parseGenerationArguments,
  prepareGenerationCommand,
  requireGenerationConfirmation,
} from "./core";

const BASE_URL = "http://localhost:3000";

async function main() {
  const options = parseGenerationArguments(process.argv.slice(2));
  const imageModel = process.env.OPENAI_IMAGE_MODEL?.trim();
  if (!imageModel) {
    throw new Error(
      "OPENAI_IMAGE_MODEL is required to freeze matching image settings.",
    );
  }
  if (imageModel !== EVALUATION_IMAGE_MODEL) {
    throw new Error(
      `This frozen evaluation requires OPENAI_IMAGE_MODEL=${EVALUATION_IMAGE_MODEL}.`,
    );
  }
  const parserModel =
    process.env.OPENAI_TASK_PARSER_MODEL?.trim() ||
    EVALUATION_TASK_MODEL;
  if (parserModel !== EVALUATION_TASK_MODEL) {
    throw new Error(
      `This frozen evaluation requires OPENAI_TASK_PARSER_MODEL=${EVALUATION_TASK_MODEL} (or unset).`,
    );
  }

  const atlasClient = createAtlasHttpClient(BASE_URL);
  const prepared = await prepareGenerationCommand({
    options,
    imageModel,
    atlasClient,
  });
  process.stdout.write(`${formatGenerationPreflight(prepared)}\n`);
  requireGenerationConfirmation(prepared);

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const baselinePending = prepared.plan.items.some(
    ({ stages }) => stages.baseline,
  );
  if (baselinePending && !apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required for pending Baseline image generation.",
    );
  }

  const document = await executeGenerationCommand({
    prepared,
    atlasClient,
    gitCommit: currentGitCommit(),
    generateBaseline: (originalPrompt, background) =>
      generateImageFromCompiledPrompt(originalPrompt, {
        apiKey,
        model: prepared.config.image.model,
        background,
        timeoutMs: 60_000,
        createClient: (key): ImageApiClient =>
          new OpenAI({
            apiKey: key,
            timeout: 60_000,
            maxRetries: 0,
          }),
      }),
  });

  process.stdout.write(
    [
      `Generation evaluation: ${document.status}`,
      `Successful pairs: ${document.summary.successfulPairCount}/${document.summary.datasetSize}`,
      `Baseline outputs: ${document.summary.baselineSuccessCount}`,
      `Atlas outputs: ${document.summary.atlasSuccessCount}`,
      "Outputs: evaluation/baseline/, evaluation/atlas/, evaluation/review/",
      "Review sheet: evaluation/human-review.csv",
    ].join("\n") + "\n",
  );
}

function currentGitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown paired generation evaluation error.";
  process.stderr.write(`Generation evaluation failed: ${message}\n`);
  process.exitCode = 1;
});
