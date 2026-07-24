type PendingGeneration = { compiledPrompt: string; expiresAt: number };

const pendingGenerations = new Map<string, PendingGeneration>();
const SESSION_TTL_MS = 10 * 60 * 1000;

// This short-lived, process-local token is intentionally not persistence. It
// proves that a valid parser/compiler result existed before a paid generation.
export function createGenerationToken(compiledPrompt: string) {
  const token = crypto.randomUUID();
  pendingGenerations.set(token, { compiledPrompt, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

// Consume before contacting OpenAI so the token cannot be charged twice, even
// if the browser retries after a network error.
export function consumeGenerationToken(token: string) {
  const pending = pendingGenerations.get(token);
  pendingGenerations.delete(token);
  if (!pending || pending.expiresAt < Date.now()) return null;
  return pending;
}
