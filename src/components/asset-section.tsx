"use client";
/* eslint-disable @next/next/no-img-element -- Asset URLs are user-entered and not restricted to known image domains yet. */

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { CreateImageAssetInput, ImageAsset } from "@/lib/assets";

const emptyAssetForm: CreateImageAssetInput = {
  name: "",
  imageUrl: "",
  type: "Reference",
  provider: "Manual",
  status: "Draft",
};

// Asset state stays with this section so changing character details does not
// require the parent Character Studio component to know asset API details.
export function AssetSection({ characterId }: { characterId: string }) {
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [form, setForm] = useState<CreateImageAssetInput>(emptyAssetForm);
  const [isAdding, setIsAdding] = useState(false);
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
    // Start the browser request after render, matching the existing data-loading pattern.
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      void loadAssets();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAssets]);

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
    <section className="mt-10 max-w-4xl">
      <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">Assets</p><h2 className="mt-1 text-xl font-semibold">Visual references</h2></div><button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:border-violet-400/60" onClick={() => setIsAdding(true)}>Add asset</button></div>
      {error && <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {isLoading ? <p className="mt-5 text-sm text-slate-400">Loading assets…</p> : assets.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-white/15 p-7 text-sm text-slate-400">No assets yet. Add a mock image URL to create the first visual reference.</div> : <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{assets.map((asset) => <AssetCard asset={asset} key={asset.id} onDelete={() => setPendingDelete(asset)} />)}</div>}

      {isAdding && <AssetFormDialog form={form} setForm={setForm} onClose={() => { setIsAdding(false); setForm(emptyAssetForm); }} onSubmit={createAsset} />}
      {pendingDelete && <DeleteAssetDialog asset={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteAsset()} />}
    </section>
  );
}

function AssetCard({ asset, onDelete }: { asset: ImageAsset; onDelete: () => void }) {
  return <article className="overflow-hidden rounded-xl border border-white/10 bg-white/[.03]"><img className="h-36 w-full object-cover bg-slate-900" src={asset.imageUrl} alt={asset.name} /><div className="p-4"><div className="flex items-start justify-between gap-2"><p className="font-semibold">{asset.name}</p><button className="text-xs text-rose-300 hover:text-rose-200" onClick={onDelete}>Delete</button></div><p className="mt-2 text-sm text-slate-400">{asset.provider} · {asset.type}</p><div className="mt-3 flex items-center justify-between gap-2"><span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-200">{asset.status}</span><time className="text-xs text-slate-500">{new Date(asset.createdAt).toLocaleDateString()}</time></div></div></article>;
}

function AssetFormDialog({ form, setForm, onClose, onSubmit }: { form: CreateImageAssetInput; setForm: (form: CreateImageAssetInput) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-10 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"><form className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#151c32] p-6" onSubmit={onSubmit}><h2 className="text-xl font-semibold">Add asset</h2><p className="mt-1 text-sm text-slate-400">Use a public mock image URL for now. Uploads and AI generation are not part of this step.</p><AssetField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} /><AssetField label="Image URL" value={form.imageUrl} placeholder="https://images.unsplash.com/..." onChange={(imageUrl) => setForm({ ...form, imageUrl })} /><AssetField label="Asset type" value={form.type} onChange={(type) => setForm({ ...form, type })} /><AssetField label="Provider" value={form.provider} onChange={(provider) => setForm({ ...form, provider })} /><AssetField label="Status" value={form.status} onChange={(status) => setForm({ ...form, status })} /><div className="mt-6 flex justify-end gap-3"><button className="px-4 py-2 text-sm text-slate-300" type="button" onClick={onClose}>Cancel</button><button className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold hover:bg-violet-400">Add asset</button></div></form></div>;
}

function DeleteAssetDialog({ asset, onCancel, onConfirm }: { asset: ImageAsset; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-10 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"><section aria-modal="true" role="dialog" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#151c32] p-6"><h2 className="text-xl font-semibold">Delete {asset.name}?</h2><p className="mt-2 text-sm leading-6 text-slate-400">This removes the asset record from the local database. It cannot be undone.</p><div className="mt-6 flex justify-end gap-3"><button className="px-4 py-2 text-sm text-slate-300" onClick={onCancel}>Cancel</button><button className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400" onClick={onConfirm}>Delete asset</button></div></section></div>;
}

function AssetField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (value: string) => void }) {
  return <label className="mt-4 block text-sm font-medium">{label}<input className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none placeholder:text-slate-600 focus:border-violet-400" required value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}
