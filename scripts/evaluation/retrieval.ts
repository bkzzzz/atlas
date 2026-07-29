import { execFileSync } from "node:child_process";
import {
  createAtlasHttpClient,
  runRetrievalCommand,
} from "./core";

const BASE_URL = "http://localhost:3000";

async function main() {
  const document = await runRetrievalCommand({
    client: createAtlasHttpClient(BASE_URL),
    baseUrl: BASE_URL,
    gitCommit: currentGitCommit(),
  });
  const { metrics } = document;
  process.stdout.write(
    [
      `Retrieval evaluation: ${document.status}`,
      `Prompts evaluated: ${document.records.length}`,
      `Expected-pack Top-1 match rate: ${percent(metrics.expectedPackTop1MatchRate)}`,
      `Expected-pack Precision@6: ${percent(metrics.expectedPackPrecisionAt6)}`,
      `Expected-pack Hit@6: ${percent(metrics.expectedPackHitAt6)}`,
      `Keyword fallback queries: ${metrics.fallbackCount}`,
      `Failed queries: ${metrics.failureCount}`,
      "Output: evaluation/retrieval-results.json",
    ].join("\n") + "\n",
  );
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
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
      : "Unknown retrieval evaluation error.";
  process.stderr.write(`Retrieval evaluation failed: ${message}\n`);
  process.exitCode = 1;
});
