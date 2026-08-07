import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkspaceAssetReader,
  WORKSPACE_ASSET_LIMIT,
} from "../src/lib/workspace-assets-core";

test("workspace queries only the current anonymous owner's generated assets", async () => {
  const queries: unknown[] = [];
  const listAssets = createWorkspaceAssetReader({
    findAssets: async (ownerKey, limit) => {
      queries.push({ ownerKey, limit });
      return [];
    },
  });

  assert.deepEqual(await listAssets("owner-key"), []);
  assert.deepEqual(queries, [{
    ownerKey: "owner-key",
    limit: WORKSPACE_ASSET_LIMIT,
  }]);
});

test("workspace does not query or create ownership for a missing owner key", async () => {
  let calls = 0;
  const listAssets = createWorkspaceAssetReader({
    findAssets: async () => {
      calls += 1;
      return [];
    },
  });

  assert.deepEqual(await listAssets(""), []);
  assert.equal(calls, 0);
});
