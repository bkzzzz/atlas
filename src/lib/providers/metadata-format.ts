import type { CharacterMetadata } from "@/lib/metadata-builder";

// Shared stable formatting keeps provider adapters focused on their own rules.
export function formatMetadataContext(metadata: CharacterMetadata) {
  const memory = metadata.memory;
  const approvedAssets = metadata.approvedAssets.length
    ? metadata.approvedAssets.map((asset) => `${asset.name} (${asset.type}, ${asset.provider})`).join("; ")
    : "None";
  const rejectedAssets = metadata.rejectedAssets.length
    ? metadata.rejectedAssets.map((asset) => `${asset.name}: ${asset.feedback ?? "No feedback recorded"}`).join("; ")
    : "None";

  return [
    `Character: ${metadata.character.name}`,
    `Species: ${metadata.character.species}`,
    `Description: ${metadata.character.description}`,
    `Personality: ${metadata.character.personality}`,
    `Visual style: ${memory?.visualStyle ?? "Not specified"}`,
    `Lore: ${memory?.lore ?? "Not specified"}`,
    `Design rules: ${memory?.designRules ?? "Not specified"}`,
    `Preferred prompt context: ${memory?.preferredPrompt ?? "Not specified"}`,
    `Approved visual references: ${approvedAssets}`,
    `Avoid rejected references: ${rejectedAssets}`,
  ];
}
