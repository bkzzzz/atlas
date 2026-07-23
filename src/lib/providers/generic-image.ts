import { formatMetadataContext } from "@/lib/providers/metadata-format";
import type { ProviderAdapter, PromptCompileInput } from "@/lib/providers/types";

export const genericImageAdapter: ProviderAdapter = {
  profile: "GENERIC_IMAGE",
  compile(input: PromptCompileInput) {
    const providerInstructions = [
      "Create one coherent still image.",
      "Preserve character identity, memory, and approved references.",
      "Avoid rejected-reference feedback.",
    ];
    const compiledPrompt = [
      "Create a still character image.",
      ...formatMetadataContext(input.metadata),
      `User request: ${input.userRequest.trim()}`,
      `Provider rules: ${providerInstructions.join(" ")}`,
    ].join("\n");

    return { provider: "GENERIC_IMAGE", providerInstructions, compiledPrompt };
  },
};
