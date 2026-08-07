-- Existing rows remain nullable and are interpreted as legacy references.
CREATE TYPE "AssetKind" AS ENUM ('REFERENCE', 'GENERATED', 'UPLOADED');

ALTER TABLE "ImageAsset"
ADD COLUMN "kind" "AssetKind",
ADD COLUMN "anonymousOwnerKey" TEXT,
ADD COLUMN "generationRequestId" TEXT,
ADD COLUMN "model" TEXT,
ADD COLUMN "sourcePrompt" TEXT,
ADD COLUMN "compiledPrompt" TEXT,
ADD COLUMN "generationSettings" JSONB;

CREATE UNIQUE INDEX "ImageAsset_generationRequestId_key"
ON "ImageAsset"("generationRequestId");

CREATE INDEX "ImageAsset_characterId_kind_createdAt_idx"
ON "ImageAsset"("characterId", "kind", "createdAt");

CREATE INDEX "ImageAsset_anonymousOwnerKey_kind_createdAt_id_idx"
ON "ImageAsset"("anonymousOwnerKey", "kind", "createdAt", "id");
