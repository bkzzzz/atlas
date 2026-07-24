import "server-only";
import OpenAI from "openai";
import { taskSchema, type ParsedTask, validateParsedTask } from "@/lib/task-schema";

export type { ParsedTask } from "@/lib/task-schema";

const DEFAULT_MODEL = "gpt-5.6-sol";
const PARSER_TIMEOUT_MS = 15_000;
const INPUT_COST_PER_MILLION = 5;
const OUTPUT_COST_PER_MILLION = 30;

export type ParserErrorCategory = "insufficient_quota" | "rate_limit_exceeded" | "model_not_found" | "permission_or_model_access" | "authentication_error" | "timeout" | "malformed_structured_output" | "unknown_upstream_error" | "not_configured";
export type ParserDiagnostic = { code: string | null; type: string | null; status: number | null; requestId: string | null };

export class TaskParserError extends Error {
  constructor(public readonly category: ParserErrorCategory, public readonly diagnostic: ParserDiagnostic = { code: null, type: null, status: null, requestId: null }) {
    super(safeMessageFor(category));
  }
}

export function getTaskParserModel() { return process.env.OPENAI_TASK_PARSER_MODEL?.trim() || DEFAULT_MODEL; }
export function safeMessageFor(category: ParserErrorCategory) {
  return ({ insufficient_quota: "API quota unavailable. Check your API billing and try again.", rate_limit_exceeded: "Rate limit reached; retry later.", model_not_found: "Requested model is unavailable.", permission_or_model_access: "The API key cannot access the requested model.", authentication_error: "API key is invalid or inaccessible.", timeout: "The parser timed out. Please try again.", malformed_structured_output: "The parser returned an invalid structured task. Please try again.", not_configured: "The task parser is not configured on this server.", unknown_upstream_error: "Could not parse the art request. Please try again." })[category];
}

export function classifyParserError(error: unknown): TaskParserError {
  if (error instanceof TaskParserError) return error;
  const apiError = error instanceof OpenAI.APIError ? error : null;
  const diagnostic: ParserDiagnostic = apiError ? { code: apiError.code ?? null, type: apiError.type ?? null, status: apiError.status ?? null, requestId: apiError.requestID ?? null } : { code: null, type: null, status: null, requestId: null };
  if (error instanceof OpenAI.APIConnectionTimeoutError || error instanceof OpenAI.APIUserAbortError || (error instanceof Error && error.name === "AbortError")) return new TaskParserError("timeout", diagnostic);
  if (diagnostic.code === "insufficient_quota" || diagnostic.type === "insufficient_quota") return new TaskParserError("insufficient_quota", diagnostic);
  if (diagnostic.code === "rate_limit_exceeded" || diagnostic.type === "rate_limit_exceeded") return new TaskParserError("rate_limit_exceeded", diagnostic);
  if (diagnostic.code === "model_not_found" || diagnostic.type === "model_not_found" || diagnostic.status === 404) return new TaskParserError("model_not_found", diagnostic);
  if (diagnostic.status === 401) return new TaskParserError("authentication_error", diagnostic);
  if (diagnostic.status === 403) return new TaskParserError("permission_or_model_access", diagnostic);
  return new TaskParserError("unknown_upstream_error", diagnostic);
}

export type ParserUsage = { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number };
export type ParseArtTaskResult = { parsedTask: ParsedTask; model: string; requestId: string | null; usage: ParserUsage };

function usageFrom(response: { usage?: { input_tokens: number; output_tokens: number; total_tokens: number } | null }) {
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  return { inputTokens, outputTokens, totalTokens: response.usage?.total_tokens ?? inputTokens + outputTokens, estimatedCostUsd: Number(((inputTokens * INPUT_COST_PER_MILLION + outputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000).toFixed(8)) };
}

function createClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new TaskParserError("not_configured");
  return new OpenAI({ apiKey, timeout: PARSER_TIMEOUT_MS, maxRetries: 0 });
}

// Exactly one Responses API call per parser invocation. There are no automatic
// retries: retrying an uncertain upstream request can create duplicate charges.
export async function parseArtTask(request: string): Promise<ParseArtTaskResult> {
  try {
    const response = await createClient().responses.create({
      model: getTaskParserModel(), store: false, max_output_tokens: 500,
      instructions: "Extract one game-art production task. Return only the supplied JSON schema. Preserve stated requirements; make conservative assumptions only when needed. Choose RIKA_ANIMATION only when the user explicitly requests animation, video, frames, looping, or time-based motion. A rotating, flying, moving, or posed subject in one still image is GENERIC_IMAGE + generate.",
      input: request,
      text: { format: { type: "json_schema", name: "atlas_art_task", strict: true, schema: taskSchema } },
    }, { signal: AbortSignal.timeout(PARSER_TIMEOUT_MS) });
    let output: unknown;
    try { output = JSON.parse(response.output_text); } catch { throw new TaskParserError("malformed_structured_output", { code: null, type: null, status: null, requestId: response._request_id ?? null }); }
    const parsedTask = validateParsedTask(output, request);
    if (!parsedTask) throw new TaskParserError("malformed_structured_output", { code: null, type: null, status: null, requestId: response._request_id ?? null });
    return { parsedTask, model: response.model, requestId: response._request_id ?? null, usage: usageFrom(response) };
  } catch (error) { throw classifyParserError(error); }
}

// Deliberately local-development only (enforced by its route). It performs one
// minimal Structured Outputs call and returns no credential or provider body.
export async function checkOpenAIConnection() {
  try {
    const response = await createClient().responses.create({ model: getTaskParserModel(), store: false, max_output_tokens: 64, instructions: "Return only the required JSON.", input: "health check", text: { format: { type: "json_schema", name: "atlas_health", strict: true, schema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean" } }, required: ["ok"] } } } }, { signal: AbortSignal.timeout(PARSER_TIMEOUT_MS) });
    const output = JSON.parse(response.output_text) as unknown;
    if (!output || typeof output !== "object" || Array.isArray(output) || (output as { ok?: unknown }).ok !== true) throw new TaskParserError("malformed_structured_output", { code: null, type: null, status: null, requestId: response._request_id ?? null });
    return { configured: true, sdkAccess: true, model: response.model, structuredOutput: true, requestId: response._request_id ?? null, usage: usageFrom(response) };
  } catch (error) { throw classifyParserError(error); }
}
