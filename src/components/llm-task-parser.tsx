"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import {
  ASSET_TYPES,
  ASSET_WORKFLOWS,
  runProductGeneration,
  type AssetType,
  type GeneratedImage,
  type ProductGenerationInput,
} from "@/lib/asset-generation-flow";
import {
  DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
  GROUND_SHADOW_OPTIONS,
  PIXEL_ART_DETAILS,
  STATIC_IMAGE_BACKGROUNDS,
  STATIC_IMAGE_VIEW_ANGLES,
  STATIC_IMAGE_VISUAL_STYLES,
  type StaticImageAssetSettings,
} from "@/lib/task-mode";

const VISUAL_STYLE_LABELS: Record<StaticImageAssetSettings["visualStyle"], string> = {
  PIXEL_ART: "Pixel art",
  VECTOR_STYLE: "Flat Illustration",
  ILLUSTRATION: "Illustration",
};
const VIEW_ANGLE_LABELS: Record<StaticImageAssetSettings["viewAngle"], string> = {
  SIDE: "Side",
  FRONT: "Front",
  TOP_DOWN: "Top-down",
  ISOMETRIC: "Isometric",
  THREE_QUARTER: "Three-quarter",
  UNSPECIFIED: "Unspecified",
};
const BACKGROUND_LABELS: Record<StaticImageAssetSettings["background"], string> = {
  TRANSPARENT: "Transparent",
  WHITE: "White",
  SIMPLE_SOLID: "Simple solid",
  UNSPECIFIED: "Unspecified",
};
const PIXEL_DETAIL_LABELS: Record<StaticImageAssetSettings["pixelDetail"], string> = {
  LOW: "Low detail",
  MEDIUM: "Medium detail",
  HIGH: "High detail",
};
const GROUND_SHADOW_LABELS: Record<StaticImageAssetSettings["groundShadow"], string> = {
  ALLOW: "Allow",
  NONE: "None",
};

type Props = {
  characterId: string;
  characterName: string;
  styleCharacters?: Array<{ id: string; name: string }>;
};

