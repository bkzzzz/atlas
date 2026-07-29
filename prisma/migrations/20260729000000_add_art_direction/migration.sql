ALTER TABLE "WorkspaceDocument" ADD COLUMN "gameDescription" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkspaceDocument" ADD COLUMN "genre" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkspaceDocument" ADD COLUMN "mood" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkspaceDocument" ADD COLUMN "targetPlatform" TEXT NOT NULL DEFAULT 'PC';
ALTER TABLE "WorkspaceDocument" ADD COLUMN "assetType" TEXT NOT NULL DEFAULT 'CHARACTER';
ALTER TABLE "WorkspaceDocument" ADD COLUMN "selectedReferenceIds" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "WorkspaceDocument" ADD COLUMN "currentStyleSpecId" TEXT;

ALTER TABLE "WorkspaceAsset" ADD COLUMN "pixelWidth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkspaceAsset" ADD COLUMN "pixelHeight" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkspaceAsset" ADD COLUMN "parentAssetId" TEXT;
ALTER TABLE "WorkspaceAsset" ADD COLUMN "operation" TEXT;

ALTER TABLE "WorkspaceNode" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkspaceNode" ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkspaceNode" ADD COLUMN "aspectLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkspaceNode" ADD COLUMN "styleSpecId" TEXT;
ALTER TABLE "WorkspaceNode" ADD COLUMN "referenceIds" TEXT NOT NULL DEFAULT '[]';

UPDATE "WorkspaceNode"
SET "aspectLocked" = true
WHERE "kind" = 'IMAGE';

CREATE TABLE "WorkspaceStyleSpec" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "styleName" TEXT NOT NULL,
    "palette" TEXT NOT NULL,
    "lineStyle" TEXT NOT NULL,
    "lighting" TEXT NOT NULL,
    "materials" TEXT NOT NULL,
    "shapeLanguage" TEXT NOT NULL,
    "detailLevel" TEXT NOT NULL,
    "compositionNotes" TEXT NOT NULL,
    "referenceIds" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceStyleSpec_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "WorkspaceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "WorkspaceReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "assetId" TEXT,
    "sourceKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "license" TEXT,
    "imageUrl" TEXT,
    "palette" TEXT NOT NULL,
    "traits" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceReference_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "WorkspaceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceReference_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "WorkspaceAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "WorkspaceStyleSpec_documentId_createdAt_idx" ON "WorkspaceStyleSpec"("documentId", "createdAt");
CREATE UNIQUE INDEX "WorkspaceReference_documentId_sourceKey_key" ON "WorkspaceReference"("documentId", "sourceKey");
CREATE INDEX "WorkspaceReference_documentId_createdAt_idx" ON "WorkspaceReference"("documentId", "createdAt");
