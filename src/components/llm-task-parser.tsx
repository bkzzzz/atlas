"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import {
  ASSET_TYPES,
  ASSET_WORKFLOWS,
  runProductGeneration,
  type AssetType,
  type GeneratedImage,
  type ProductGenerationInput,
} from "@/lib/asset-generation-flow";
import {
  localeForLanguage,
  translateKnownText,
  type TranslationKey,
} from "@/lib/i18n";
import {
  DEFAULT_STATIC_IMAGE_ASSET_SETTINGS,
  GROUND_SHADOW_OPTIONS,
  PIXEL_ART_DETAILS,
  STATIC_IMAGE_BACKGROUNDS,
  STATIC_IMAGE_VIEW_ANGLES,
  STATIC_IMAGE_VISUAL_STYLES,
  type StaticImageAssetSettings,
} from "@/lib/task-mode";

const VISUAL_STYLE_LABELS: Record<StaticImageAssetSettings["visualStyle"], TranslationKey> = {
  PIXEL_ART: "generation.visualStyle.pixelArt",
  VECTOR_STYLE: "generation.visualStyle.flatIllustration",
  ILLUSTRATION: "generation.visualStyle.illustration",
};
const VIEW_ANGLE_LABELS: Record<StaticImageAssetSettings["viewAngle"], TranslationKey> = {
  SIDE: "generation.camera.side",
  FRONT: "generation.camera.front",
  TOP_DOWN: "generation.camera.topDown",
  ISOMETRIC: "generation.camera.isometric",
  THREE_QUARTER: "generation.camera.threeQuarter",
  UNSPECIFIED: "generation.camera.unspecified",
};
const BACKGROUND_LABELS: Record<StaticImageAssetSettings["background"], TranslationKey> = {
  TRANSPARENT: "generation.background.transparent",
  WHITE: "generation.background.white",
  SIMPLE_SOLID: "generation.background.simpleSolid",
  UNSPECIFIED: "generation.background.unspecified",
};
const PIXEL_DETAIL_LABELS: Record<StaticImageAssetSettings["pixelDetail"], TranslationKey> = {
  LOW: "generation.pixelDetail.low",
  MEDIUM: "generation.pixelDetail.medium",
  HIGH: "generation.pixelDetail.high",
};
const GROUND_SHADOW_LABELS: Record<StaticImageAssetSettings["groundShadow"], TranslationKey> = {
  ALLOW: "generation.groundShadow.allow",
  NONE: "generation.groundShadow.none",
};

const WORKFLOW_LABELS: Record<(typeof ASSET_WORKFLOWS)[number]["value"], TranslationKey> = {
  STATIC_IMAGE: "generation.workflow.static",
  IDLE_ANIMATION: "generation.workflow.idle",
  WALK_ANIMATION: "generation.workflow.walk",
};

const WORKFLOW_DESCRIPTIONS: Record<(typeof ASSET_WORKFLOWS)[number]["value"], TranslationKey> = {
  STATIC_IMAGE: "generation.workflow.raster",
  IDLE_ANIMATION: "generation.workflow.unavailable",
  WALK_ANIMATION: "generation.workflow.unavailable",
};

