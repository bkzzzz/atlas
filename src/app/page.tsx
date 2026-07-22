"use client";

import { FormEvent, useMemo, useState } from "react";

type Character = {
  id: number;
  name: string;
  role: string;
  summary: string;
  status: "Draft" | "Ready";
  updatedAt: string;
  initials: string;
  color: string;
};

const seed: Character[] = [
  { id: 1, name: "Mira Vale", role: "Sky courier", summary: "A daring courier who maps storms by instinct.", status: "Ready", updatedAt: "2 min ago", initials: "MV", color: "bg-violet-500" },
  { id: 2, name: "Orin", role: "Archive keeper", summary: "Guardian of a forbidden library beneath the city.", status: "Draft", updatedAt: "Yesterday", initials: "O", color: "bg-amber-500" },
];

const colors = ["bg-violet-500", "bg-rose-500", "bg-cyan-500", "bg-amber-500"];

export default function Home() {
  const [characters, setCharacters] = useState(seed);
  const [selectedId, setSelectedId] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const selected = useMemo(() => characters.find((item) => item.id === selectedId), [characters, selectedId]);

  function createCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "Untitled character").trim();
    const role = String(data.get("role") || "Unassigned role").trim();
    const summary = String(data.get("summary") || "A new character awaiting its memory.").trim();
    const newCharacter: Character = {
      id: Date.now(), name, role, summary, status: "Draft", updatedAt: "Just now",
      initials: name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase(),
      color: colors[characters.length % colors.length],
    };
    setCharacters((items) => [newCharacter, ...items]);
    setSelectedId(newCharacter.id);
    setIsCreating(false);
  }

  function removeSelected() {
    if (!selected) return;
    const remaining = characters.filter((item) => item.id !== selected.id);
    setCharacters(remaining);
    setSelectedId(remaining[0]?.id ?? 0);
  }

  return (
    <main className="min-h-screen bg-[#0b1020] text-slate-100 selection:bg-violet-400/30">
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside className="hidden w-72 shrink-0 border-r border-white/8 bg-[#0e1427] p-5 lg:block">
          <div className="mb-10 flex items-center gap-3 px-2"><div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-500 font-black text-white">A</div><span className="text-lg font-semibold tracking-tight">Atlas<span className="text-violet-400">.io</span></span></div>
          <nav className="space-y-1 text-sm"><a className="flex items-center gap-3 rounded-lg bg-violet-500/15 px-3 py-2.5 font-medium text-violet-200" href="#characters">✦ Characters</a><a className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-400" href="#history">◷ Generation history</a><a className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-400" href="#settings">⚙ Workspace settings</a></nav>
          <div className="mt-auto border-t border-white/8 pt-5 text-xs text-slate-500">MVP workspace<br /><span className="text-slate-400">Persistent character memory</span></div>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-20 items-center justify-between border-b border-white/8 px-6 sm:px-10"><div><p className="text-xs font-medium uppercase tracking-[.16em] text-violet-300">Character Studio</p><h1 className="mt-1 text-xl font-semibold">Your characters</h1></div><button onClick={() => setIsCreating(true)} className="rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-violet-900/30 transition hover:bg-violet-400">+ New character</button></header>
          <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(340px,.9fr)_minmax(400px,1.4fr)]">
            <div id="characters" className="border-b border-white/8 p-6 sm:p-10 lg:border-r lg:border-b-0"><div className="mb-6 flex items-end justify-between"><div><h2 className="text-base font-semibold">Character library</h2><p className="mt-1 text-sm text-slate-400">{characters.length} active character{characters.length === 1 ? "" : "s"}</p></div></div>
              <div className="space-y-3">{characters.map((character) => <button key={character.id} onClick={() => setSelectedId(character.id)} className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${selectedId === character.id ? "border-violet-400/50 bg-violet-500/10" : "border-white/8 bg-white/[.025] hover:bg-white/[.05]"}`}><div className={`grid size-11 shrink-0 place-items-center rounded-full ${character.color} text-sm font-bold`}>{character.initials}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate font-semibold">{character.name}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${character.status === "Ready" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{character.status}</span></div><p className="mt-1 truncate text-sm text-slate-400">{character.role}</p></div></button>)}</div>
              {characters.length === 0 && <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">Create your first character to begin building its memory.</div>}
            </div>
            <div className="p-6 sm:p-10">{selected ? <CharacterDetail character={selected} onDelete={removeSelected} /> : <div className="grid h-full min-h-80 place-items-center text-center text-slate-400"><div><p className="text-lg font-semibold text-slate-200">No character selected</p><p className="mt-2 text-sm">Create a character to start its production memory.</p></div></div>}</div>
          </div>
        </section>
      </div>
      {isCreating && <div className="fixed inset-0 z-10 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"><form onSubmit={createCharacter} className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#151c32] p-6 shadow-2xl"><div className="mb-6 flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">New character</p><h2 className="mt-1 text-xl font-semibold">Start a persistent memory</h2></div><button type="button" onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-white">✕</button></div><label className="block text-sm font-medium">Name<input required name="name" autoFocus placeholder="e.g. Lyra Chen" className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none placeholder:text-slate-600 focus:border-violet-400" /></label><label className="mt-4 block text-sm font-medium">Role<input name="role" placeholder="e.g. Starship pilot" className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none placeholder:text-slate-600 focus:border-violet-400" /></label><label className="mt-4 block text-sm font-medium">One-line concept<textarea name="summary" placeholder="Who are they and what makes them memorable?" className="mt-2 min-h-24 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none placeholder:text-slate-600 focus:border-violet-400" /></label><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 text-sm text-slate-300">Cancel</button><button className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold hover:bg-violet-400">Create character</button></div></form></div>}
    </main>
  );
}

function CharacterDetail({ character, onDelete }: { character: Character; onDelete: () => void }) {
  return <div className="max-w-2xl"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-4"><div className={`grid size-16 place-items-center rounded-2xl ${character.color} text-lg font-bold`}>{character.initials}</div><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">Character profile</p><h2 className="mt-1 text-2xl font-semibold">{character.name}</h2><p className="mt-1 text-sm text-slate-400">{character.role}</p></div></div><button onClick={onDelete} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:border-rose-400/40 hover:text-rose-300">Delete</button></div><p className="mt-7 border-l-2 border-violet-400 pl-4 text-sm leading-6 text-slate-300">{character.summary}</p><div className="mt-8 grid gap-3 sm:grid-cols-2"><Metric title="Memory" value="Not generated" note="Identity, visual DNA & lore" /><Metric title="Assets" value="0" note="Approved visual references" /><Metric title="Generations" value="0" note="Full trace coming next" /><Metric title="Last updated" value={character.updatedAt} note="Workspace activity" /></div><div className="mt-8 rounded-xl border border-dashed border-violet-400/25 bg-violet-500/[.04] p-5"><p className="font-semibold text-violet-100">Next: generate character memory</p><p className="mt-1 text-sm leading-6 text-slate-400">Atlas will turn this concept into structured identity, personality, lore, visual DNA, must-keep and must-avoid constraints.</p><button disabled className="mt-4 cursor-not-allowed rounded-lg bg-violet-500/25 px-3 py-2 text-sm font-semibold text-violet-200">AI generation — Day 2</button></div></div>;
}

function Metric({ title, value, note }: { title: string; value: string; note: string }) { return <div className="rounded-xl border border-white/8 bg-white/[.025] p-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p><p className="mt-2 font-semibold text-slate-100">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>; }
