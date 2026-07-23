import { genericImageAdapter } from "@/lib/providers/generic-image";
import { rikaAnimationAdapter } from "@/lib/providers/rika-animation";
import type { ProviderAdapter, ProviderProfile } from "@/lib/providers/types";

const adapters: Record<ProviderProfile, ProviderAdapter> = {
  GENERIC_IMAGE: genericImageAdapter,
  RIKA_ANIMATION: rikaAnimationAdapter,
};

// New providers only need their own adapter and one registration entry here.
export function getProviderAdapter(provider: ProviderProfile) {
  return adapters[provider];
}
