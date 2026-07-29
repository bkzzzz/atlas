import test from "node:test";
import { runServerOnlyTest } from "./server-test-runner";

test("the server-only reference compositor contract passes", () => {
  runServerOnlyTest(
    new URL("./server-cases/reference-compositor.case.ts", import.meta.url),
  );
});
