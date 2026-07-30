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
    <section className="atlas-section">
      <div className="atlas-section-header">
        <div className="atlas-section-header__copy">
        <p className="atlas-eyebrow">Asset production</p>
        <h2 className="atlas-section-title">Create game asset</h2>
        <p className="atlas-section-description">
          Atlas prepares the art direction and production prompt for you.
        </p>
        </div>
      </div>

      <div className="atlas-workflow-grid" aria-label="Asset workflow">
        {ASSET_WORKFLOWS.map((workflow) => (
          <button
            aria-pressed={workflow.executable ? true : undefined}
            className="atlas-workflow-option"
            disabled={!workflow.executable || isGenerating}
            key={workflow.value}
            type="button"
          >
            <span className="atlas-workflow-option__label">{workflow.label}</span>
            <span className="atlas-workflow-option__description">
              {workflow.description}
            </span>
          </button>
        ))}
      </div>

      <form
        aria-busy={isGenerating}
        className="atlas-production-form"
        onSubmit={generate}
      >
        <div className="atlas-form-grid">
          <label className="atlas-label">
            Character
            <input
              className="atlas-control"
              readOnly
              value={characterName}
            />
          </label>
          <label className="atlas-label">
            Asset type
            <select
              className="atlas-control"
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

        <fieldset className="atlas-form-group">
          <legend className="atlas-form-group__title">Style source</legend>
          <p className="atlas-form-group__description">
            Create a fresh style or borrow another character&apos;s established theme.
            Visual style remains independent.
          </p>
          <div className="atlas-style-options">
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
            <label className="atlas-label mt-4">
              Style character
              <select
                className="atlas-control"
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

        <div className="atlas-form-group atlas-form-grid atlas-form-grid--controls">
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
        <p className="atlas-flat-note">
          Flat Illustration produces a raster PNG with vector-style rendering.
        </p>

        <details className="atlas-disclosure">
          <summary>Advanced</summary>
          <p className="atlas-form-group__description">
            Add extra creative or production instructions.
          </p>
          <label className="atlas-label mt-3">
            Optional art direction
            <textarea
              className="atlas-control min-h-20"
              onChange={(event) => {
                setArtDirection(event.target.value);
                clearCompiledState();
              }}
              placeholder="For example: make the character look exhausted, more mysterious, or add snow on the shoulders."
              value={artDirection}
            />
          </label>
        </details>

        <div className="atlas-generate-row">
          <p>
            Transparent background and no ground shadow are the game-asset defaults.
          </p>
          <button
            className="atlas-button atlas-button--primary atlas-generate-button"
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
        <p className="atlas-error" role="alert">
          {error}
        </p>
      )}

      {image && (
        <section className="atlas-result">
          <div className="atlas-result__header">
            <h3 className="atlas-result__title">Generated asset</h3>
          </div>
          <div className="atlas-result__stage">
            <Image
              unoptimized
              width={1024}
              height={1024}
              className="atlas-result__image"
              src={image.imageUrl}
              alt={`Generated ${ASSET_TYPES.find(({ value }) => value === assetType)?.label.toLowerCase() ?? "game asset"} for ${characterName}`}
            />
          </div>
          <div className="atlas-result__metadata">
            <span>Generated {new Date(image.createdAt).toLocaleString()}</span>
            <span>Temporary browser-only preview. It is not saved to Atlas.</span>
          </div>
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
    <label className="atlas-style-option">
      <span className="atlas-style-option__title">
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
      <span className="atlas-style-option__description">
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
    <label className="atlas-label">
      {label}
      <select
        className="atlas-control"
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
