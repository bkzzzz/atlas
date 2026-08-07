import { loadEnvConfig } from "@next/env";
import { verifyLocalEnvironment } from "../src/lib/local-environment-safety";

loadEnvConfig(process.cwd());

const verified = verifyLocalEnvironment({
  databaseUrl: process.env.DATABASE_URL,
  blobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN,
  blobStoreId: process.env.BLOB_STORE_ID,
});

console.log(
  `Local isolation verified: Neon ${verified.databaseEndpointId}; Blob ${verified.blobStoreId}; auth ${verified.blobAuthMode}.`,
);
