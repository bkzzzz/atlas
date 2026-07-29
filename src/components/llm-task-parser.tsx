"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ASSET_TYPES,
  generateCompiledProduct,
  runProductParse,
  type AssetType,
  type GeneratedImage,
  type ParseTaskResult,
  type ProductGenerationInput,
} from "@/lib/asset-generation-flow";
import {
  isKenneyReference,
  referencePreviewUrl,
  type ArtDirectionRetrievalResult,
  type SelectableReference,
} from "@/lib/reference-retrieval";
import {
  DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
  GROUND_SHADOW_OPTIONS,
  MAX_NATURAL_LANGUAGE_REQUEST_LENGTH,
  PIXEL_ART_DETAILS,
  STATIC_IMAGE_BACKGROUNDS,
  STATIC_IMAGE_VIEW_ANGLES,
  STATIC_IMAGE_VISUAL_STYLES,
  type StaticImageAssetSettings,
} from "@/lib/task-mode";

const VISUAL_STYLE_LABELS: Record<StaticImageAssetSettings["visualStyle"], string> = {
  PIXEL_ART: "Pixel art",
  VECTOR_STYLE: "Flat illustration",
  ILLUSTRATION: "Illustration",
};
const VIEW_ANGLE_LABELS: Record<StaticImageAssetSettings["viewAngle"], string> = {
  SIDE: "Side",
  FRONT: "Front",
  TOP_DOWN: "Top-down",
  ISOMETRIC: "Isometric",
  THREE_QUARTER: "Three-quarter",
  UNSPECIFIED: "Art director decides",
};
const BACKGROUND_LABELS: Record<StaticImageAssetSettings["background"], string> = {
  TRANSPARENT: "Transparent",
  WHITE: "White",
  SIMPLE_SOLID: "Simple solid",
  UNSPECIFIED: "Art director decides",
};
const PIXEL_DETAIL_LABELS: Record<StaticImageAssetSettings["pixelDetail"], string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};
const GROUND_SHADOW_LABELS: Record<StaticImageAssetSettings["groundShadow"], string> = {
  ALLOW: "Allow",
  NONE: "None",
};

type Props = {
  characterId: string;
  characterName: string;
};

