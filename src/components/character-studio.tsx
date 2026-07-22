"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { Character, CreateCharacterInput } from "@/lib/characters";

const emptyForm: CreateCharacterInput = {
  name: "",
  description: "",
  personality: "",
  species: "",
};

// This Client Component owns browser interaction. It talks only to the API,
// leaving database access in server-side Route Handlers.
export function CharacterStudio() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selected, setSelected] = useState<Character | null>(null);
  const [form, setForm] = useState<CreateCharacterInput>(emptyForm);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectCharacter = useCallback(async (id: string) => {
    try {
      setError(null);
      const response = await fetch(`/api/characters/${id}`);
      if (!response.ok) throw new Error("Could not load this character.");
      setSelected(await response.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this character.");
    }
  }, []);

  const loadCharacters = useCallback(async () => {
    try {
      const response = await fetch("/api/characters");
      if (!response.ok) throw new Error("Could not load characters.");

      const items: Character[] = await response.json();
      setCharacters(items);
      if (items[0]) await selectCharacter(items[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load characters.");
    } finally {
      setIsLoading(false);
    }
  }, [selectCharacter]);

  useEffect(() => {
    // Schedule the initial browser request after the component has mounted.
    const timer = window.setTimeout(() => void loadCharacters(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCharacters]);

  async function createCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setError(null);
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const character = await response.json();

      if (!response.ok) throw new Error(character.error ?? "Could not create character.");

      setCharacters((items) => [character, ...items]);
      setSelected(character);
      setForm(emptyForm);
      setIsCreating(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create character.");
    }
  }

  function openEditDialog() {
    if (!selected) return;
    setForm({
      name: selected.name,
      description: selected.description,
      personality: selected.personality,
      species: selected.species,
    });
    setIsEditing(true);
  }

  async function updateCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;

    try {
      setError(null);
      const response = await fetch(`/api/characters/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const character = await response.json();
      if (!response.ok) throw new Error(character.error ?? "Could not update character.");

      setCharacters((items) => items.map((item) => item.id === character.id ? character : item));
      setSelected(character);
      setForm(emptyForm);
      setIsEditing(false);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update character.");
    }
  }

  async function deleteCharacter() {
    if (!selected) return;
    const deletedId = selected.id;

    try {
      setError(null);
      const response = await fetch(`/api/characters/${deletedId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? "Could not delete character.");
      }

      const remaining = characters.filter((item) => item.id !== deletedId);
      setCharacters(remaining);
      setSelected(remaining[0] ?? null);
      setIsConfirmingDelete(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete character.");
    }
  }

  return (
    <main className="min-h-screen bg-[#0b1020] text-slate-100">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-[340px_1fr]">
        <aside className="border-b border-white/10 bg-[#0e1427] p-6 lg:border-r lg:border-b-0">
          <p className="text-lg font-bold">Atlas<span className="text-violet-400">.io</span></p>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[.16em] text-violet-300">Character library</p>
          <div className="mt-4 space-y-2">
            {isLoading && <p className="text-sm text-slate-400">Loading characters…</p>}
            {characters.map((character) => (
              <button
                className={`w-full rounded-xl border p-4 text-left transition ${selected?.id === character.id ? "border-violet-400/60 bg-violet-500/10" : "border-white/10 hover:bg-white/5"}`}
                key={character.id}
                onClick={() => void selectCharacter(character.id)}
              >
                <p className="font-semibold">{character.name}</p>
                <p className="mt-1 text-sm text-slate-400">{character.species}</p>
              </button>
            ))}
          </div>
          {!isLoading && characters.length === 0 && <p className="mt-4 text-sm text-slate-400">No characters yet.</p>}
        </aside>

        <section className="p-6 sm:p-10">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">Character Studio</p><h1 className="mt-1 text-2xl font-semibold">Your characters</h1></div>
            <button className="rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold hover:bg-violet-400" onClick={() => setIsCreating(true)}>New character</button>
          </div>

          {error && <p className="mt-6 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

          {selected ? (
            <article className="mt-10 max-w-2xl rounded-2xl border border-white/10 bg-white/[.03] p-6">
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">Character profile</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><h2 className="text-3xl font-semibold">{selected.name}</h2><div className="flex gap-2"><button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:border-violet-400/60" onClick={openEditDialog}>Edit</button><button className="rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-200 hover:bg-rose-500/10" onClick={() => setIsConfirmingDelete(true)}>Delete</button></div></div>
              <dl className="mt-8 grid gap-6 sm:grid-cols-2">
                <Detail label="Species" value={selected.species} />
                <Detail label="Created" value={new Date(selected.createdAt).toLocaleDateString()} />
                <Detail label="Personality" value={selected.personality} />
                <Detail label="Description" value={selected.description} />
              </dl>
            </article>
          ) : !isLoading && <div className="mt-10 rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-400">Create your first character to begin.</div>}
        </section>
      </div>

      {isCreating && (
        <CharacterFormDialog title="Create a character" description="These four fields are stored in your local SQLite database." form={form} setForm={setForm} onClose={() => setIsCreating(false)} onSubmit={createCharacter} submitLabel="Create character" />
      )}

      {isEditing && (
        <CharacterFormDialog title="Edit character" description="Save changes to update this character in the database." form={form} setForm={setForm} onClose={() => { setIsEditing(false); setForm(emptyForm); }} onSubmit={updateCharacter} submitLabel="Save changes" />
      )}

      {isConfirmingDelete && selected && (
        <div className="fixed inset-0 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <section aria-modal="true" role="dialog" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#151c32] p-6"><h2 className="text-xl font-semibold">Delete {selected.name}?</h2><p className="mt-2 text-sm leading-6 text-slate-400">This permanently removes the character from the local database. This action cannot be undone.</p><div className="mt-6 flex justify-end gap-3"><button className="px-4 py-2 text-sm text-slate-300" onClick={() => setIsConfirmingDelete(false)}>Cancel</button><button className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400" onClick={() => void deleteCharacter()}>Delete character</button></div></section>
        </div>
      )}
    </main>
  );
}

// Both create and edit use the same fields, so one dialog keeps their UI and
// validation consistent while their submit handlers remain separate.
function CharacterFormDialog({ title, description, form, setForm, onClose, onSubmit, submitLabel }: { title: string; description: string; form: CreateCharacterInput; setForm: (form: CreateCharacterInput) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; submitLabel: string }) {
  return (
    <div className="fixed inset-0 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <form className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#151c32] p-6" onSubmit={onSubmit}>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">{description}</p>
            <Field label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
            <Field label="Species" value={form.species} onChange={(species) => setForm({ ...form, species })} />
            <Field label="Personality" value={form.personality} onChange={(personality) => setForm({ ...form, personality })} />
            <Field label="Description" value={form.description} onChange={(description) => setForm({ ...form, description })} multiline />
            <div className="mt-6 flex justify-end gap-3"><button className="px-4 py-2 text-sm text-slate-300" type="button" onClick={onClose}>Cancel</button><button className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold hover:bg-violet-400">{submitLabel}</button></div>
          </form>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{value}</dd></div>;
}

function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  const className = "mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none placeholder:text-slate-600 focus:border-violet-400";
  return <label className="mt-4 block text-sm font-medium">{label}{multiline ? <textarea className={`${className} min-h-24`} required value={value} onChange={(event) => onChange(event.target.value)} /> : <input className={className} required value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}
