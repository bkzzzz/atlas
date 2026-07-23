-- Each character may have one durable, manually maintained memory record.
CREATE TABLE "CharacterMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "visualStyle" TEXT,
    "lore" TEXT,
    "designRules" TEXT,
    "approvedSummary" TEXT,
    "rejectedSummary" TEXT,
    "preferredPrompt" TEXT,
    "lastUpdated" DATETIME NOT NULL,
    CONSTRAINT "CharacterMemory_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CharacterMemory_characterId_key" ON "CharacterMemory"("characterId");