export function LlmTaskParser({ characterId, characterName }: Props) {
  const [projectBrief, setProjectBrief] = useState("");
  const [assetRequest, setAssetRequest] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("CHARACTER_SPRITE");
  const [assetSettings, setAssetSettings] = useState<StaticImageAssetSettings>(
    DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
  );
  const [draftSpec, setDraftSpec] = useState<ParseTaskResult | null>(null);
  const [referenceResults, setReferenceResults] = useState<
    ArtDirectionRetrievalResult[]
  >([]);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);
  const [refinedSpec, setRefinedSpec] = useState<ParseTaskResult | null>(null);
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const [busyStep, setBusyStep] = useState<
    "draft" | "retrieve" | "refine" | "generate" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const selectedReferences = selectedReferenceIds
    .map((id) => referenceResults.find(({ reference }) => reference.id === id)?.reference)
    .filter((reference): reference is SelectableReference => Boolean(reference));

  function clearAfterBrief() {
    setDraftSpec(null);
    setReferenceResults([]);
    setSelectedReferenceIds([]);
    setRefinedSpec(null);
    setImage(null);
    setError(null);
  }

  function clearAfterReferenceSelection() {
    setRefinedSpec(null);
    setImage(null);
    setError(null);
  }

  function updateAssetSetting<Key extends keyof StaticImageAssetSettings>(
    field: Key,
    value: StaticImageAssetSettings[Key],
  ) {
    setAssetSettings((current) => ({ ...current, [field]: value }));
    clearAfterBrief();
  }

  function artDirection() {
    return [
      `Project brief: ${projectBrief.trim()}`,
      `Asset request: ${assetRequest.trim()}`,
    ].join("\n");
  }

  function productInput(
    references: readonly SelectableReference[],
  ): ProductGenerationInput {
    return {
      characterId,
      characterName,
      assetType,
      artDirection: artDirection(),
      assetSettings,
      styleSourceCharacterId: null,
      selectedReferences: references,
    };
  }

  async function requestJson(url: string, body: unknown) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Atlas returned an unreadable response.");
    }
    if (!response.ok) {
      const message =
        payload && typeof payload === "object" && "error" in payload
          ? (payload as { error?: unknown }).error
          : null;
      throw new Error(
        typeof message === "string" ? message : "Atlas could not complete this step.",
      );
    }
    return payload;
  }

  async function generateDraft() {
    if (!projectBrief.trim() || !assetRequest.trim()) {
      setError("Add a project brief and an asset request first.");
      return;
    }
    try {
      setBusyStep("draft");
      clearAfterBrief();
      const result = await runProductParse(productInput([]), requestJson);
      setDraftSpec({ ...result, generationToken: null });
    } catch (draftError) {
      setError(messageFrom(draftError, "Could not create the draft StyleSpec."));
    } finally {
      setBusyStep(null);
    }
  }

  async function retrieveFromDraft() {
    if (!draftSpec) return;
    const task = draftSpec.parsedTask;
    try {
      setBusyStep("retrieve");
      setReferenceResults([]);
      setSelectedReferenceIds([]);
      setRefinedSpec(null);
      setImage(null);
      setError(null);
      const payload = (await requestJson("/api/references/retrieve", {
        query: {
          projectBrief: [
            projectBrief,
            task.visualStyle,
            task.composition,
            task.background,
            ...task.positiveConstraints,
          ].join(" "),
          assetRequest: [
            assetRequest,
            task.visualSubject,
            task.assetKind,
          ].join(" "),
          assetType,
          settings: assetSettings,
        },
      })) as { results?: unknown };
      if (!Array.isArray(payload.results)) {
        throw new Error("Atlas returned invalid reference results.");
      }
      const results = payload.results as ArtDirectionRetrievalResult[];
      setReferenceResults(results);
      setError(
        results.length
          ? null
          : "No curated references matched this direction. Try a more specific brief.",
      );
    } catch (retrievalError) {
      setError(
        messageFrom(retrievalError, "Could not retrieve references."),
      );
    } finally {
      setBusyStep(null);
    }
  }

  function toggleReference(id: string) {
    if (!selectedReferenceIds.includes(id) && selectedReferenceIds.length === 3) {
      setError("Choose up to three references.");
      return;
    }
    setSelectedReferenceIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      return [...current, id];
    });
    clearAfterReferenceSelection();
  }

  async function refineStyleSpec() {
    if (selectedReferences.length < 1 || selectedReferences.length > 3) {
      setError("Choose one to three references first.");
      return;
    }
    try {
      setBusyStep("refine");
      setRefinedSpec(null);
      setImage(null);
      setError(null);
      const result = await runProductParse(productInput(selectedReferences), requestJson);
      if (!result.generationToken) {
        throw new Error("Atlas could not approve this StyleSpec for generation.");
      }
      setRefinedSpec(result);
    } catch (refineError) {
      setError(messageFrom(refineError, "Could not refine the StyleSpec."));
    } finally {
      setBusyStep(null);
    }
  }

  async function generateAsset() {
    const generationToken = refinedSpec?.generationToken;
    if (!generationToken) return;
    try {
      setBusyStep("generate");
      setImage(null);
      setError(null);
      setRefinedSpec((current) =>
        current ? { ...current, generationToken: null } : current,
      );
      setImage(await generateCompiledProduct(generationToken, requestJson));
    } catch (generationError) {
      setError(
        `${messageFrom(generationError, "Could not generate the image.")} Rebuild the refined StyleSpec to try again.`,
      );
    } finally {
      setBusyStep(null);
    }
  }

  const inputLength = artDirection().length + characterName.length + 140;
  const inputTooLong = inputLength > MAX_NATURAL_LANGUAGE_REQUEST_LENGTH;
  const disabled = busyStep !== null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <div className="mb-8 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-violet-300">
          Art direction workflow
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Direct one coherent game asset.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Shape the direction, choose visual references, then generate one production-ready PNG.
        </p>
      </div>

      {error && (
        <p className="mb-5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-5">
        <WorkflowSection number="01" title="Project brief" active>
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_220px]">
            <label className="block text-sm font-medium text-slate-200">
              Project brief
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 outline-none placeholder:text-slate-600 focus:border-violet-400"
                disabled={disabled}
                maxLength={3600}
                onChange={(event) => {
                  setProjectBrief(event.target.value);
                  clearAfterBrief();
                }}
                placeholder="A cozy woodland RPG with warm, handcrafted pixel art and gentle folklore."
                value={projectBrief}
              />
            </label>
            <label className="block text-sm font-medium text-slate-200">
              Asset request
              <textarea
                className="mt-2 min-h-28 w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 outline-none placeholder:text-slate-600 focus:border-violet-400"
                disabled={disabled}
                maxLength={3600}
                onChange={(event) => {
                  setAssetRequest(event.target.value);
                  clearAfterBrief();
                }}
                placeholder="A full-body mushroom merchant carrying a tiny lantern."
                value={assetRequest}
              />
            </label>
            <label className="block text-sm font-medium text-slate-200">
              Asset type
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm outline-none focus:border-violet-400"
                disabled={disabled}
                onChange={(event) => {
                  setAssetType(event.target.value as AssetType);
                  clearAfterBrief();
                }}
                value={assetType}
              >
                {ASSET_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </label>
          </div>

          <details className="mt-4 rounded-xl border border-white/10 bg-black/10 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-300">
              Advanced
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <AssetSettingSelect label="Visual style" disabled={disabled} value={assetSettings.visualStyle} options={STATIC_IMAGE_VISUAL_STYLES} labels={VISUAL_STYLE_LABELS} onChange={(value) => updateAssetSetting("visualStyle", value)} />
              <AssetSettingSelect label="View" disabled={disabled} value={assetSettings.viewAngle} options={STATIC_IMAGE_VIEW_ANGLES} labels={VIEW_ANGLE_LABELS} onChange={(value) => updateAssetSetting("viewAngle", value)} />
              <AssetSettingSelect label="Background" disabled={disabled} value={assetSettings.background} options={STATIC_IMAGE_BACKGROUNDS} labels={BACKGROUND_LABELS} onChange={(value) => updateAssetSetting("background", value)} />
              {assetSettings.visualStyle === "PIXEL_ART" && (
                <AssetSettingSelect label="Pixel detail" disabled={disabled} value={assetSettings.pixelDetail} options={PIXEL_ART_DETAILS} labels={PIXEL_DETAIL_LABELS} onChange={(value) => updateAssetSetting("pixelDetail", value)} />
              )}
              <AssetSettingSelect label="Ground shadow" disabled={disabled} value={assetSettings.groundShadow} options={GROUND_SHADOW_OPTIONS} labels={GROUND_SHADOW_LABELS} onChange={(value) => updateAssetSetting("groundShadow", value)} />
            </div>
          </details>

          {inputTooLong && (
            <p className="mt-3 text-xs text-amber-300">
              Shorten the brief or request before creating the StyleSpec.
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <PrimaryButton
              disabled={disabled || inputTooLong || !projectBrief.trim() || !assetRequest.trim()}
              onClick={() => void generateDraft()}
            >
              {busyStep === "draft" ? "Directing…" : draftSpec ? "Regenerate draft" : "Generate draft StyleSpec"}
            </PrimaryButton>
            {draftSpec && <span className="text-sm text-emerald-300">Draft direction ready</span>}
          </div>
          {draftSpec && <StyleSpecSummary result={draftSpec} label="Draft direction" />}
        </WorkflowSection>

        <WorkflowSection number="02" title="Curated references" active={Boolean(draftSpec)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm leading-6 text-slate-400">
              Atlas ranks a small local collection using the draft StyleSpec. Reference previews are shown here; selected references guide generation through metadata, not visual input.
            </p>
            <SecondaryButton
              disabled={!draftSpec || disabled}
              onClick={() => void retrieveFromDraft()}
            >
              {busyStep === "retrieve"
                ? "Finding…"
                : referenceResults.length
                  ? "Rank again"
                  : "Find references"}
            </SecondaryButton>
          </div>
          {referenceResults.length ? (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {referenceResults.map(({ reference, score, matchedFields }) => {
                  const selected = selectedReferenceIds.includes(reference.id);
                  return (
                    <button
                      aria-pressed={selected}
                      className={`overflow-hidden rounded-xl border text-left transition ${
                        selected
                          ? "border-violet-400 bg-violet-500/10 ring-1 ring-violet-400"
                          : "border-white/10 bg-slate-950/30 hover:border-white/25"
                      }`}
                      disabled={disabled}
                      key={reference.id}
                      onClick={() => toggleReference(reference.id)}
                      type="button"
                    >
                      <Image
                        alt=""
                        className="h-36 w-full object-cover"
                        height={288}
                        src={referencePreviewUrl(reference)}
                        unoptimized={isKenneyReference(reference)}
                        width={480}
                      />
                      <span className="block p-3">
                        <span className="flex items-center justify-between gap-3">
                          <span className="font-medium text-slate-100">{reference.title}</span>
                          <span className="text-xs text-slate-500">{Math.round(score)} match</span>
                        </span>
                        <span className="mt-1 block text-xs capitalize text-slate-400">
                          {isKenneyReference(reference)
                            ? `${reference.category} · ${reference.pack}`
                            : `${reference.medium[0]} · ${reference.mood[0]} · ${reference.detailDensity} detail`}
                        </span>
                        <span className="mt-2 block text-[11px] text-slate-500">
                          {matchedFields.length
                            ? `Matched ${matchedFields
                                .slice(0, 3)
                                .map(humanizeField)
                                .join(", ")}`
                            : "Semantic match"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {selectedReferenceIds.length}/3 selected
              </p>
            </>
          ) : (
            <LockedHint>{draftSpec ? "Find references to compare the strongest directions." : "Create a draft StyleSpec to unlock reference ranking."}</LockedHint>
          )}
        </WorkflowSection>

        <WorkflowSection number="03" title="Refined StyleSpec" active={selectedReferences.length > 0}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm leading-6 text-slate-400">
              Selected metadata is folded back into the art direction before generation.
            </p>
            <SecondaryButton disabled={disabled || selectedReferences.length === 0} onClick={() => void refineStyleSpec()}>
              {busyStep === "refine" ? "Refining…" : refinedSpec ? "Rebuild StyleSpec" : "Refine StyleSpec"}
            </SecondaryButton>
          </div>
          {refinedSpec ? (
            <StyleSpecSummary result={refinedSpec} label="Final direction" references={selectedReferences} />
          ) : (
            <LockedHint>Select one to three references, then refine the StyleSpec.</LockedHint>
          )}
        </WorkflowSection>

        <WorkflowSection number="04" title="Generation result" active={Boolean(refinedSpec)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm leading-6 text-slate-400">
              Generate one PNG from the approved direction.
            </p>
            <PrimaryButton disabled={disabled || !refinedSpec?.generationToken} onClick={() => void generateAsset()}>
              {busyStep === "generate" ? "Generating…" : image ? "Generated" : "Generate asset"}
            </PrimaryButton>
          </div>
          {image ? (
            <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,420px)_1fr] sm:items-end">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(45deg,#151a2b_25%,transparent_25%),linear-gradient(-45deg,#151a2b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#151a2b_75%),linear-gradient(-45deg,transparent_75%,#151a2b_75%)] bg-[length:24px_24px]">
                <Image alt={`Generated ${ASSET_TYPES.find(({ value }) => value === assetType)?.label.toLowerCase()}`} className="aspect-square h-auto w-full object-contain" height={1024} src={image.imageUrl} unoptimized width={1024} />
              </div>
              <div>
                <p className="text-lg font-medium text-white">Your asset is ready.</p>
                <p className="mt-1 text-sm text-slate-400">PNG · one generated asset</p>
                <a className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-100" download={`${slugify(characterName)}-${assetType.toLowerCase()}.png`} href={image.imageUrl}>
                  Download PNG
                </a>
              </div>
            </div>
          ) : (
            <LockedHint>{refinedSpec ? "The direction is approved. Generate when you are ready." : "Refine the StyleSpec to unlock generation."}</LockedHint>
          )}
        </WorkflowSection>
      </div>
    </div>
  );
}

function WorkflowSection({
  number,
  title,
  active,
  children,
}: {
  number: string;
  title: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border p-5 transition sm:p-6 ${active ? "border-white/15 bg-white/[.035]" : "border-white/[.07] bg-white/[.015]"}`}>
      <div className="mb-5 flex items-center gap-3">
        <span className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-semibold ${active ? "bg-violet-500 text-white" : "bg-white/5 text-slate-600"}`}>
          {number}
        </span>
        <h2 className={`font-semibold ${active ? "text-white" : "text-slate-500"}`}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StyleSpecSummary({
  result,
  label,
  references = [],
}: {
  result: ParseTaskResult;
  label: string;
  references?: readonly SelectableReference[];
}) {
  const task = result.parsedTask;
  const constraints = task.positiveConstraints.slice(0, 4);
  return (
    <div className="mt-5 rounded-xl border border-violet-400/20 bg-violet-500/[.06] p-4">
      <p className="text-xs font-semibold uppercase tracking-[.15em] text-violet-300">{label}</p>
      <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <SpecItem label="Subject" value={task.visualSubject} />
        <SpecItem label="Style" value={task.visualStyle} />
        <SpecItem label="Composition" value={task.composition} />
        <SpecItem label="Background" value={task.background} />
      </div>
      {(constraints.length > 0 || references.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {constraints.map((constraint) => <Chip key={constraint}>{constraint}</Chip>)}
          {references.map((reference) => <Chip key={reference.id}>{reference.title}</Chip>)}
        </div>
      )}
    </div>
  );
}

function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 line-clamp-3 leading-5 text-slate-200">{value}</p>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">{children}</span>;
}

function LockedHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-5 rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-slate-500">{children}</p>;
}

function PrimaryButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button className="rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-violet-400/60 hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-35" disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function AssetSettingSelect<Option extends string>({
  label,
  disabled,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  disabled: boolean;
  value: Option;
  options: readonly Option[];
  labels: Record<Option, string>;
  onChange: (value: Option) => void;
}) {
  return (
    <label className="text-xs font-medium text-slate-400">
      {label}
      <select className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-violet-400" disabled={disabled} onChange={(event) => onChange(event.target.value as Option)} value={value}>
        {options.map((option) => <option key={option} value={option}>{labels[option]}</option>)}
      </select>
    </label>
  );
}

function humanizeField(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "atlas";
}
