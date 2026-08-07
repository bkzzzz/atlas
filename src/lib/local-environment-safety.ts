export const ATLAS_WORKSPACE_DEV_DATABASE_ENDPOINT_ID =
  "ep-spring-queen-au96tm93";
export const ATLAS_DEV_BLOB_STORE_ID = "twTIlpTUvmLt7VCW";

type LocalEnvironment = Readonly<{
  databaseUrl?: string;
  blobReadWriteToken?: string;
  blobStoreId?: string;
}>;

type RuntimeEnvironment = LocalEnvironment &
  Readonly<{
    nodeEnv?: string;
    vercel?: string;
    vercelEnv?: string;
  }>;

type VerifiedLocalEnvironment = Readonly<{
  databaseEndpointId: string;
  blobStoreId: string;
  blobAuthMode: "read-write-token";
}>;

export function verifyLocalEnvironment(
  environment: LocalEnvironment,
): VerifiedLocalEnvironment {
  const databaseEndpointId = databaseEndpointIdFromUrl(
    environment.databaseUrl,
  );
  if (databaseEndpointId !== ATLAS_WORKSPACE_DEV_DATABASE_ENDPOINT_ID) {
    throw unsafeEnvironmentError(
      `DATABASE_URL must use the workspace-dev Neon endpoint ${ATLAS_WORKSPACE_DEV_DATABASE_ENDPOINT_ID}; received ${databaseEndpointId}.`,
    );
  }

  const configuredStoreId = normalizeStoreId(environment.blobStoreId);
  if (
    configuredStoreId &&
    configuredStoreId !== ATLAS_DEV_BLOB_STORE_ID.toLowerCase()
  ) {
    throw unsafeEnvironmentError(
      `BLOB_STORE_ID must identify atlas-dev-blob (${ATLAS_DEV_BLOB_STORE_ID}); received ${configuredStoreId}.`,
    );
  }

  const blobReadWriteToken = environment.blobReadWriteToken?.trim();
  if (!blobReadWriteToken) {
    throw unsafeEnvironmentError(
      "Configure the atlas-dev-blob BLOB_READ_WRITE_TOKEN.",
    );
  }
  const tokenStoreId = storeIdFromLegacyToken(blobReadWriteToken);
  if (!tokenStoreId) {
    throw unsafeEnvironmentError(
      "BLOB_READ_WRITE_TOKEN cannot verify its Blob store identity.",
    );
  }
  if (tokenStoreId !== ATLAS_DEV_BLOB_STORE_ID.toLowerCase()) {
    throw unsafeEnvironmentError(
      `BLOB_READ_WRITE_TOKEN must belong to atlas-dev-blob (${ATLAS_DEV_BLOB_STORE_ID}); received ${tokenStoreId}.`,
    );
  }
  return {
    databaseEndpointId,
    blobStoreId: tokenStoreId,
    blobAuthMode: "read-write-token",
  };
}

export function verifyRuntimeEnvironment(
  environment: RuntimeEnvironment = processRuntimeEnvironment(),
) {
  if (
    environment.vercel === "1" &&
    ["production", "preview", "development"].includes(
      environment.vercelEnv ?? "",
    )
  ) {
    return null;
  }
  return verifyLocalEnvironment(environment);
}

function processRuntimeEnvironment(): RuntimeEnvironment {
  return {
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    databaseUrl: process.env.DATABASE_URL,
    blobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN,
    blobStoreId: process.env.BLOB_STORE_ID,
  };
}

function databaseEndpointIdFromUrl(value: string | undefined) {
  if (!value?.trim()) {
    throw unsafeEnvironmentError("DATABASE_URL is missing.");
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      throw new Error("unsupported protocol");
    }
    return url.hostname.split(".", 1)[0]?.replace(/-pooler$/, "") ?? "";
  } catch {
    throw unsafeEnvironmentError("DATABASE_URL is not a valid PostgreSQL URL.");
  }
}

function normalizeStoreId(value: string | undefined) {
  return value?.trim().replace(/^store_/i, "").toLowerCase() ?? "";
}

function storeIdFromLegacyToken(token: string) {
  const parts = token.split("_");
  if (
    parts.length < 5 ||
    parts[0] !== "vercel" ||
    parts[1] !== "blob" ||
    parts[2] !== "rw"
  ) {
    return "";
  }
  return normalizeStoreId(parts[3]);
}

function unsafeEnvironmentError(message: string) {
  return new Error(`Unsafe local environment: ${message}`);
}
