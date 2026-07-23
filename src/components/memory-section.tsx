"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { CharacterMemory, CharacterMemoryInput } from "@/lib/memory";

type MemoryForm = Record<keyof CharacterMemoryInput, string>;

const emptyMemoryForm: MemoryForm = {
  visualStyle: "",
  lore: "",
  designRules: "",
  approvedSummary: "",
  rejectedSummary: "",
  preferredPrompt: "",
};

const memoryLabels: { field: keyof MemoryForm; label: string; hint: string }[] = [
  { field: "visualStyle", label: "Visual style", hint: "Art direction, palette, framing, and mood." },
  { field: "lore", label: "Lore", hint: "Backstory, world context, and character facts." },
  { field: "designRules", label: "Design rules", hint: "Details that must stay consistent." },
  { field: "approvedSummary", label: "Approved summary", hint: "What is working and should be preserved." },
  { field: "rejectedSummary", label: "Rejected summary", hint: "What should not be repeated." },
  { field: "preferredPrompt", label: "Preferred prompt", hint: "A human-maintained prompt starting point." },
];

const primaryMemoryFields = memoryLabels.filter(({ field }) => !["approvedSummary", "rejectedSummary"].includes(field));
const optionalMemoryFields = memoryLabels.filter(({ field }) => ["approvedSummary", "rejectedSummary"].includes(field));

// Memory is scoped to a selected character, so this component owns its API
// calls and editing state without adding unrelated state to CharacterStudio.
export function MemorySection({ characterId }: { characterId: string }) {
  const [memory, setMemory] = useState<CharacterMemory | null>(null);
  const [form, setForm] = useState<MemoryForm>(emptyMemoryForm);
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMemory = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`/api/characters/${characterId}/memory`);
      if (!response.ok) throw new Error("Could not load character memory.");
      setMemory(await response.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load character memory.");
    } finally {
      setIsLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      void loadMemory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMemory]);

  function openEditor() {
    setForm(memory ? toMemoryForm(memory) : emptyMemoryForm);
    setIsEditing(true);
  }

  async function saveMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const method = memory ? "PATCH" : "POST";

    try {
      setError(null);
      const response = await fetch(`/api/characters/${characterId}/memory`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toMemoryInput(form)),
      });
      const updatedMemory = await response.json();
      if (!response.ok) throw new Error(updatedMemory.error ?? "Could not save character memory.");
      setMemory(updatedMemory);
      setIsEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save character memory.");
    }
  }

  async function deleteMemory() {
    try {
      setError(null);
      const response = await fetch(`/api/characters/${characterId}/memory`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete character memory.");
      setMemory(null);
      setForm(emptyMemoryForm);
      setIsConfirmingDelete(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete character memory.");
    }
  }

  return <section className="mt-10 max-w-4xl border-t border-white/10 pt-10">
    <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">Character memory</p><h2 className="mt-1 text-xl font-semibold">Persistent creative context</h2></div><div className="flex gap-2"><button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:border-violet-400/60" onClick={openEditor}>{memory ? "Edit memory" : "Create memory"}</button>{memory && <button className="rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/10" onClick={() => setIsConfirmingDelete(true)}>Delete</button>}</div></div>
    {error && <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
    {isLoading ? <p className="mt-5 text-sm text-slate-400">Loading memory…</p> : memory ? <MemoryDisplay memory={memory} /> : <div className="mt-5 rounded-xl border border-dashed border-white/15 p-7 text-sm text-slate-400">No persistent memory yet. Create one to record the character details future workflows should preserve.</div>}
    {isEditing && <MemoryDialog form={form} setForm={setForm} onClose={() => setIsEditing(false)} onSubmit={saveMemory} />}
    {isConfirmingDelete && <DeleteMemoryDialog onCancel={() => setIsConfirmingDelete(false)} onConfirm={() => void deleteMemory()} />}
  </section>;
}

function MemoryDisplay({ memory }: { memory: CharacterMemory }) {
  return <div className="mt-5 grid gap-4 sm:grid-cols-2">{memoryLabels.map(({ field, label }) => memory[field] ? <article className="rounded-xl border border-white/10 bg-white/[.03] p-4" key={field}><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{memory[field]}</p></article> : null)}<p className="sm:col-span-2 text-xs text-slate-500">Last updated {new Date(memory.lastUpdated).toLocaleString()}</p></div>;
}

function MemoryDialog({ form, setForm, onClose, onSubmit }: { form: MemoryForm; setForm: (form: MemoryForm) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-10 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"><form className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#151c32]" onSubmit={onSubmit}><header className="shrink-0 border-b border-white/10 px-6 py-5"><h2 className="text-xl font-semibold">Edit character memory</h2><p className="mt-1 text-sm text-slate-400">This is manual, durable context. No AI generation is used here.</p></header><div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{primaryMemoryFields.map(({ field, label, hint }) => <MemoryField field={field} form={form} setForm={setForm} label={label} hint={hint} key={field} />)}<details className="mt-5 rounded-xl border border-white/10 bg-white/[.025] p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-200">Optional review summaries</summary><p className="mt-1 text-xs text-slate-500">Keep approved and rejected guidance here when you need it.</p>{optionalMemoryFields.map(({ field, label, hint }) => <MemoryField field={field} form={form} setForm={setForm} label={label} hint={hint} key={field} />)}</details></div><footer className="flex shrink-0 justify-end gap-3 border-t border-white/10 bg-[#151c32] px-6 py-4"><button className="px-4 py-2 text-sm text-slate-300" type="button" onClick={onClose}>Cancel</button><button className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold hover:bg-violet-400">Save memory</button></footer></form></div>;
}

function MemoryField({ field, form, setForm, label, hint }: { field: keyof MemoryForm; form: MemoryForm; setForm: (form: MemoryForm) => void; label: string; hint: string }) {
  return <label className="mt-4 block text-sm font-medium">{label}<span className="ml-2 text-xs font-normal text-slate-500">{hint}</span><textarea className="mt-2 min-h-24 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none placeholder:text-slate-600 focus:border-violet-400" value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>;
}

function DeleteMemoryDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-10 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"><section aria-modal="true" role="dialog" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#151c32] p-6"><h2 className="text-xl font-semibold">Delete character memory?</h2><p className="mt-2 text-sm leading-6 text-slate-400">This removes the persistent memory record. You can create a new one later.</p><div className="mt-6 flex justify-end gap-3"><button className="px-4 py-2 text-sm text-slate-300" onClick={onCancel}>Cancel</button><button className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400" onClick={onConfirm}>Delete memory</button></div></section></div>;
}

function toMemoryForm(memory: CharacterMemory): MemoryForm {
  return { visualStyle: memory.visualStyle ?? "", lore: memory.lore ?? "", designRules: memory.designRules ?? "", approvedSummary: memory.approvedSummary ?? "", rejectedSummary: memory.rejectedSummary ?? "", preferredPrompt: memory.preferredPrompt ?? "" };
}

function toMemoryInput(form: MemoryForm): CharacterMemoryInput {
  return Object.fromEntries(Object.entries(form).map(([field, value]) => [field, value.trim() || null])) as CharacterMemoryInput;
}
