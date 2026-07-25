export type PendingGeneration = {
  compiledPrompt: string;
  expiresAt: number;
};

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

  function createGenerationToken(compiledPrompt: string) {
    const token = createToken();
    pendingGenerations.set(token, { compiledPrompt, expiresAt: now() + ttlMs });
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
