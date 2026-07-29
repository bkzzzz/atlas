import test from "node:test";
import { runServerOnlyTest } from "./server-test-runner";

test("the server-only workspace upload contract passes", () => {
  runServerOnlyTest(
    new URL("./server-cases/workspace-upload.case.ts", import.meta.url),
  );
});
