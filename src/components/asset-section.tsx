"use client";
/* eslint-disable @next/next/no-img-element -- Asset URLs are user-entered and not restricted to known image domains yet. */

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  type CreateImageAssetInput,
  type ImageAsset,
  type UpdateImageAssetInput,
} from "@/lib/assets";

const emptyAssetForm: CreateImageAssetInput = {
  name: "",
  imageUrl: "",
  type: "Reference",
  provider: "Manual",
};

const emptyEditForm: UpdateImageAssetInput = {
  name: "",
  type: "",
  provider: "",
  prompt: null,
};

// Asset state stays with this section so changing character details does not
// require the parent Character Studio component to know asset API details.
export function AssetSection({ characterId }: { characterId: string }) {
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [form, setForm] = useState<CreateImageAssetInput>(emptyAssetForm);
  const [editForm, setEditForm] = useState<UpdateImageAssetInput>(emptyEditForm);
  const [isAdding, setIsAdding] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ImageAsset | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ImageAsset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAssets = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`/api/characters/${characterId}/assets`);
      if (!response.ok) throw new Error("Could not load assets.");
      setAssets(await response.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load assets.");
    } finally {
      setIsLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      void loadAssets();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAssets]);

  function replaceAsset(updatedAsset: ImageAsset) {
    setAssets((items) => items.map((asset) => asset.id === updatedAsset.id ? updatedAsset : asset));
  }

  async function patchAsset(assetId: string, data: Record<string, unknown>) {
    const response = await fetch(`/api/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Could not update asset.");
    replaceAsset(payload);
    return payload as ImageAsset;
  }

  async function createAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      const response = await fetch(`/api/characters/${characterId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const asset = await response.json();
      if (!response.ok) throw new Error(asset.error ?? "Could not create asset.");
      setAssets((items) => [asset, ...items]);
      setForm(emptyAssetForm);
      setIsAdding(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create asset.");
    }
  }

  function openEditDialog(asset: ImageAsset) {
    setEditingAsset(asset);
    setEditForm({ name: asset.name, type: asset.type, provider: asset.provider, prompt: asset.prompt });
  }

  async function saveAssetDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAsset) return;
    try {
      setError(null);
      await patchAsset(editingAsset.id, editForm);
      setEditingAsset(null);
      setEditForm(emptyEditForm);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update asset.");
    }
  }

  async function deleteAsset() {
    if (!pendingDelete) return;
    try {
      setError(null);
      const response = await fetch(`/api/assets/${pendingDelete.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete asset.");
      setAssets((items) => items.filter((asset) => asset.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete asset.");
    }
  }

  return (
    <section className="atlas-section atlas-section--first">
      <div className="atlas-section-header">
        <div className="atlas-section-header__copy">
          <p className="atlas-eyebrow">Assets</p>
          <h2 className="atlas-section-title">Visual references</h2>
          <p className="atlas-section-description">
            Curated visual material that guides this character&apos;s generated assets.
          </p>
        </div>
        <button
          className="atlas-button atlas-button--secondary"
          onClick={() => setIsAdding(true)}
        >
          Add asset
        </button>
      </div>
      {error && <p className="atlas-error" role="alert">{error}</p>}
      {isLoading ? (
        <p className="atlas-status" role="status">Loading assets…</p>
      ) : assets.length === 0 ? (
        <div className="atlas-empty">
          No assets yet. Add an image URL to create the first visual reference.
        </div>
      ) : (
        <div className="atlas-asset-gallery">
          {assets.map((asset) => (
            <AssetCard
              asset={asset}
              key={asset.id}
              onDelete={() => setPendingDelete(asset)}
              onEdit={() => openEditDialog(asset)}
            />
          ))}
        </div>
      )}
      {isAdding && (
        <AssetFormDialog
          form={form}
          onClose={() => {
            setIsAdding(false);
            setForm(emptyAssetForm);
          }}
          onSubmit={createAsset}
          setForm={setForm}
        />
      )}
      {editingAsset && (
        <EditAssetDialog
          form={editForm}
          onClose={() => {
            setEditingAsset(null);
            setEditForm(emptyEditForm);
          }}
          onSubmit={saveAssetDetails}
          setForm={setEditForm}
        />
      )}
      {pendingDelete && (
        <DeleteAssetDialog
          asset={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void deleteAsset()}
        />
      )}
    </section>
  );
}

export function AssetCard({ asset, onEdit, onDelete }: { asset: ImageAsset; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className="atlas-asset-card">
      <AssetPreview asset={asset} />
      <div className="atlas-asset-card__body">
        <p className="atlas-asset-card__title">{asset.name}</p>
        <p className="atlas-asset-card__metadata">
          {asset.provider} · {asset.type}
        </p>
        <div className="atlas-asset-card__footer">
          <time className="atlas-asset-card__date">
            {new Date(asset.createdAt).toLocaleDateString()}
          </time>
          <div className="atlas-asset-card__actions">
            <button className="atlas-button atlas-button--quiet" onClick={onEdit}>
              Edit details
            </button>
            <button className="atlas-button atlas-button--danger" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// A failed remote URL is replaced in-place so card height and layout stay stable.
function AssetPreview({ asset }: { asset: ImageAsset }) {
  const [isUnavailable, setIsUnavailable] = useState(false);
  if (isUnavailable) {
    return (
      <div className="atlas-asset-preview atlas-asset-preview--unavailable">
        <span>Image unavailable</span>
      </div>
    );
  }
  return (
    <div className="atlas-asset-preview">
      <img
        alt={asset.name}
        decoding="async"
        loading="lazy"
        onError={() => setIsUnavailable(true)}
        src={asset.imageUrl}
      />
    </div>
  );
}

function AssetFormDialog({ form, setForm, onClose, onSubmit }: { form: CreateImageAssetInput; setForm: (form: CreateImageAssetInput) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="atlas-dialog-backdrop">
      <form
        aria-labelledby="add-asset-title"
        aria-modal="true"
        className="atlas-dialog atlas-dialog--md"
        onSubmit={onSubmit}
        role="dialog"
      >
        <header className="atlas-dialog__header">
          <h2 className="atlas-dialog__title" id="add-asset-title">Add asset</h2>
          <p className="atlas-dialog__description">
            The image becomes an active visual reference as soon as it is added.
          </p>
        </header>
        <div className="atlas-dialog__body">
          <AssetField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <AssetField label="Image URL" value={form.imageUrl} placeholder="https://images.unsplash.com/..." onChange={(imageUrl) => setForm({ ...form, imageUrl })} />
          <AssetField label="Asset type" value={form.type} onChange={(type) => setForm({ ...form, type })} />
          <AssetField label="Provider" value={form.provider} onChange={(provider) => setForm({ ...form, provider })} />
        </div>
        <DialogActions onClose={onClose} submitLabel="Add asset" />
      </form>
    </div>
  );
}

function EditAssetDialog({ form, setForm, onClose, onSubmit }: { form: UpdateImageAssetInput; setForm: (form: UpdateImageAssetInput) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="atlas-dialog-backdrop">
      <form
        aria-labelledby="edit-asset-title"
        aria-modal="true"
        className="atlas-dialog atlas-dialog--md"
        onSubmit={onSubmit}
        role="dialog"
      >
        <header className="atlas-dialog__header">
          <h2 className="atlas-dialog__title" id="edit-asset-title">
            Edit asset details
          </h2>
        </header>
        <div className="atlas-dialog__body">
          <AssetField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <AssetField label="Asset type" value={form.type} onChange={(type) => setForm({ ...form, type })} />
          <AssetField label="Provider" value={form.provider} onChange={(provider) => setForm({ ...form, provider })} />
          <AssetField label="Prompt" value={form.prompt ?? ""} required={false} multiline onChange={(prompt) => setForm({ ...form, prompt: prompt || null })} />
        </div>
        <DialogActions onClose={onClose} submitLabel="Save changes" />
      </form>
    </div>
  );
}

function DeleteAssetDialog({ asset, onCancel, onConfirm }: { asset: ImageAsset; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="atlas-dialog-backdrop">
      <section
        aria-labelledby="delete-asset-title"
        aria-modal="true"
        className="atlas-dialog atlas-dialog--sm"
        role="dialog"
      >
        <header className="atlas-dialog__header">
          <h2 className="atlas-dialog__title" id="delete-asset-title">
            Delete {asset.name}?
          </h2>
          <p className="atlas-dialog__description">
            This removes the asset record from the local database. It cannot be undone.
          </p>
        </header>
        <footer className="atlas-dialog__footer">
          <button className="atlas-button atlas-button--quiet" onClick={onCancel}>
            Cancel
          </button>
          <button className="atlas-button atlas-button--danger" onClick={onConfirm}>
            Delete asset
          </button>
        </footer>
      </section>
    </div>
  );
}

function DialogActions({ onClose, submitLabel, destructive = false }: { onClose: () => void; submitLabel: string; destructive?: boolean }) {
  return <footer className="atlas-dialog__footer"><button className="atlas-button atlas-button--quiet" type="button" onClick={onClose}>Cancel</button><button className={`atlas-button ${destructive ? "atlas-button--danger" : "atlas-button--primary"}`}>{submitLabel}</button></footer>;
}

function AssetField({ label, value, placeholder, required = true, multiline = false, onChange }: { label: string; value: string; placeholder?: string; required?: boolean; multiline?: boolean; onChange: (value: string) => void }) {
  return <label className="atlas-label mt-4">{label}{multiline ? <textarea className="atlas-control min-h-24" required={required} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input className="atlas-control" required={required} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}</label>;
}
