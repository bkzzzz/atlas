"use client";

import { useCallback, useEffect, useState } from "react";
import type { CharacterMetadata } from "@/lib/metadata-builder";

// This panel is intentionally read-only: it lets users inspect the exact
// structured context future workflows will consume without generating a prompt.
export function MetadataPreview({ characterId }: { characterId: string }) {
  const [metadata, setMetadata] = useState<CharacterMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadMetadata = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`/api/characters/${characterId}/metadata`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load metadata.");
      setMetadata(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load metadata.");
    } finally {
      setIsLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      void loadMetadata();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMetadata]);

  return <section className="mt-10 max-w-4xl border-t border-white/10 pt-10"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">Metadata engine</p><h2 className="mt-1 text-xl font-semibold">Metadata preview</h2></div><button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:border-violet-400/60" onClick={() => void loadMetadata()}>Refresh</button></div>{error && <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}{isLoading ? <p className="mt-5 text-sm text-slate-400">Building metadata…</p> : metadata && <details className="mt-5 rounded-xl border border-white/10 bg-white/[.03] p-4" open><summary className="cursor-pointer font-semibold text-slate-100">Structured context <span className="ml-2 text-xs font-normal text-slate-500">{metadata.approvedAssets.length} approved · {metadata.rejectedAssets.length} rejected</span></summary><pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-slate-950/50 p-4 text-xs leading-5 text-slate-300">{JSON.stringify(metadata, null, 2)}</pre></details>}</section>;
}
