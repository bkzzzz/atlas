ALTER TABLE "WorkspaceDocument" ADD COLUMN "directionRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "WorkspaceAsset" ADD COLUMN "operationParameters" TEXT;