export function LlmTaskParser({
  characterId,
  characterName,
  styleCharacters = [],
}: Props) {
  const [assetType, setAssetType] = useState<AssetType>("CHARACTER_SPRITE");
  const [artDirection, setArtDirection] = useState("");
  const [styleSourceMode, setStyleSourceMode] = useState<"NEW" | "INHERIT">("NEW");
  const [styleSourceCharacterId, setStyleSourceCharacterId] = useState(
    styleCharacters[0]?.id ?? "",
  );
  const [assetSettings, setAssetSettings] = useState<StaticImageAssetSettings>(
    DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
  );
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const input: ProductGenerationInput = {
    characterId,
    characterName,
    assetType,
    artDirection,
    assetSettings,
    styleSourceCharacterId:
      styleSourceMode === "INHERIT" ? styleSourceCharacterId : null,
  };

  function clearCompiledState() {
    setImage(null);
    setError(null);
  }

  function updateAssetSetting<Key extends keyof StaticImageAssetSettings>(
    field: Key,
    value: StaticImageAssetSettings[Key],
  ) {
    setAssetSettings((current) => ({ ...current, [field]: value }));
    clearCompiledState();
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
      throw new Error(response.ok
        ? "Atlas returned an invalid JSON response."
        : "Atlas could not complete the asset request.");
    }
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: unknown }).error
        : null;
      throw new Error(typeof message === "string" ? message : "Atlas could not complete the asset request.");
    }
    return payload;
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsGenerating(true);
      clearCompiledState();
      const generated = await runProductGeneration(input, requestJson);
      setImage(generated.image);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Could not generate the image.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="mt-8 max-w-4xl border-t border-white/10 pt-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-violet-300">
          Asset production
        </p>
        <h2 className="mt-1 text-xl font-semibold">Create game asset</h2>
        <p className="mt-1 text-sm text-slate-400">
          Atlas prepares the art direction and production prompt for you.
        </p>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Asset workflow">
        {ASSET_WORKFLOWS.map((workflow) => (
          <button
            aria-pressed={workflow.executable ? true : undefined}
            className={`rounded-lg border px-3 py-3 text-left text-sm ${
              workflow.executable
                ? "border-violet-400/50 bg-violet-500/10 text-violet-100"
                : "cursor-not-allowed border-white/10 text-slate-500"
            }`}
            disabled={!workflow.executable || isGenerating}
            key={workflow.value}
            type="button"
          >
            <span className="block font-medium">{workflow.label}</span>
            <span className="mt-1 block text-xs">{workflow.description}</span>
          </button>
        ))}
      </div>

      <form
        className="mt-4 rounded-xl border border-white/10 bg-white/[.03] p-4"
        onSubmit={generate}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Character
            <input
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/30 px-3 py-2.5 text-slate-300"
              readOnly
              value={characterName}
            />
          </label>
          <label className="block text-sm font-medium">
            Asset type
            <select
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none focus:border-violet-400"
              disabled={isGenerating}
              onChange={(event) => {
                setAssetType(event.target.value as AssetType);
                clearCompiledState();
              }}
              value={assetType}
            >
              {ASSET_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="mt-4 rounded-xl border border-white/10 bg-white/[.025] p-4">
          <legend className="px-1 text-sm font-semibold text-slate-200">
            Style source
          </legend>
          <p className="mt-1 text-xs text-slate-500">
            Create a fresh style or borrow another character&apos;s established theme.
            Visual style remains independent.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StyleSourceOption
              checked={styleSourceMode === "NEW"}
              disabled={isGenerating}
              description="Use the visual style selected below without inheriting another character."
              label="Create a new style"
              onChange={() => {
                setStyleSourceMode("NEW");
                clearCompiledState();
              }}
              value="NEW"
            />
            <StyleSourceOption
              checked={styleSourceMode === "INHERIT"}
              disabled={isGenerating || styleCharacters.length === 0}
              description={
                styleCharacters.length
                  ? "Use another character's style memory and visual references."
                  : "Create another character first to use style inheritance."
              }
              label="Inherit another character's style/theme"
              onChange={() => {
                setStyleSourceMode("INHERIT");
                clearCompiledState();
              }}
              value="INHERIT"
            />
          </div>
          {styleSourceMode === "INHERIT" && styleCharacters.length > 0 && (
            <label className="mt-4 block text-sm font-medium">
              Style character
              <select
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none focus:border-violet-400"
                disabled={isGenerating}
                onChange={(event) => {
                  setStyleSourceCharacterId(event.target.value);
                  clearCompiledState();
                }}
                value={styleSourceCharacterId}
              >
                {styleCharacters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AssetSettingSelect
              label="Visual style"
              disabled={isGenerating}
              onChange={(value) => updateAssetSetting("visualStyle", value)}
              options={STATIC_IMAGE_VISUAL_STYLES}
              labels={VISUAL_STYLE_LABELS}
              value={assetSettings.visualStyle}
            />
            <AssetSettingSelect
              label="Camera / view"
              disabled={isGenerating}
              onChange={(value) => updateAssetSetting("viewAngle", value)}
              options={STATIC_IMAGE_VIEW_ANGLES}
              labels={VIEW_ANGLE_LABELS}
              value={assetSettings.viewAngle}
            />
            <AssetSettingSelect
              label="Background"
              disabled={isGenerating}
              onChange={(value) => updateAssetSetting("background", value)}
              options={STATIC_IMAGE_BACKGROUNDS}
              labels={BACKGROUND_LABELS}
              value={assetSettings.background}
            />
            {assetSettings.visualStyle === "PIXEL_ART" && (
              <AssetSettingSelect
                label="Pixel detail"
                disabled={isGenerating}
                onChange={(value) => updateAssetSetting("pixelDetail", value)}
                options={PIXEL_ART_DETAILS}
                labels={PIXEL_DETAIL_LABELS}
                value={assetSettings.pixelDetail}
              />
            )}
            <AssetSettingSelect
              label="Ground shadow"
              disabled={isGenerating}
              onChange={(value) => updateAssetSetting("groundShadow", value)}
              options={GROUND_SHADOW_OPTIONS}
              labels={GROUND_SHADOW_LABELS}
              value={assetSettings.groundShadow}
            />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Flat Illustration produces a raster PNG with vector-style rendering.
        </p>

        <details className="mt-4 rounded-xl border border-white/10 bg-white/[.025] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">
            Advanced
          </summary>
          <p className="mt-2 text-xs text-slate-500">
            Add extra creative or production instructions.
          </p>
          <label className="mt-3 block text-sm font-medium">
            Optional art direction
            <textarea
              className="mt-2 min-h-20 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none placeholder:text-slate-600 focus:border-violet-400"
              onChange={(event) => {
                setArtDirection(event.target.value);
                clearCompiledState();
              }}
              placeholder="For example: make the character look exhausted, more mysterious, or add snow on the shoulders."
              value={artDirection}
            />
          </label>
        </details>

        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            Transparent background and no ground shadow are the game-asset defaults.
          </p>
          <button
            className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              isGenerating ||
              (styleSourceMode === "INHERIT" && !styleSourceCharacterId)
            }
          >
            {isGenerating ? "Generating…" : "Generate"}
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {image && (
        <section className="mt-5 rounded-xl border border-white/10 bg-white/[.03] p-5">
          <h3 className="font-semibold">Generated asset</h3>
          <Image
            unoptimized
            width={1024}
            height={1024}
            className="mt-4 aspect-square w-full max-w-lg rounded-lg border border-white/10 bg-slate-950/50 object-contain"
            src={image.imageUrl}
            alt={`Generated ${ASSET_TYPES.find(({ value }) => value === assetType)?.label.toLowerCase() ?? "game asset"} for ${characterName}`}
          />
          <p className="mt-4 text-sm text-slate-400">
            Generated {new Date(image.createdAt).toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Temporary browser-only preview. It is not saved to Atlas.
          </p>
        </section>
      )}
    </section>
  );
}

function StyleSourceOption({
  checked,
  description,
  disabled,
  label,
  onChange,
  value,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  label: string;
  onChange: () => void;
  value: "NEW" | "INHERIT";
}) {
  return (
    <label className={`rounded-lg border p-3 ${
      checked
        ? "border-violet-400/60 bg-violet-500/10"
        : "border-white/10"
    } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <span className="flex items-center gap-2 text-sm font-medium">
        <input
          checked={checked}
          disabled={disabled}
          name="style-source"
          onChange={onChange}
          type="radio"
          value={value}
        />
        {label}
      </span>
      <span className="mt-1 block pl-6 text-xs leading-5 text-slate-500">
        {description}
      </span>
    </label>
  );
}

function AssetSettingSelect<T extends string>({
  disabled = false,
  label,
  labels,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  label: string;
  labels: Record<T, string>;
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <select
        className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5 outline-none focus:border-violet-400"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>{labels[option]}</option>
        ))}
      </select>
    </label>
  );
}
