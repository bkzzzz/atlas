"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AmbientAssetShowcase } from "@/components/ambient-asset-showcase";
import { AssetSection } from "@/components/asset-section";
import {
  LanguageSwitcher,
  useLanguage,
} from "@/components/language-provider";
import { MemorySection } from "@/components/memory-section";
import { LlmTaskParser } from "@/components/llm-task-parser";
import type { Character, CreateCharacterInput } from "@/lib/characters";
import { localeForLanguage, translateKnownText } from "@/lib/i18n";

const emptyForm: CreateCharacterInput = {
  name: "",
  description: "",
  personality: "",
  species: "",
};

// This Client Component owns browser interaction. It talks only to the API,
// leaving database access in server-side Route Handlers.
export function CharacterStudio() {
  const { language, t } = useLanguage();
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
      if (!response.ok) throw new Error("errors.loadCharacter");
      setSelected(await response.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "errors.loadCharacter");
    }
  }, []);

  const loadCharacters = useCallback(async () => {
    try {
      const response = await fetch("/api/characters");
      if (!response.ok) throw new Error("errors.loadCharacters");

      const items: Character[] = await response.json();
      setCharacters(items);
      if (items[0]) await selectCharacter(items[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "errors.loadCharacters");
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

      if (!response.ok) throw new Error(character.error ?? "errors.createCharacter");

      setCharacters((items) => [character, ...items]);
      setSelected(character);
      setForm(emptyForm);
      setIsCreating(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "errors.createCharacter");
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
      if (!response.ok) throw new Error(character.error ?? "errors.updateCharacter");

      setCharacters((items) => items.map((item) => item.id === character.id ? character : item));
      setSelected(character);
      setForm(emptyForm);
      setIsEditing(false);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "errors.updateCharacter");
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
        throw new Error(body.error ?? "errors.deleteCharacter");
      }

      const remaining = characters.filter((item) => item.id !== deletedId);
      setCharacters(remaining);
      setSelected(remaining[0] ?? null);
      setIsConfirmingDelete(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "errors.deleteCharacter");
    }
  }

  return (
    <main className="atlas-app">
      <AmbientAssetShowcase />
      <div className="atlas-shell">
        <aside className="atlas-sidebar">
          <p className="atlas-brand">
            <span aria-hidden="true" className="atlas-brand__mark">A</span>
            <span className="atlas-brand__name">Atlas</span>
            <span className="atlas-brand__domain">.io</span>
          </p>
          <p className="atlas-library-label">{t("nav.characterLibrary")}</p>
          <div className="atlas-character-list">
            {isLoading && (
              <p className="atlas-status" role="status">
                {t("nav.loadingCharacters")}
              </p>
            )}
            {characters.map((character) => (
              <button
                aria-current={selected?.id === character.id ? "true" : undefined}
                className="atlas-character-row"
                key={character.id}
                onClick={() => void selectCharacter(character.id)}
              >
                <span className="atlas-character-row__name">{character.name}</span>
                <span className="atlas-character-row__species">{character.species}</span>
              </button>
            ))}
          </div>
          {!isLoading && characters.length === 0 && (
            <p className="atlas-status">{t("nav.noCharacters")}</p>
          )}
        </aside>

        <section className="atlas-workspace">
          <header className="atlas-hero">
            <div className="atlas-hero__masthead">
              <div className="atlas-hero__wordmark">
                <span aria-hidden="true" className="atlas-hero__mark">A</span>
                <div>
                  <p className="atlas-hero__product">Atlas</p>
                  <p className="atlas-hero__category">
                    {t("hero.category")}
                  </p>
                </div>
              </div>
              <div className="atlas-hero__utilities">
                <LanguageSwitcher />
                <p className="atlas-hero__edition">{t("hero.edition")}</p>
              </div>
            </div>

            <div className="atlas-hero__body">
              <div className="atlas-hero__copy">
                <p className="atlas-eyebrow">{t("hero.eyebrow")}</p>
                <h1 className="atlas-hero__title">
                  {t("hero.titleFirst")}
                  <span>{t("hero.titleSecond")}</span>
                </h1>
                <p className="atlas-hero__proposition">
                  {t("hero.proposition")}
                </p>
                <p className="atlas-hero__support">
                  {t("hero.support")}
                </p>
              </div>

              <div className="atlas-hero__action">
                <p>{t("hero.actionLabel")}</p>
                <button
                  className="atlas-button atlas-button--primary"
                  onClick={() => setIsCreating(true)}
                >
                  {t("hero.newCharacter")}
                </button>
              </div>
            </div>
          </header>

          {error && (
            <p className="atlas-error" role="alert">
              {translateKnownText(error, t)}
            </p>
          )}

          {selected ? (
            <>
              <article className="atlas-profile">
                <p className="atlas-eyebrow">{t("character.profile")}</p>
                <div className="atlas-profile__heading">
                  <h2 className="atlas-profile__title">{selected.name}</h2>
                  <div className="atlas-heading-actions">
                    <button
                      className="atlas-button atlas-button--quiet"
                      onClick={openEditDialog}
                    >
                      {t("common.edit")}
                    </button>
                    <button
                      className="atlas-button atlas-button--danger"
                      onClick={() => setIsConfirmingDelete(true)}
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
                <dl className="atlas-profile__details">
                  <Detail label={t("character.species")} value={selected.species} />
                  <Detail
                    label={t("character.created")}
                    value={new Date(selected.createdAt).toLocaleDateString(
                      localeForLanguage(language),
                    )}
                  />
                  <Detail label={t("character.personality")} value={selected.personality} />
                  <Detail label={t("character.description")} value={selected.description} />
                </dl>
              </article>
              <CharacterAssetWorkspace
                character={selected}
                characters={characters}
                key={selected.id}
              />
            </>
          ) : !isLoading && (
            <div className="atlas-empty">
              {t("character.empty")}
            </div>
          )}
        </section>
      </div>

      {isCreating && (
        <CharacterFormDialog title={t("character.createTitle")} description={t("character.createDescription")} form={form} setForm={setForm} onClose={() => setIsCreating(false)} onSubmit={createCharacter} submitLabel={t("character.createAction")} />
      )}

      {isEditing && (
        <CharacterFormDialog title={t("character.editTitle")} description={t("character.editDescription")} form={form} setForm={setForm} onClose={() => { setIsEditing(false); setForm(emptyForm); }} onSubmit={updateCharacter} submitLabel={t("common.saveChanges")} />
      )}

      {isConfirmingDelete && selected && (
        <div className="atlas-dialog-backdrop">
          <section
            aria-labelledby="delete-character-title"
            aria-modal="true"
            className="atlas-dialog atlas-dialog--sm"
            role="dialog"
          >
            <header className="atlas-dialog__header">
              <h2 className="atlas-dialog__title" id="delete-character-title">
                {t("character.deleteTitle", { name: selected.name })}
              </h2>
              <p className="atlas-dialog__description">
                {t("character.deleteDescription")}
              </p>
            </header>
            <footer className="atlas-dialog__footer">
              <button
                className="atlas-button atlas-button--quiet"
                onClick={() => setIsConfirmingDelete(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                className="atlas-button atlas-button--danger"
                onClick={() => void deleteCharacter()}
              >
                {t("character.deleteAction")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

export function CharacterAssetWorkspace({
  character,
  characters,
}: {
  character: Character;
  characters: Character[];
}) {
  return (
    <>
      <AssetSection characterId={character.id} />
      <MemorySection characterId={character.id} />
      <LlmTaskParser
        characterId={character.id}
        characterName={character.name}
        styleCharacters={characters
          .filter(({ id }) => id !== character.id)
          .map(({ id, name }) => ({ id, name }))}
      />
    </>
  );
}

// Both create and edit use the same fields, so one dialog keeps their UI and
// validation consistent while their submit handlers remain separate.
function CharacterFormDialog({ title, description, form, setForm, onClose, onSubmit, submitLabel }: { title: string; description: string; form: CreateCharacterInput; setForm: (form: CreateCharacterInput) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; submitLabel: string }) {
  const { t } = useLanguage();

  return (
    <div className="atlas-dialog-backdrop">
          <form
            aria-labelledby="character-form-title"
            aria-modal="true"
            className="atlas-dialog atlas-dialog--md"
            onSubmit={onSubmit}
            role="dialog"
          >
            <header className="atlas-dialog__header">
              <h2 className="atlas-dialog__title" id="character-form-title">{title}</h2>
              <p className="atlas-dialog__description">{description}</p>
            </header>
            <div className="atlas-dialog__body">
            <Field label={t("character.field.name")} value={form.name} onChange={(name) => setForm({ ...form, name })} />
            <Field label={t("character.species")} value={form.species} onChange={(species) => setForm({ ...form, species })} />
            <Field label={t("character.personality")} value={form.personality} onChange={(personality) => setForm({ ...form, personality })} />
            <Field label={t("character.description")} value={form.description} onChange={(description) => setForm({ ...form, description })} multiline />
            </div>
            <footer className="atlas-dialog__footer">
              <button className="atlas-button atlas-button--quiet" type="button" onClick={onClose}>{t("common.cancel")}</button>
              <button className="atlas-button atlas-button--primary">{submitLabel}</button>
            </footer>
          </form>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="atlas-detail"><dt>{label}</dt><dd>{value}</dd></div>;
}

function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <label className="atlas-label mt-4">{label}{multiline ? <textarea className="atlas-control min-h-24" required value={value} onChange={(event) => onChange(event.target.value)} /> : <input className="atlas-control" required value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}
