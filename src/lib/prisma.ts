import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";
import { verifyRuntimeEnvironment } from "@/lib/local-environment-safety";

// A single Prisma client is reused during development so hot reloads do not
// create a new database connection for every file change.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

verifyRuntimeEnvironment();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing. Add it to .env.local.");
}

const adapter = new PrismaNeon({ connectionString: databaseUrl });

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
