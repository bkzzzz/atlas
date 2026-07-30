export type PendingGeneration = {
  compiledPrompt: string;
  background: GenerationBackground;
  referenceFamilyIds: readonly string[];
  generationMode: GenerationMode;
  expiresAt: number;
};

export type GenerationBackground = "opaque" | "transparent";
export type GenerationMode = "text-only" | "visual-reference";

export type GenerationSessionOptions = {
  now?: () => number;
  createToken?: () => string;
  ttlMs?: number;
};

const SESSION_TTL_MS = 10 * 60 * 1000;

// This short-lived, process-local token confirms that the server has already
// parsed and compiled a STATIC_IMAGE request before any paid API call. It is
// deleted before use so failed calls and concurrent attempts stay one-time.
export function createGenerationSession(options: GenerationSessionOptions = {}) {
  const pendingGenerations = new Map<string, PendingGeneration>();
  const now = options.now ?? Date.now;
  const createToken = options.createToken ?? crypto.randomUUID;
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;

  function createGenerationToken(
    compiledPrompt: string,
    background: GenerationBackground = "opaque",
    referenceFamilyIds: readonly string[] = [],
  ) {
    const stableReferenceFamilyIds = validatedReferenceFamilyIds(
      referenceFamilyIds,
    );
    const token = createToken();
    pendingGenerations.set(token, {
      compiledPrompt,
      background,
      referenceFamilyIds: stableReferenceFamilyIds,
      generationMode:
        stableReferenceFamilyIds.length === 0
          ? "text-only"
          : "visual-reference",
      expiresAt: now() + ttlMs,
    });
    return token;
  }

  function consumeGenerationToken(token: string) {
    const pending = pendingGenerations.get(token);
    // Delete first so both successful and failed upstream requests are
    // permanently one-time. This also makes concurrent attempts race-safe in
    // a single JavaScript process.
    pendingGenerations.delete(token);
    if (!pending || pending.expiresAt <= now()) return null;
    return pending;
  }

  return { createGenerationToken, consumeGenerationToken };
}

const defaultGenerationSession = createGenerationSession();

export const createGenerationToken = defaultGenerationSession.createGenerationToken;
export const consumeGenerationToken = defaultGenerationSession.consumeGenerationToken;

function validatedReferenceFamilyIds(referenceFamilyIds: readonly string[]) {
  const normalized = referenceFamilyIds.map((id) => id.trim());
  if (
    normalized.length > 3 ||
    normalized.some((id) => !id) ||
    new Set(normalized).size !== normalized.length
  ) {
    throw new Error(
      "Visual generation requires one to three unique reference family IDs.",
    );
  }
  return Object.freeze(
    [...normalized].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}
