"use client";

import { FormEvent, useState } from "react";
import { PROVIDERS, type ProviderProfile, type RikaAnimationOptions } from "@/lib/providers/types";

type PromptPreviewResult = {
  provider: ProviderProfile;
  providerInstructions: string[];
  compiledPrompt: string;
};

const defaultRikaOptions: RikaAnimationOptions = {
  animationType: "Character motion",
  frameCount: 24,
  cameraMovementAllowed: false,
  projectileAllowed: false,
  playback: "LOOP",
  constraints: "Preserve character identity and visual continuity.",
};

// Prompt compilation is kept separate from metadata inspection because it
// introduces provider-specific inputs while remaining a local preview only.
export function PromptPreview({ characterId }: { characterId: string }) {
  const [provider, setProvider] = useState<ProviderProfile>("GENERIC_IMAGE");
  const [userRequest, setUserRequest] = useState("");
  const [rikaOptions, setRikaOptions] = useState<RikaAnimationOptions>(defaultRikaOptions);
  const [result, setResult] = useState<PromptPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy prompt");

  async function compilePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      setCopyLabel("Copy prompt");
      const response = await fetch(`/api/characters/${characterId}/compile-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, userRequest, rikaOptions: provider === "RIKA_ANIMATION" ? rikaOptions : undefined }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not compile prompt.");
      setResult(payload);
    } catch (compileError) {
      setError(compileError instanceof Error ? compileError.message : "Could not compile prompt.");
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

  return <section className="mt-10 max-w-4xl border-t border-white/10 pt-10"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">Prompt compiler</p><h2 className="mt-1 text-xl font-semibold">Prompt preview</h2><p className="mt-1 text-sm text-slate-400">Deterministic preview only. No AI request is sent.</p></div><form className="mt-5 rounded-xl border border-white/10 bg-white/[.03] p-5" onSubmit={compilePrompt}><label className="block text-sm font-medium">Provider<select className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none focus:border-violet-400" value={provider} onChange={(event) => { setProvider(event.target.value as ProviderProfile); setResult(null); }}>{PROVIDERS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="mt-4 block text-sm font-medium">User request<textarea required className="mt-2 min-h-24 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none placeholder:text-slate-600 focus:border-violet-400" placeholder="Describe the image or animation you want to preview." value={userRequest} onChange={(event) => setUserRequest(event.target.value)} /></label>{provider === "RIKA_ANIMATION" && <RikaOptions options={rikaOptions} setOptions={setRikaOptions} />}<div className="mt-5 flex justify-end"><button className="rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold hover:bg-violet-400">Compile prompt</button></div></form>{error && <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}{result && <div className="mt-5 rounded-xl border border-white/10 bg-white/[.03] p-5"><div className="flex items-center justify-between gap-4"><h3 className="font-semibold">Compiled prompt</h3><button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:border-violet-400/60" type="button" onClick={() => void copyPrompt()}>{copyLabel}</button></div><ul className="mt-3 space-y-1 text-sm text-slate-400">{result.providerInstructions.map((instruction) => <li key={instruction}>• {instruction}</li>)}</ul><pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950/50 p-4 text-xs leading-5 text-slate-300">{result.compiledPrompt}</pre></div>}</section>;
}

function RikaOptions({ options, setOptions }: { options: RikaAnimationOptions; setOptions: (options: RikaAnimationOptions) => void }) {
  return <fieldset className="mt-5 rounded-xl border border-violet-400/20 bg-violet-500/[.04] p-4"><legend className="px-2 text-sm font-semibold text-violet-200">Rika animation options</legend><div className="grid gap-4 sm:grid-cols-2"><PromptField label="Animation type" value={options.animationType} onChange={(animationType) => setOptions({ ...options, animationType })} /><label className="text-sm font-medium">Frame count<input className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none focus:border-violet-400" min="1" type="number" value={options.frameCount} onChange={(event) => setOptions({ ...options, frameCount: Number(event.target.value) })} /></label><label className="flex items-center gap-2 text-sm text-slate-300"><input checked={options.cameraMovementAllowed} type="checkbox" onChange={(event) => setOptions({ ...options, cameraMovementAllowed: event.target.checked })} />Camera movement allowed</label><label className="flex items-center gap-2 text-sm text-slate-300"><input checked={options.projectileAllowed} type="checkbox" onChange={(event) => setOptions({ ...options, projectileAllowed: event.target.checked })} />Projectile allowed</label><label className="text-sm font-medium">Playback<select className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none focus:border-violet-400" value={options.playback} onChange={(event) => setOptions({ ...options, playback: event.target.value as RikaAnimationOptions["playback"] })}><option value="LOOP">Loop</option><option value="ONE_SHOT">One-shot</option></select></label></div><label className="mt-4 block text-sm font-medium">Constraints<textarea className="mt-2 min-h-20 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none focus:border-violet-400" value={options.constraints} onChange={(event) => setOptions({ ...options, constraints: event.target.value })} /></label></fieldset>;
}

function PromptField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-sm font-medium">{label}<input className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none focus:border-violet-400" required value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
