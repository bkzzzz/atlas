"use client";
/* eslint-disable @next/next/no-img-element -- Asset URLs are user-entered and not restricted to known image domains yet. */

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ASSET_STATUSES,
  type AssetStatus,
  type CreateImageAssetInput,
  type ImageAsset,
  type UpdateImageAssetInput,
} from "@/lib/assets";

const emptyAssetForm: CreateImageAssetInput = {
  name: "",
  imageUrl: "",
  type: "Reference",
  provider: "Manual",
  status: "PENDING",
};

const emptyEditForm: UpdateImageAssetInput = {
  name: "",
  type: "",
  provider: "",
  prompt: null,
  feedback: null,
};

// Asset state stays with this section so changing character details does not
// require the parent Character Studio component to know asset API details.
export function AssetSection({ characterId }: { characterId: string }) {
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [form, setForm] = useState<CreateImageAssetInput>(emptyAssetForm);
  const [editForm, setEditForm] = useState<UpdateImageAssetInput>(emptyEditForm);
  const [isAdding, setIsAdding] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ImageAsset | null>(null);
  const [rejectingAsset, setRejectingAsset] = useState<ImageAsset | null>(null);
  const [rejectionFeedback, setRejectionFeedback] = useState("");
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

  async function approveAsset(asset: ImageAsset) {
    try {
      setError(null);
      await patchAsset(asset.id, { status: "APPROVED" });
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not approve asset.");
    }
  }

  function openEditDialog(asset: ImageAsset) {
    setEditingAsset(asset);
    setEditForm({ name: asset.name, type: asset.type, provider: asset.provider, prompt: asset.prompt, feedback: asset.feedback });
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

  async function rejectAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rejectingAsset || !rejectionFeedback.trim()) return;
    try {
      setError(null);
      await patchAsset(rejectingAsset.id, { status: "REJECTED", feedback: rejectionFeedback });
      setRejectingAsset(null);
      setRejectionFeedback("");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not reject asset.");
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

  return <section className="mt-10 max-w-4xl">
    <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">Assets</p><h2 className="mt-1 text-xl font-semibold">Visual references</h2></div><button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:border-violet-400/60" onClick={() => setIsAdding(true)}>Add asset</button></div>
    {error && <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
    {isLoading ? <p className="mt-5 text-sm text-slate-400">Loading assets…</p> : assets.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-white/15 p-7 text-sm text-slate-400">No assets yet. Add a mock image URL to create the first visual reference.</div> : <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{assets.map((asset) => <AssetCard asset={asset} key={asset.id} onApprove={() => void approveAsset(asset)} onReject={() => { setRejectingAsset(asset); setRejectionFeedback(asset.feedback ?? ""); }} onEdit={() => openEditDialog(asset)} onDelete={() => setPendingDelete(asset)} />)}</div>}
    {isAdding && <AssetFormDialog form={form} setForm={setForm} onClose={() => { setIsAdding(false); setForm(emptyAssetForm); }} onSubmit={createAsset} />}
    {editingAsset && <EditAssetDialog form={editForm} setForm={setEditForm} onClose={() => { setEditingAsset(null); setEditForm(emptyEditForm); }} onSubmit={saveAssetDetails} />}
    {rejectingAsset && <RejectAssetDialog asset={rejectingAsset} feedback={rejectionFeedback} setFeedback={setRejectionFeedback} onClose={() => { setRejectingAsset(null); setRejectionFeedback(""); }} onSubmit={rejectAsset} />}
    {pendingDelete && <DeleteAssetDialog asset={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={() => void deleteAsset()} />}
  </section>;
}

function AssetCard({ asset, onApprove, onReject, onEdit, onDelete }: { asset: ImageAsset; onApprove: () => void; onReject: () => void; onEdit: () => void; onDelete: () => void }) {
  return <article className="overflow-hidden rounded-xl border border-white/10 bg-white/[.03]"><img className="h-36 w-full bg-slate-900 object-cover" src={asset.imageUrl} alt={asset.name} /><div className="p-4"><div className="flex items-start justify-between gap-2"><p className="font-semibold">{asset.name}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClass(asset.status)}`}>{asset.status}</span></div><p className="mt-2 text-sm text-slate-400">{asset.provider} · {asset.type}</p>{asset.feedback && <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/[.06] p-2 text-xs leading-5 text-rose-100"><span className="font-semibold">Feedback: </span>{asset.feedback}</p>}<div className="mt-3 flex items-center justify-between gap-2"><time className="text-xs text-slate-500">{new Date(asset.createdAt).toLocaleDateString()}</time><div className="flex gap-2 text-xs"><button className="text-emerald-300 hover:text-emerald-200" onClick={onApprove}>Approve</button><button className="text-amber-300 hover:text-amber-200" onClick={onReject}>Reject</button><button className="text-slate-300 hover:text-white" onClick={onEdit}>Edit</button><button className="text-rose-300 hover:text-rose-200" onClick={onDelete}>Delete</button></div></div></div></article>;
}

function statusClass(status: AssetStatus) {
  if (status === "APPROVED") return "bg-emerald-500/15 text-emerald-200";
  if (status === "REJECTED") return "bg-rose-500/15 text-rose-200";
  return "bg-amber-500/15 text-amber-200";
}

function AssetFormDialog({ form, setForm, onClose, onSubmit }: { form: CreateImageAssetInput; setForm: (form: CreateImageAssetInput) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-10 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"><form className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#151c32] p-6" onSubmit={onSubmit}><h2 className="text-xl font-semibold">Add asset</h2><p className="mt-1 text-sm text-slate-400">Use a public mock image URL for now. Uploads and AI generation are not part of this step.</p><AssetField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} /><AssetField label="Image URL" value={form.imageUrl} placeholder="https://images.unsplash.com/..." onChange={(imageUrl) => setForm({ ...form, imageUrl })} /><AssetField label="Asset type" value={form.type} onChange={(type) => setForm({ ...form, type })} /><AssetField label="Provider" value={form.provider} onChange={(provider) => setForm({ ...form, provider })} /><StatusField status={form.status} setStatus={(status) => setForm({ ...form, status })} /><DialogActions onClose={onClose} submitLabel="Add asset" /></form></div>;
}

function EditAssetDialog({ form, setForm, onClose, onSubmit }: { form: UpdateImageAssetInput; setForm: (form: UpdateImageAssetInput) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-10 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"><form className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#151c32] p-6" onSubmit={onSubmit}><h2 className="text-xl font-semibold">Edit asset details</h2><AssetField label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} /><AssetField label="Asset type" value={form.type} onChange={(type) => setForm({ ...form, type })} /><AssetField label="Provider" value={form.provider} onChange={(provider) => setForm({ ...form, provider })} /><AssetField label="Prompt" value={form.prompt ?? ""} required={false} multiline onChange={(prompt) => setForm({ ...form, prompt: prompt || null })} /><AssetField label="Feedback" value={form.feedback ?? ""} required={false} multiline onChange={(feedback) => setForm({ ...form, feedback: feedback || null })} /><DialogActions onClose={onClose} submitLabel="Save changes" /></form></div>;
}

function RejectAssetDialog({ asset, feedback, setFeedback, onClose, onSubmit }: { asset: ImageAsset; feedback: string; setFeedback: (feedback: string) => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="fixed inset-0 z-10 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"><form className="w-full max-w-md rounded-2xl border border-white/10 bg-[#151c32] p-6" onSubmit={onSubmit}><h2 className="text-xl font-semibold">Reject {asset.name}?</h2><p className="mt-2 text-sm text-slate-400">Describe what should change before this asset can be approved.</p><AssetField label="Rejection feedback" value={feedback} multiline onChange={setFeedback} /><DialogActions onClose={onClose} submitLabel="Reject asset" destructive /></form></div>;
}

function DeleteAssetDialog({ asset, onCancel, onConfirm }: { asset: ImageAsset; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-10 grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm"><section aria-modal="true" role="dialog" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#151c32] p-6"><h2 className="text-xl font-semibold">Delete {asset.name}?</h2><p className="mt-2 text-sm leading-6 text-slate-400">This removes the asset record from the local database. It cannot be undone.</p><div className="mt-6 flex justify-end gap-3"><button className="px-4 py-2 text-sm text-slate-300" onClick={onCancel}>Cancel</button><button className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400" onClick={onConfirm}>Delete asset</button></div></section></div>;
}

function DialogActions({ onClose, submitLabel, destructive = false }: { onClose: () => void; submitLabel: string; destructive?: boolean }) {
  return <div className="mt-6 flex justify-end gap-3"><button className="px-4 py-2 text-sm text-slate-300" type="button" onClick={onClose}>Cancel</button><button className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${destructive ? "bg-rose-500 hover:bg-rose-400" : "bg-violet-500 hover:bg-violet-400"}`}>{submitLabel}</button></div>;
}

function StatusField({ status, setStatus }: { status: AssetStatus; setStatus: (status: AssetStatus) => void }) {
  return <label className="mt-4 block text-sm font-medium">Status<select className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none focus:border-violet-400" value={status} onChange={(event) => setStatus(event.target.value as AssetStatus)}>{ASSET_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>;
}

function AssetField({ label, value, placeholder, required = true, multiline = false, onChange }: { label: string; value: string; placeholder?: string; required?: boolean; multiline?: boolean; onChange: (value: string) => void }) {
  const className = "mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none placeholder:text-slate-600 focus:border-violet-400";
  return <label className="mt-4 block text-sm font-medium">{label}{multiline ? <textarea className={`${className} min-h-24`} required={required} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input className={className} required={required} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}</label>;
}
