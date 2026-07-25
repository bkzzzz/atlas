import OpenAI from "openai";

export type ImageGenerationErrorCategory =
  | "insufficient_quota"
  | "rate_limit_exceeded"
  | "model_not_found"
  | "permission_or_model_access"
  | "authentication_error"
  | "timeout"
  | "unknown_upstream_error"
  | "not_configured";

export type ImageGenerationDiagnostic = {
  code: string | null;
  type: string | null;
  status: number | null;
  requestId: string | null;
};

export class ImageGenerationError extends Error {
  constructor(
    public readonly category: ImageGenerationErrorCategory,
    public readonly diagnostic: ImageGenerationDiagnostic = {
      code: null,
      type: null,
      status: null,
      requestId: null,
    },
  ) {
    super(safeImageGenerationMessage(category));
  }
}

export type GeneratedImage = {
  imageUrl: string;
  model: string;
  createdAt: string;
};

export type ImageApiClient = {
  images: {
    generate: (
      request: OpenAI.Images.ImageGenerateParamsNonStreaming,
      options?: { signal?: AbortSignal },
    ) => Promise<unknown>;
  };
};

export type ImageGenerationDependencies = {
  apiKey: string | undefined;
  model: string | undefined;
  createClient: (apiKey: string) => ImageApiClient;
  now?: () => Date;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 60_000;

export function safeImageGenerationMessage(category: ImageGenerationErrorCategory) {
  return {
    insufficient_quota: "API quota unavailable. Check your API billing and try again.",
    rate_limit_exceeded: "Rate limit reached; retry later.",
    model_not_found: "Requested model is unavailable.",
    permission_or_model_access: "The API key cannot access the requested model.",
    authentication_error: "API key is invalid or inaccessible.",
    timeout: "Image generation timed out. Please parse and compile again before retrying.",
    not_configured: "Image generation is not configured on this server.",
    unknown_upstream_error: "Could not generate the image. Parse and compile again before retrying.",
  }[category];
}

// OpenAI's SDK error object carries code/type/status/request ID separately.
// Preserve only those non-secret diagnostics for server-side development logs.
export function classifyImageGenerationError(error: unknown): ImageGenerationError {
  if (error instanceof ImageGenerationError) return error;

  const apiError = error instanceof OpenAI.APIError ? error : null;
  const diagnostic: ImageGenerationDiagnostic = apiError
    ? {
        code: apiError.code ?? null,
        type: apiError.type ?? null,
        status: apiError.status ?? null,
        requestId: apiError.requestID ?? null,
      }
    : { code: null, type: null, status: null, requestId: null };

  if (
    error instanceof OpenAI.APIConnectionTimeoutError ||
    error instanceof OpenAI.APIUserAbortError ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return new ImageGenerationError("timeout", diagnostic);
  }
  if (diagnostic.code === "insufficient_quota" || diagnostic.type === "insufficient_quota") {
    return new ImageGenerationError("insufficient_quota", diagnostic);
  }
  if (diagnostic.code === "rate_limit_exceeded" || diagnostic.type === "rate_limit_exceeded") {
    return new ImageGenerationError("rate_limit_exceeded", diagnostic);
  }
  if (diagnostic.code === "model_not_found" || diagnostic.type === "model_not_found" || diagnostic.status === 404) {
    return new ImageGenerationError("model_not_found", diagnostic);
  }
  if (diagnostic.status === 401) return new ImageGenerationError("authentication_error", diagnostic);
  if (diagnostic.status === 403) return new ImageGenerationError("permission_or_model_access", diagnostic);
  return new ImageGenerationError("unknown_upstream_error", diagnostic);
}

function validBase64(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized) return false;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return false;
  const firstPadding = normalized.indexOf("=");
  if (firstPadding !== -1 && firstPadding < normalized.length - (normalized.endsWith("==") ? 2 : 1)) return false;
  const unpaddedLength = normalized.replace(/=+$/, "").length;
  // OpenAI currently returns standard padded base64, but accepting a valid
  // unpadded form avoids rejecting a future standards-compliant response.
  return unpaddedLength % 4 !== 1 && (firstPadding === -1 || normalized.length % 4 === 0);
}

function imageBase64From(response: unknown) {
  if (!response || typeof response !== "object" || Array.isArray(response)) return null;
  const data = (response as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== "object") return null;
  const image = (data[0] as { b64_json?: unknown }).b64_json;
  return validBase64(image) ? image.trim() : null;
}

// This pure, dependency-injected core is deliberately independent from
// environment variables. The server-only wrapper supplies the credential and
// production SDK client; tests supply a mocked client and make no network call.
export async function generateImageFromCompiledPrompt(
  compiledPrompt: string,
  dependencies: ImageGenerationDependencies,
): Promise<GeneratedImage> {
  const apiKey = dependencies.apiKey?.trim();
  const model = dependencies.model?.trim();
  if (!apiKey || !model) throw new ImageGenerationError("not_configured");

  try {
    const response = await dependencies.createClient(apiKey).images.generate(
      {
        model: model as OpenAI.Images.ImageModel,
        prompt: compiledPrompt,
        n: 1,
        size: "1024x1024",
        quality: "low",
        background: "opaque",
        output_format: "png",
      },
      { signal: AbortSignal.timeout(dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS) },
    );
    const image = imageBase64From(response);
    if (!image) throw new ImageGenerationError("unknown_upstream_error");

    return {
      imageUrl: `data:image/png;base64,${image}`,
      model,
      createdAt: (dependencies.now ?? (() => new Date()))().toISOString(),
    };
  } catch (error) {
    throw classifyImageGenerationError(error);
  }
}
