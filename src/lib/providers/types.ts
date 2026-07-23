import type { CharacterMetadata } from "@/lib/metadata-builder";

export const PROVIDERS = ["GENERIC_IMAGE", "RIKA_ANIMATION"] as const;
export type ProviderProfile = (typeof PROVIDERS)[number];

export type RikaAnimationOptions = {
  animationType: string;
  frameCount: number;
  cameraMovementAllowed: boolean;
  projectileAllowed: boolean;
  playback: "LOOP" | "ONE_SHOT";
  constraints: string;
};

export type PromptCompileInput = {
  metadata: CharacterMetadata;
  userRequest: string;
  rikaOptions?: RikaAnimationOptions;
};

export type CompiledPrompt = {
  provider: ProviderProfile;
  providerInstructions: string[];
  compiledPrompt: string;
};

export type ProviderAdapter = {
  profile: ProviderProfile;
  compile(input: PromptCompileInput): CompiledPrompt;
};
