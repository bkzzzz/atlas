import { runReportCommand } from "./core";

async function main() {
  await runReportCommand();
  process.stdout.write("Evaluation report: evaluation/report.md\n");
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown report generation error.";
  process.stderr.write(`Evaluation report failed: ${message}\n`);
  process.exitCode = 1;
});
