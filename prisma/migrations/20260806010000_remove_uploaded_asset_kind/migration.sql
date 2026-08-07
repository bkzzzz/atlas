-- Milestone 1 has no uploaded workspace-asset flow. Recreate the enum without
-- the unused value; PostgreSQL aborts the cast if an unexpected row uses it.
ALTER TYPE "AssetKind" RENAME TO "AssetKind_old";

CREATE TYPE "AssetKind" AS ENUM ('REFERENCE', 'GENERATED');

ALTER TABLE "ImageAsset"
ALTER COLUMN "kind" TYPE "AssetKind"
USING ("kind"::text::"AssetKind");

DROP TYPE "AssetKind_old";
