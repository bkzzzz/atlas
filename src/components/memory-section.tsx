"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import {
  localeForLanguage,
  translateKnownText,
  type TranslationKey,
} from "@/lib/i18n";
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

const memoryLabels: {
  field: keyof MemoryForm;
  label: TranslationKey;
  hint: TranslationKey;
}[] = [
  { field: "visualStyle", label: "memory.field.visualStyle", hint: "memory.hint.visualStyle" },
  { field: "lore", label: "memory.field.lore", hint: "memory.hint.lore" },
  { field: "designRules", label: "memory.field.designRules", hint: "memory.hint.designRules" },
  { field: "approvedSummary", label: "memory.field.approvedSummary", hint: "memory.hint.approvedSummary" },
  { field: "rejectedSummary", label: "memory.field.rejectedSummary", hint: "memory.hint.rejectedSummary" },
  { field: "preferredPrompt", label: "memory.field.preferredPrompt", hint: "memory.hint.preferredPrompt" },
];

const primaryMemoryFields = memoryLabels.filter(({ field }) => field === "visualStyle");
const advancedMemoryFields = memoryLabels.filter(({ field }) => field !== "visualStyle");

// Memory is scoped to a selected character, so this component owns its API
// calls and editing state without adding unrelated state to CharacterStudio.
export function MemorySection({ characterId }: { characterId: string }) {
  const { t } = useLanguage();
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
      if (!response.ok) throw new Error("errors.loadMemory");
      setMemory(await response.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "errors.loadMemory");
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
      if (!response.ok) throw new Error(updatedMemory.error ?? "errors.saveMemory");
      setMemory(updatedMemory);
      setIsEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "errors.saveMemory");
    }
  }

  async function deleteMemory() {
    try {
      setError(null);
      const response = await fetch(`/api/characters/${characterId}/memory`, { method: "DELETE" });
      if (!response.ok) throw new Error("errors.deleteMemory");
      setMemory(null);
      setForm(emptyMemoryForm);
      setIsConfirmingDelete(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "errors.deleteMemory");
    }
  }

  return (
    <section className="atlas-section">
      <div className="atlas-section-header">
        <div className="atlas-section-header__copy">
          <p className="atlas-eyebrow">{t("memory.eyebrow")}</p>
          <h2 className="atlas-section-title">{t("memory.title")}</h2>
          <p className="atlas-section-description">
            {t("memory.description")}
          </p>
        </div>
        <div className="atlas-heading-actions">
          <button
            className="atlas-button atlas-button--secondary"
            onClick={openEditor}
          >
            {memory ? t("memory.edit") : t("memory.create")}
          </button>
          {memory && (
            <button
              className="atlas-button atlas-button--danger"
              onClick={() => setIsConfirmingDelete(true)}
            >
              {t("common.delete")}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="atlas-error" role="alert">
          {translateKnownText(error, t)}
        </p>
      )}
      {isLoading ? (
        <p className="atlas-status" role="status">{t("memory.loading")}</p>
      ) : memory ? (
        <CharacterMemoryContent memory={memory} />
      ) : (
        <div className="atlas-empty">
          {t("memory.empty")}
        </div>
      )}
      {isEditing && (
        <MemoryDialog
          form={form}
          isCreating={!memory}
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
  const { language, t } = useLanguage();
  const hasAdvancedMemory = advancedMemoryFields.some(({ field }) => memory[field]);
  return (
    <div>
      {primaryMemoryFields.map(({ field, label }) =>
        memory[field] ? (
          <MemoryCard field={field} label={t(label)} memory={memory} key={field} />
        ) : null,
      )}
      {hasAdvancedMemory && (
        <details className="atlas-disclosure">
          <summary>{t("memory.advanced")}</summary>
          <div className="atlas-memory-grid">
            {advancedMemoryFields.map(({ field, label }) =>
              memory[field] ? (
                <MemoryCard field={field} label={t(label)} memory={memory} key={field} />
              ) : null,
            )}
          </div>
        </details>
      )}
      <p className="atlas-updated-at">
        {t("memory.lastUpdated", {
          date: new Date(memory.lastUpdated).toLocaleString(
            localeForLanguage(language),
          ),
        })}
      </p>
    </div>
  );
}

function MemoryDialog({ form, isCreating, setForm, onClose, onSubmit }: { form: MemoryForm; isCreating: boolean; setForm: (form: MemoryForm) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const { t } = useLanguage();

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
            {t(isCreating ? "memory.dialogCreateTitle" : "memory.dialogEditTitle")}
          </h2>
          <p className="atlas-dialog__description">
            {t("memory.dialogDescription")}
          </p>
        </header>
        <div className="atlas-dialog__body">
          <CharacterMemoryFields form={form} setForm={setForm} />
        </div>
        <footer className="atlas-dialog__footer">
          <button className="atlas-button atlas-button--quiet" type="button" onClick={onClose}>{t("common.cancel")}</button>
          <button className="atlas-button atlas-button--primary">{t("memory.save")}</button>
        </footer>
      </form>
    </div>
  );
}

export function CharacterMemoryFields({ form, setForm }: { form: MemoryForm; setForm: (form: MemoryForm) => void }) {
  const { t } = useLanguage();
  return <><p className="atlas-form-group__title mt-4">{t("memory.visualIdentity")}</p>{primaryMemoryFields.map(({ field, label, hint }) => <MemoryField field={field} form={form} setForm={setForm} label={t(label)} hint={t(hint)} key={field} />)}<details className="atlas-disclosure"><summary>{t("memory.advanced")}</summary><p className="atlas-form-group__description">{t("memory.advancedDescription")}</p>{advancedMemoryFields.map(({ field, label, hint }) => <MemoryField field={field} form={form} setForm={setForm} label={t(label)} hint={t(hint)} key={field} />)}</details></>;
}

function MemoryCard({ field, label, memory }: { field: keyof MemoryForm; label: string; memory: CharacterMemory }) {
  return <article className={field === "visualStyle" ? "atlas-memory-feature" : "atlas-memory-card"}><p className="atlas-memory-label">{label}</p><p className="atlas-memory-value">{memory[field]}</p></article>;
}

function MemoryField({ field, form, setForm, label, hint }: { field: keyof MemoryForm; form: MemoryForm; setForm: (form: MemoryForm) => void; label: string; hint: string }) {
  return <label className="atlas-label mt-4">{label}<span className="atlas-field-hint">{hint}</span><textarea className="atlas-control min-h-24" value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>;
}

function DeleteMemoryDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const { t } = useLanguage();
  return <div className="atlas-dialog-backdrop"><section aria-labelledby="delete-memory-title" aria-modal="true" className="atlas-dialog atlas-dialog--sm" role="dialog"><header className="atlas-dialog__header"><h2 className="atlas-dialog__title" id="delete-memory-title">{t("memory.deleteTitle")}</h2><p className="atlas-dialog__description">{t("memory.deleteDescription")}</p></header><footer className="atlas-dialog__footer"><button className="atlas-button atlas-button--quiet" onClick={onCancel}>{t("common.cancel")}</button><button className="atlas-button atlas-button--danger" onClick={onConfirm}>{t("memory.deleteAction")}</button></footer></section></div>;
}

function toMemoryForm(memory: CharacterMemory): MemoryForm {
  return { visualStyle: memory.visualStyle ?? "", lore: memory.lore ?? "", designRules: memory.designRules ?? "", approvedSummary: memory.approvedSummary ?? "", rejectedSummary: memory.rejectedSummary ?? "", preferredPrompt: memory.preferredPrompt ?? "" };
}

function toMemoryInput(form: MemoryForm): CharacterMemoryInput {
  return Object.fromEntries(Object.entries(form).map(([field, value]) => [field, value.trim() || null])) as CharacterMemoryInput;
}
