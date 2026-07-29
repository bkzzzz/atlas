CREATE TABLE "WorkspaceDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "WorkspaceAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BLOB NOT NULL,
    "source" TEXT NOT NULL,
    "prompt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceAsset_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "WorkspaceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "WorkspaceNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "assetId" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "width" REAL NOT NULL,
    "height" REAL NOT NULL,
    "rotation" REAL NOT NULL DEFAULT 0,
    "opacity" REAL NOT NULL DEFAULT 1,
    "color" TEXT NOT NULL DEFAULT '#ffffff',
    "zIndex" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkspaceNode_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "WorkspaceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceNode_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "WorkspaceAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "WorkspaceMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "assetId" TEXT,
    "nodeId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceMessage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "WorkspaceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceMessage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "WorkspaceAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceMessage_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "WorkspaceNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "WorkspaceAsset_documentId_idx" ON "WorkspaceAsset"("documentId");
CREATE INDEX "WorkspaceNode_documentId_zIndex_idx" ON "WorkspaceNode"("documentId", "zIndex");
CREATE INDEX "WorkspaceMessage_documentId_createdAt_idx" ON "WorkspaceMessage"("documentId", "createdAt");