const ASSET_TYPE_LABELS: Record<AssetType, TranslationKey> = {
  CHARACTER_SPRITE: "generation.assetType.characterSprite",
  PORTRAIT: "generation.assetType.portrait",
  ICON: "generation.assetType.icon",
  PROP: "generation.assetType.prop",
  UI_ASSET: "generation.assetType.uiAsset",
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
  const { language, t } = useLanguage();
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
        ? "errors.invalidJson"
        : "errors.assetRequest");
    }
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: unknown }).error
        : null;
      throw new Error(typeof message === "string" ? message : "errors.assetRequest");
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
          : "errors.generateImage",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="atlas-section">
      <div className="atlas-section-header">
        <div className="atlas-section-header__copy">
        <p className="atlas-eyebrow">{t("generation.eyebrow")}</p>
        <h2 className="atlas-section-title">{t("generation.title")}</h2>
        <p className="atlas-section-description">
          {t("generation.description")}
        </p>
        </div>
      </div>

      <div className="atlas-workflow-grid" aria-label={t("generation.workflowLabel")}>
        {ASSET_WORKFLOWS.map((workflow) => (
          <button
            aria-pressed={workflow.executable ? true : undefined}
            className="atlas-workflow-option"
            disabled={!workflow.executable || isGenerating}
            key={workflow.value}
            type="button"
          >
            <span className="atlas-workflow-option__label">
              {t(WORKFLOW_LABELS[workflow.value])}
            </span>
            <span className="atlas-workflow-option__description">
              {t(WORKFLOW_DESCRIPTIONS[workflow.value])}
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
            {t("generation.character")}
            <input
              className="atlas-control"
              readOnly
              value={characterName}
            />
          </label>
          <label className="atlas-label">
            {t("generation.assetType")}
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
                <option key={type.value} value={type.value}>
                  {t(ASSET_TYPE_LABELS[type.value])}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="atlas-form-group">
          <legend className="atlas-form-group__title">
            {t("generation.styleSource")}
          </legend>
          <p className="atlas-form-group__description">
            {t("generation.styleSourceDescription")}
          </p>
          <div className="atlas-style-options">
            <StyleSourceOption
              checked={styleSourceMode === "NEW"}
              disabled={isGenerating}
              description={t("generation.styleNewDescription")}
              label={t("generation.styleNew")}
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
                  ? t("generation.styleInheritDescription")
                  : t("generation.styleInheritUnavailable")
              }
              label={t("generation.styleInherit")}
              onChange={() => {
                setStyleSourceMode("INHERIT");
                clearCompiledState();
              }}
              value="INHERIT"
            />
          </div>
          {styleSourceMode === "INHERIT" && styleCharacters.length > 0 && (
            <label className="atlas-label mt-4">
              {t("generation.styleCharacter")}
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
              label={t("generation.visualStyle")}
              disabled={isGenerating}
              onChange={(value) => updateAssetSetting("visualStyle", value)}
              options={STATIC_IMAGE_VISUAL_STYLES}
              labels={VISUAL_STYLE_LABELS}
              value={assetSettings.visualStyle}
            />
            <AssetSettingSelect
              label={t("generation.camera")}
              disabled={isGenerating}
              onChange={(value) => updateAssetSetting("viewAngle", value)}
              options={STATIC_IMAGE_VIEW_ANGLES}
              labels={VIEW_ANGLE_LABELS}
              value={assetSettings.viewAngle}
            />
            <AssetSettingSelect
              label={t("generation.background")}
              disabled={isGenerating}
              onChange={(value) => updateAssetSetting("background", value)}
              options={STATIC_IMAGE_BACKGROUNDS}
              labels={BACKGROUND_LABELS}
              value={assetSettings.background}
            />
            {assetSettings.visualStyle === "PIXEL_ART" && (
              <AssetSettingSelect
                label={t("generation.pixelDetail")}
                disabled={isGenerating}
                onChange={(value) => updateAssetSetting("pixelDetail", value)}
                options={PIXEL_ART_DETAILS}
                labels={PIXEL_DETAIL_LABELS}
                value={assetSettings.pixelDetail}
              />
            )}
            <AssetSettingSelect
              label={t("generation.groundShadow")}
              disabled={isGenerating}
              onChange={(value) => updateAssetSetting("groundShadow", value)}
              options={GROUND_SHADOW_OPTIONS}
              labels={GROUND_SHADOW_LABELS}
              value={assetSettings.groundShadow}
            />
        </div>
        <p className="atlas-flat-note">
          {t("generation.flatNote")}
        </p>

        <details className="atlas-disclosure">
          <summary>{t("generation.advanced")}</summary>
          <p className="atlas-form-group__description">
            {t("generation.advancedDescription")}
          </p>
          <label className="atlas-label mt-3">
            {t("generation.artDirection")}
            <textarea
              className="atlas-control min-h-20"
              onChange={(event) => {
                setArtDirection(event.target.value);
                clearCompiledState();
              }}
              placeholder={t("generation.artDirectionPlaceholder")}
              value={artDirection}
            />
          </label>
        </details>

        <div className="atlas-generate-row">
          <p>
            {t("generation.defaults")}
          </p>
          <button
            className="atlas-button atlas-button--primary atlas-generate-button"
            disabled={
              isGenerating ||
              (styleSourceMode === "INHERIT" && !styleSourceCharacterId)
            }
          >
            {isGenerating ? t("generation.generating") : t("generation.generate")}
          </button>
        </div>
      </form>

      {error && (
        <p className="atlas-error" role="alert">
          {translateKnownText(error, t)}
        </p>
      )}

      {image && (
        <section className="atlas-result">
          <div className="atlas-result__header">
            <h3 className="atlas-result__title">{t("generation.resultTitle")}</h3>
          </div>
          <div className="atlas-result__stage">
            <Image
              unoptimized
              width={1024}
              height={1024}
              className="atlas-result__image"
              src={image.imageUrl}
              alt={t("generation.resultAlt", {
                assetType: t(ASSET_TYPE_LABELS[assetType]).toLowerCase(),
                characterName,
              })}
            />
          </div>
          <div className="atlas-result__metadata">
            <span>
              {t("generation.generatedAt", {
                date: new Date(image.createdAt).toLocaleString(
                  localeForLanguage(language),
                ),
              })}
            </span>
            <span>{t("generation.temporary")}</span>
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
  labels: Record<T, TranslationKey>;
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
}) {
  const { t } = useLanguage();

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
          <option key={option} value={option}>{t(labels[option])}</option>
        ))}
      </select>
    </label>
  );
}
