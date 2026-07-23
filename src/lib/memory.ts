// A serializable shape shared by the memory API and its Client Component.
export type CharacterMemory = {
  id: string;
  characterId: string;
  visualStyle: string | null;
  lore: string | null;
  designRules: string | null;
  approvedSummary: string | null;
  rejectedSummary: string | null;
  preferredPrompt: string | null;
  lastUpdated: string;
};

export type CharacterMemoryInput = Omit<
  CharacterMemory,
  "id" | "characterId" | "lastUpdated"
>;
