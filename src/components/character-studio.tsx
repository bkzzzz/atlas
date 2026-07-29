"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { LlmTaskParser } from "@/components/llm-task-parser";
import type { Character, CreateCharacterInput } from "@/lib/characters";

const emptyForm: CreateCharacterInput = {
  name: "",
  description: "",
  personality: "",
  species: "",
};

export function CharacterStudio() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selected, setSelected] = useState<Character | null>(null);
  const [form, setForm] = useState<CreateCharacterInput>(emptyForm);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectCharacter = useCallback(async (id: string) => {
    try {
      setError(null);
      const response = await fetch(`/api/characters/${id}`);
      if (!response.ok) throw new Error("Could not load this project.");
      setSelected(await response.json());
    } catch (loadError) {
      setError(messageFrom(loadError, "Could not load this project."));
    }
  }, []);

  const loadCharacters = useCallback(async () => {
    try {
      const response = await fetch("/api/characters");
      if (!response.ok) throw new Error("Could not load projects.");
      const items: Character[] = await response.json();
      setCharacters(items);
      if (items[0]) await selectCharacter(items[0].id);
    } catch (loadError) {
      setError(messageFrom(loadError, "Could not load projects."));
    } finally {
      setIsLoading(false);
    }
  }, [selectCharacter]);

  useEffect(() => {
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
      if (!response.ok) throw new Error(character.error ?? "Could not create the project.");

      setCharacters((items) => [character, ...items]);
      setSelected(character);
      setForm(emptyForm);
      setIsCreating(false);
    } catch (createError) {
      setError(messageFrom(createError, "Could not create the project."));
    }
  }

  return (
    <main className="min-h-screen bg-[#090d18] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#090d18]/90 px-5 py-3 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500 text-sm font-black text-white">A</span>
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">Atlas</p>
              <p className="text-[11px] text-slate-500">AI Art Director</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {characters.length > 0 && (
              <label className="sr-only" htmlFor="project-select">Project</label>
            )}
            {characters.length > 0 && (
              <select
                className="max-w-52 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-400"
                id="project-select"
                onChange={(event) => void selectCharacter(event.target.value)}
                value={selected?.id ?? ""}
              >
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>{character.name}</option>
                ))}
              </select>
            )}
            <button
              className="rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-violet-400/50 hover:bg-violet-500/10"
              onClick={() => setIsCreating(true)}
              type="button"
            >
              New project
            </button>
          </div>
        </div>
      </header>

      {error && (
        <p className="mx-auto mt-5 max-w-6xl rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
          {error}
        </p>
      )}

      {selected ? (
        <LlmTaskParser
          characterId={selected.id}
          characterName={selected.name}
          key={selected.id}
        />
      ) : !isLoading ? (
        <section className="mx-auto grid min-h-[70vh] max-w-xl place-items-center px-5 text-center">
          <div>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-500/15 text-xl font-bold text-violet-300">A</span>
            <h1 className="mt-5 text-2xl font-semibold text-white">Create your first project</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              A project gives Atlas a stable home for your art direction and generated asset.
            </p>
            <button className="mt-6 rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-400" onClick={() => setIsCreating(true)} type="button">
              Start a project
            </button>
          </div>
        </section>
      ) : (
        <p className="mx-auto max-w-6xl px-5 py-16 text-sm text-slate-500">Opening Atlas…</p>
      )}

      {isCreating && (
        <ProjectFormDialog
          form={form}
          onClose={() => {
            setIsCreating(false);
            setForm(emptyForm);
          }}
          onSubmit={createCharacter}
          setForm={setForm}
        />
      )}
    </main>
  );
}

function ProjectFormDialog({
  form,
  setForm,
  onClose,
  onSubmit,
}: {
  form: CreateCharacterInput;
  setForm: (form: CreateCharacterInput) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <form className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#121827] p-6 shadow-2xl" onSubmit={onSubmit}>
        <h2 className="text-xl font-semibold text-white">New art project</h2>
        <p className="mt-1 text-sm text-slate-400">Add a subject identity for this focused asset workflow.</p>
        <Field label="Project or character name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subject type" value={form.species} onChange={(species) => setForm({ ...form, species })} />
          <Field label="Core traits" value={form.personality} onChange={(personality) => setForm({ ...form, personality })} />
        </div>
        <Field label="Short description" multiline value={form.description} onChange={(description) => setForm({ ...form, description })} />
        <div className="mt-6 flex justify-end gap-3">
          <button className="px-4 py-2 text-sm text-slate-400 hover:text-white" onClick={onClose} type="button">Cancel</button>
          <button className="rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-400">Create project</button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const className = "mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm outline-none focus:border-violet-400";
  return (
    <label className="mt-4 block text-sm font-medium text-slate-300">
      {label}
      {multiline ? (
        <textarea className={`${className} min-h-20`} onChange={(event) => onChange(event.target.value)} required value={value} />
      ) : (
        <input className={className} onChange={(event) => onChange(event.target.value)} required value={value} />
      )}
    </label>
  );
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
