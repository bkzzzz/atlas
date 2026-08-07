import assert from "node:assert/strict";
import test from "node:test";
import {
  ATLAS_DEV_BLOB_STORE_ID,
  ATLAS_WORKSPACE_DEV_DATABASE_ENDPOINT_ID,
  verifyLocalEnvironment,
  verifyRuntimeEnvironment,
} from "../src/lib/local-environment-safety";

const workspaceDatabaseUrl =
  `postgresql://user:password@${ATLAS_WORKSPACE_DEV_DATABASE_ENDPOINT_ID}-pooler.c-10.us-east-1.aws.neon.tech/neondb?sslmode=require`;
const devToken =
  `vercel_blob_rw_${ATLAS_DEV_BLOB_STORE_ID}_test-secret`;

test("localhost development mode accepts only the development resources", () => {
  assert.deepEqual(
    verifyRuntimeEnvironment({
      nodeEnv: "development",
      databaseUrl: workspaceDatabaseUrl,
      blobReadWriteToken: devToken,
      blobStoreId: `store_${ATLAS_DEV_BLOB_STORE_ID}`,
    }),
    {
      databaseEndpointId: ATLAS_WORKSPACE_DEV_DATABASE_ENDPOINT_ID,
      blobStoreId: ATLAS_DEV_BLOB_STORE_ID.toLowerCase(),
      blobAuthMode: "read-write-token",
    },
  );
});

test("localhost production mode remains protected", () => {
  assert.throws(
    () =>
      verifyRuntimeEnvironment({
        nodeEnv: "production",
        databaseUrl:
          "postgresql://user:password@ep-production-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require",
        blobReadWriteToken: devToken,
      }),
    /workspace-dev Neon endpoint/i,
  );
});

test("Vercel Production bypasses localhost resource allowlists", () => {
  assert.equal(
    verifyRuntimeEnvironment({
      nodeEnv: "production",
      vercel: "1",
      vercelEnv: "production",
      databaseUrl:
        "postgresql://user:password@ep-production-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require",
      blobReadWriteToken:
        "vercel_blob_rw_6H9nZDPCt5LrqcWa_production-secret",
    }),
    null,
  );
});

test("rejects any database endpoint other than workspace-dev", () => {
  assert.throws(
    () =>
      verifyLocalEnvironment({
        databaseUrl:
          "postgresql://user:password@ep-production-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require",
        blobReadWriteToken: devToken,
      }),
    /workspace-dev Neon endpoint/i,
  );
});

test("rejects a legacy token for any Blob store other than atlas-dev-blob", () => {
  assert.throws(
    () =>
      verifyLocalEnvironment({
        databaseUrl: workspaceDatabaseUrl,
        blobReadWriteToken:
          "vercel_blob_rw_6H9nZDPCt5LrqcWa_production-secret",
      }),
    /atlas-dev-blob/i,
  );
});

test("rejects a conflicting explicit Blob store even with the dev token", () => {
  assert.throws(
    () =>
      verifyLocalEnvironment({
        databaseUrl: workspaceDatabaseUrl,
        blobReadWriteToken: devToken,
        blobStoreId: "store_6H9nZDPCt5LrqcWa",
      }),
    /atlas-dev-blob/i,
  );
});

test("rejects a legacy token whose store identity cannot be verified", () => {
  assert.throws(
    () =>
      verifyLocalEnvironment({
        databaseUrl: workspaceDatabaseUrl,
        blobReadWriteToken: "unverifiable-token",
      }),
    /cannot verify its Blob store/i,
  );
});
