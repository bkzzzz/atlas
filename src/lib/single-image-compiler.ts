import type { CharacterMetadata } from "@/lib/metadata-builder";
import type { ParsedStaticImageTask } from "@/lib/task-schema";

export type CompiledStaticImagePrompt = {
  compilerInstructions: string[];
  compiledPrompt: string;
};

function formatMetadataContext(metadata: CharacterMetadata) {
  const memory = metadata.memory;
  const approvedAssets = metadata.approvedAssets.length
    ? metadata.approvedAssets
        .map((asset) => `${asset.name} (${asset.type}, ${asset.provider})`)
        .join("; ")
    : "None";
  const rejectedAssets = metadata.rejectedAssets.length
    ? metadata.rejectedAssets
        .map((asset) => `${asset.name}: ${asset.feedback ?? "No feedback recorded"}`)
        .join("; ")
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

function formatList(items: string[]) {
  return items.length ? items.join("; ") : "None";
}

// This is intentionally the only deterministic prompt compiler for the MVP.
// The selected-mode route calls it only after STATIC_IMAGE parsing succeeds.
export function compileSingleStaticImageTask(
  task: ParsedStaticImageTask,
  metadata: CharacterMetadata,
): CompiledStaticImagePrompt {
  const compilerInstructions = [
    "Create exactly one coherent still image.",
    "Preserve character identity, memory, and approved references.",
    "Avoid rejected-reference feedback.",
  ];
  const compiledPrompt = [
    "Create a still character image.",
    ...formatMetadataContext(metadata),
    `User request: ${task.userRequest.trim()}`,
    `Asset kind: ${task.assetKind}`,
    `Visual subject: ${task.visualSubject}`,
    `Visual style: ${task.visualStyle}`,
    `Composition: ${task.composition}`,
    `Dimensions: ${task.dimensions}`,
    `Background: ${task.background}`,
    `Positive constraints: ${formatList(task.positiveConstraints)}`,
    `Negative constraints: ${formatList(task.negativeConstraints)}`,
    `Reference assets: ${formatList(task.referenceAssets)}`,
    `Assumptions: ${formatList(task.assumptions)}`,
    `Compiler rules: ${compilerInstructions.join(" ")}`,
  ].join("\n");

  return { compilerInstructions, compiledPrompt };
}
