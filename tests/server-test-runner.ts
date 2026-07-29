import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function runServerOnlyTest(caseUrl: URL) {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const tsxCli = fileURLToPath(
    new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url),
  );
  const nextCompiled = fileURLToPath(
    new URL("../node_modules/next/dist/compiled", import.meta.url),
  );
  execFileSync(
    process.execPath,
    ["--conditions=react-server", tsxCli, "--test", fileURLToPath(caseUrl)],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_PATH: [nextCompiled, process.env.NODE_PATH]
          .filter(Boolean)
          .join(":"),
      },
      stdio: "pipe",
    },
  );
}
