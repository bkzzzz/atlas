import { checkOpenAIConnection, classifyParserError } from "@/lib/task-parser";

// A deliberately opt-in local diagnostic endpoint. It is unavailable from a
// production build and never returns environment variables or raw API errors.
export async function GET() {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  try {
    return Response.json(await checkOpenAIConnection());
  } catch (cause) {
    const error = classifyParserError(cause);
    console.error("OpenAI development health check failed", { category: error.category, ...error.diagnostic });
    return Response.json({ configured: Boolean(process.env.OPENAI_API_KEY), ok: false, error: error.message, category: error.category, diagnostic: error.diagnostic }, { status: 502 });
  }
}
