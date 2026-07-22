import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Next.js and Prisma CLI both use this ignored local configuration file.
config({ path: ".env.local" });

export default defineConfig({
  // Prisma CLI reads DATABASE_URL from the ignored .env.local file.
  schema: "prisma/schema.prisma",
  datasource: { url: env("DATABASE_URL") },
});
