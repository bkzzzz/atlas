"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import type { ParsedTask } from "@/lib/task-schema";

type GeneratedImage = { imageUrl: string; model: string; compiledPrompt: string; createdAt: string };
type ParseTaskResult = { parsedTask: ParsedTask; providerInstructions: string[]; compiledPrompt: string; generationToken: string | null };

// Parsing and generation are separate deliberate actions. The latter receives
// only a one-time server token, never an API key or browser-built prompt.
export function LlmTaskParser({ characterId }: { characterId: string }) {
  const [request, setRequest] = useState("");
  const [result, setResult] = useState<ParseTaskResult | null>(null);
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy prompt");

  async function parseAndCompile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsParsing(true); setError(null); setImage(null); setCopyLabel("Copy prompt");
      const response = await fetch(`/api/characters/${characterId}/parse-task`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not parse the art request.");
      setResult(payload);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Could not parse the art request.");
    } finally { setIsParsing(false); }
  }

  async function generateImage() {
    if (!result?.generationToken) return;
    try {
      setIsGenerating(true); setError(null);
      const response = await fetch("/api/generate-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generationToken: result.generationToken }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not generate the image.");
      setImage(payload.image);
      setResult((current) => current ? { ...current, generationToken: null } : current);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Could not generate the image.");
      // The token was consumed before the paid request, so a fresh compile is
      // required after an uncertain upstream failure to prevent duplicate cost.
      setResult((current) => current ? { ...current, generationToken: null } : current);
    } finally { setIsGenerating(false); }
  }

  async function copyPrompt() {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.compiledPrompt); setCopyLabel("Copied"); }
    catch { setError("Could not copy the prompt. Please copy it manually."); }
  }

  const canGenerate = result?.parsedTask.provider === "GENERIC_IMAGE" && result.parsedTask.operation === "generate" && Boolean(result.generationToken);

  return <section className="mt-10 max-w-4xl border-t border-white/10 pt-10">
    <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">LLM-assisted task parser</p><h2 className="mt-1 text-xl font-semibold">Natural-language request</h2><p className="mt-1 text-sm text-slate-400">Parse and compile first. Image generation is a separate, one-time server-side action.</p></div>
    <form className="mt-5 rounded-xl border border-white/10 bg-white/[.03] p-5" onSubmit={parseAndCompile}><label className="block text-sm font-medium">Art request<textarea required className="mt-2 min-h-28 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none placeholder:text-slate-600 focus:border-violet-400" placeholder="For example: Create a pixel-art character portrait on a white background." value={request} onChange={(event) => setRequest(event.target.value)} /></label><div className="mt-5 flex justify-end"><button disabled={isParsing || isGenerating} className="rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60">{isParsing ? "Parsing…" : "Parse and compile"}</button></div></form>
    {error && <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
    {result && <div className="mt-5 grid gap-4 lg:grid-cols-2"><section className="rounded-xl border border-white/10 bg-white/[.03] p-5"><h3 className="font-semibold">Parsed structured task</h3><pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-slate-950/50 p-4 text-xs leading-5 text-slate-300">{JSON.stringify(result.parsedTask, null, 2)}</pre></section><section className="rounded-xl border border-white/10 bg-white/[.03] p-5"><div className="flex items-center justify-between gap-4"><h3 className="font-semibold">Final compiled prompt</h3><button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:border-violet-400/60" onClick={() => void copyPrompt()} type="button">{copyLabel}</button></div><ul className="mt-3 space-y-1 text-sm text-slate-400">{result.providerInstructions.map((instruction) => <li key={instruction}>• {instruction}</li>)}</ul><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950/50 p-4 text-xs leading-5 text-slate-300">{result.compiledPrompt}</pre>{canGenerate ? <button onClick={() => void generateImage()} disabled={isGenerating} className="mt-5 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">{isGenerating ? "Generating one image…" : "Generate image"}</button> : <p className="mt-5 text-xs text-slate-500">{result.parsedTask.provider !== "GENERIC_IMAGE" || result.parsedTask.operation !== "generate" ? "Image generation currently supports only GENERIC_IMAGE + generate." : "This compiled request has already been used. Parse again to generate another image."}</p>}</section></div>}
    {image && <section className="mt-5 rounded-xl border border-white/10 bg-white/[.03] p-5"><h3 className="font-semibold">Generated image</h3>{/* Base64 data URLs are intentionally not optimized or persisted. */}<Image unoptimized width={1024} height={1024} className="mt-4 aspect-square w-full max-w-lg rounded-lg border border-white/10 bg-slate-950/50 object-contain" src={image.imageUrl} alt="Generated character asset" /><dl className="mt-4 grid gap-2 text-sm text-slate-400"><div><dt className="inline text-slate-500">Model: </dt><dd className="inline">{image.model}</dd></div><div><dt className="inline text-slate-500">Generated: </dt><dd className="inline">{new Date(image.createdAt).toLocaleString()}</dd></div></dl><pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950/50 p-4 text-xs leading-5 text-slate-300">{image.compiledPrompt}</pre><p className="mt-3 text-xs text-slate-500">Temporary browser-only preview. It is not saved to Atlas.</p></section>}
    <p className="mt-3 text-xs text-slate-500">Manual Prompt Preview remains available below as a fallback.</p>
  </section>;
}
