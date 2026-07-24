"use client";

import { FormEvent, useState } from "react";
import type { ParsedTask } from "@/lib/task-schema";

type ParseTaskResult = {
  parsedTask: ParsedTask;
  providerInstructions: string[];
  compiledPrompt: string;
};

// This UI sends only the natural-language task to the server. API credentials
// remain server-side; the browser receives only validated task and prompt data.
export function LlmTaskParser({ characterId }: { characterId: string }) {
  const [request, setRequest] = useState("");
  const [result, setResult] = useState<ParseTaskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy prompt");

  async function parseAndCompile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsParsing(true);
      setError(null);
      setCopyLabel("Copy prompt");
      const response = await fetch(`/api/characters/${characterId}/parse-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not parse the art request.");
      setResult(payload);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Could not parse the art request.");
    } finally {
      setIsParsing(false);
    }
  }

  async function copyPrompt() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.compiledPrompt);
      setCopyLabel("Copied");
    } catch {
      setError("Could not copy the prompt. Please copy it manually.");
    }
  }

  return <section className="mt-10 max-w-4xl border-t border-white/10 pt-10"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">LLM-assisted task parser</p><h2 className="mt-1 text-xl font-semibold">Natural-language request</h2><p className="mt-1 text-sm text-slate-400">One server-side parsing call turns your request into validated compiler input. No image or animation is generated.</p></div><form className="mt-5 rounded-xl border border-white/10 bg-white/[.03] p-5" onSubmit={parseAndCompile}><label className="block text-sm font-medium">Art request<textarea required className="mt-2 min-h-28 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none placeholder:text-slate-600 focus:border-violet-400" placeholder="For example: Create a 36-frame looping walk cycle with no camera movement." value={request} onChange={(event) => setRequest(event.target.value)} /></label><div className="mt-5 flex justify-end"><button disabled={isParsing} className="rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 hover:bg-violet-400">{isParsing ? "Parsing…" : "Parse and compile"}</button></div></form>{error && <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}{result && <div className="mt-5 grid gap-4 lg:grid-cols-2"><section className="rounded-xl border border-white/10 bg-white/[.03] p-5"><h3 className="font-semibold">Parsed structured task</h3><pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-slate-950/50 p-4 text-xs leading-5 text-slate-300">{JSON.stringify(result.parsedTask, null, 2)}</pre></section><section className="rounded-xl border border-white/10 bg-white/[.03] p-5"><div className="flex items-center justify-between gap-4"><h3 className="font-semibold">Final compiled prompt</h3><button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:border-violet-400/60" onClick={() => void copyPrompt()} type="button">{copyLabel}</button></div><ul className="mt-3 space-y-1 text-sm text-slate-400">{result.providerInstructions.map((instruction) => <li key={instruction}>• {instruction}</li>)}</ul><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950/50 p-4 text-xs leading-5 text-slate-300">{result.compiledPrompt}</pre></section></div>}<p className="mt-3 text-xs text-slate-500">Manual Prompt Preview remains available below as a fallback.</p></section>;
}
