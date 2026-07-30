"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { CharacterMemory, CharacterMemoryInput } from "@/lib/memory";

export type MemoryForm = Record<keyof CharacterMemoryInput, string>;

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

const primaryMemoryFields = memoryLabels.filter(({ field }) => field === "visualStyle");
const advancedMemoryFields = memoryLabels.filter(({ field }) => field !== "visualStyle");

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

  return (
    <section className="atlas-section">
      <div className="atlas-section-header">
        <div className="atlas-section-header__copy">
          <p className="atlas-eyebrow">Character memory</p>
          <h2 className="atlas-section-title">Persistent creative context</h2>
          <p className="atlas-section-description">
            Durable art direction and character knowledge carried into future work.
          </p>
        </div>
        <div className="atlas-heading-actions">
          <button
            className="atlas-button atlas-button--secondary"
            onClick={openEditor}
          >
            {memory ? "Edit memory" : "Create memory"}
          </button>
          {memory && (
            <button
              className="atlas-button atlas-button--danger"
              onClick={() => setIsConfirmingDelete(true)}
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {error && <p className="atlas-error" role="alert">{error}</p>}
      {isLoading ? (
        <p className="atlas-status" role="status">Loading memory…</p>
      ) : memory ? (
        <CharacterMemoryContent memory={memory} />
      ) : (
        <div className="atlas-empty">
          No persistent memory yet. Create one to record the character details
          future workflows should preserve.
        </div>
      )}
      {isEditing && (
        <MemoryDialog
          form={form}
          onClose={() => setIsEditing(false)}
          onSubmit={saveMemory}
          setForm={setForm}
        />
      )}
      {isConfirmingDelete && (
        <DeleteMemoryDialog
          onCancel={() => setIsConfirmingDelete(false)}
          onConfirm={() => void deleteMemory()}
        />
      )}
    </section>
  );
}

export function CharacterMemoryContent({ memory }: { memory: CharacterMemory }) {
  const hasAdvancedMemory = advancedMemoryFields.some(({ field }) => memory[field]);
  return (
    <div>
      {primaryMemoryFields.map(({ field, label }) =>
        memory[field] ? (
          <MemoryCard field={field} label={label} memory={memory} key={field} />
        ) : null,
      )}
      {hasAdvancedMemory && (
        <details className="atlas-disclosure">
          <summary>Advanced memory</summary>
          <div className="atlas-memory-grid">
            {advancedMemoryFields.map(({ field, label }) =>
              memory[field] ? (
                <MemoryCard field={field} label={label} memory={memory} key={field} />
              ) : null,
            )}
          </div>
        </details>
      )}
      <p className="atlas-updated-at">
        Last updated {new Date(memory.lastUpdated).toLocaleString()}
      </p>
    </div>
  );
}

function MemoryDialog({ form, setForm, onClose, onSubmit }: { form: MemoryForm; setForm: (form: MemoryForm) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="atlas-dialog-backdrop">
      <form
        aria-labelledby="memory-dialog-title"
        aria-modal="true"
        className="atlas-dialog atlas-dialog--lg"
        onSubmit={onSubmit}
        role="dialog"
      >
        <header className="atlas-dialog__header">
          <h2 className="atlas-dialog__title" id="memory-dialog-title">
            Edit character memory
          </h2>
          <p className="atlas-dialog__description">
            This is manual, durable context. No AI generation is used here.
          </p>
        </header>
        <div className="atlas-dialog__body">
          <CharacterMemoryFields form={form} setForm={setForm} />
        </div>
        <footer className="atlas-dialog__footer">
          <button className="atlas-button atlas-button--quiet" type="button" onClick={onClose}>Cancel</button>
          <button className="atlas-button atlas-button--primary">Save memory</button>
        </footer>
      </form>
    </div>
  );
}

export function CharacterMemoryFields({ form, setForm }: { form: MemoryForm; setForm: (form: MemoryForm) => void }) {
  return <><p className="atlas-form-group__title mt-4">Visual identity</p>{primaryMemoryFields.map(({ field, label, hint }) => <MemoryField field={field} form={form} setForm={setForm} label={label} hint={hint} key={field} />)}<details className="atlas-disclosure"><summary>Advanced memory</summary><p className="atlas-form-group__description">Lore, immutable design rules, prompt guidance, and review summaries.</p>{advancedMemoryFields.map(({ field, label, hint }) => <MemoryField field={field} form={form} setForm={setForm} label={label} hint={hint} key={field} />)}</details></>;
}

function MemoryCard({ field, label, memory }: { field: keyof MemoryForm; label: string; memory: CharacterMemory }) {
  return <article className={field === "visualStyle" ? "atlas-memory-feature" : "atlas-memory-card"}><p className="atlas-memory-label">{label}</p><p className="atlas-memory-value">{memory[field]}</p></article>;
}

function MemoryField({ field, form, setForm, label, hint }: { field: keyof MemoryForm; form: MemoryForm; setForm: (form: MemoryForm) => void; label: string; hint: string }) {
  return <label className="atlas-label mt-4">{label}<span className="atlas-field-hint">{hint}</span><textarea className="atlas-control min-h-24" value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>;
}

function DeleteMemoryDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return <div className="atlas-dialog-backdrop"><section aria-labelledby="delete-memory-title" aria-modal="true" className="atlas-dialog atlas-dialog--sm" role="dialog"><header className="atlas-dialog__header"><h2 className="atlas-dialog__title" id="delete-memory-title">Delete character memory?</h2><p className="atlas-dialog__description">This removes the persistent memory record. You can create a new one later.</p></header><footer className="atlas-dialog__footer"><button className="atlas-button atlas-button--quiet" onClick={onCancel}>Cancel</button><button className="atlas-button atlas-button--danger" onClick={onConfirm}>Delete memory</button></footer></section></div>;
}

function toMemoryForm(memory: CharacterMemory): MemoryForm {
  return { visualStyle: memory.visualStyle ?? "", lore: memory.lore ?? "", designRules: memory.designRules ?? "", approvedSummary: memory.approvedSummary ?? "", rejectedSummary: memory.rejectedSummary ?? "", preferredPrompt: memory.preferredPrompt ?? "" };
}

function toMemoryInput(form: MemoryForm): CharacterMemoryInput {
  return Object.fromEntries(Object.entries(form).map(([field, value]) => [field, value.trim() || null])) as CharacterMemoryInput;
}
