import { formatMetadataContext } from "@/lib/providers/metadata-format";
import type { ProviderAdapter, PromptCompileInput, RikaAnimationOptions } from "@/lib/providers/types";

const defaultOptions: RikaAnimationOptions = {
  animationType: "Character motion",
  frameCount: 24,
  cameraMovementAllowed: false,
  projectileAllowed: false,
  playback: "LOOP",
  constraints: "Preserve character identity and visual continuity.",
};

export const rikaAnimationAdapter: ProviderAdapter = {
  profile: "RIKA_ANIMATION",
  compile(input: PromptCompileInput) {
    const options = input.rikaOptions ?? defaultOptions;
    const providerInstructions = [
      `Animation type: ${options.animationType}`,
      `Frame count: ${options.frameCount}`,
      `Camera movement: ${options.cameraMovementAllowed ? "allowed" : "not allowed"}`,
      `Projectile: ${options.projectileAllowed ? "allowed" : "not allowed"}`,
      `Playback: ${options.playback === "LOOP" ? "loop" : "one-shot"}`,
      `Constraints: ${options.constraints || "None"}`,
    ];
    const compiledPrompt = [
      "Create a character animation.",
      ...formatMetadataContext(input.metadata),
      `User request: ${input.userRequest.trim()}`,
      "RIKA animation options:",
      ...providerInstructions,
    ].join("\n");

    return { provider: "RIKA_ANIMATION", providerInstructions, compiledPrompt };
  },
};
