"use client";
/* eslint-disable @next/next/no-img-element -- Object URLs and generated data URLs are transient browser previews. */

import Image from "next/image";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./forge-studio.module.css";

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_REFERENCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const ASSET_TYPES = [
  {
    value: "CHARACTER",
    label: "Character",
    hint: "Hero or creature",
    icon: <CharacterIcon />,
  },
  {
    value: "ITEM",
    label: "Item",
    hint: "Prop or equipment",
    icon: <PotionIcon />,
  },
  {
    value: "ICON",
    label: "Icon",
    hint: "Skill or inventory",
    icon: <ShieldIcon />,
  },
  {
    value: "ENVIRONMENT",
    label: "Scenery",
    hint: "Tile or backdrop",
    icon: <TerrainIcon />,
  },
] as const;

const VISUAL_STYLES = [
  {
    value: "PIXEL_ART",
    label: "Pixel",
    hint: "Crisp & nostalgic",
    previewClass: styles.pixelPreview,
  },
  {
    value: "FANTASY_2D",
    label: "2D Fantasy",
    hint: "Rich & magical",
    previewClass: styles.fantasyPreview,
  },
  {
    value: "STORYBOOK",
    label: "Storybook",
    hint: "Soft & charming",
    previewClass: styles.storybookPreview,
  },
] as const;

const VIEW_ANGLES = [
  { value: "FRONT", label: "Front" },
  { value: "SIDE", label: "Side" },
  { value: "ISOMETRIC", label: "Isometric" },
  { value: "TOP_DOWN", label: "Top-down" },
] as const;

type AssetType = (typeof ASSET_TYPES)[number]["value"];
type VisualStyle = (typeof VISUAL_STYLES)[number]["value"];
type ViewAngle = (typeof VIEW_ANGLES)[number]["value"];
type GeneratedImage = {
  imageUrl: string;
  model: string;
  createdAt: string;
};

const GENERATION_PHASES = [
  "Reading your art direction",
  "Sketching a strong silhouette",
  "Polishing the final pixels",
];

export function ForgeStudio() {
  const [assetType, setAssetType] = useState<AssetType>("CHARACTER");
  const [visualStyle, setVisualStyle] = useState<VisualStyle>("PIXEL_ART");
  const [viewAngle, setViewAngle] = useState<ViewAngle>("FRONT");
  const [prompt, setPrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPhase, setGenerationPhase] = useState(0);
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (referencePreview) URL.revokeObjectURL(referencePreview);
    };
  }, [referencePreview]);

  useEffect(() => {
    if (!isGenerating) return;

    const timer = window.setInterval(() => {
      setGenerationPhase((current) =>
        Math.min(current + 1, GENERATION_PHASES.length - 1),
      );
    }, 2_400);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  function selectReference(file: File | undefined) {
    if (!file) return;
    if (!SUPPORTED_REFERENCE_TYPES.has(file.type)) {
      setError("Choose a PNG, JPG, or WebP reference image.");
      return;
    }
    if (file.size > MAX_REFERENCE_BYTES) {
      setError("Keep the reference image under 10 MB.");
      return;
    }

    setError(null);
    setReferenceImage(file);
    setReferencePreview(URL.createObjectURL(file));
  }

  function removeReference() {
    setReferenceImage(null);
    setReferencePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    selectReference(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (isGenerating) return;
    selectReference(event.dataTransfer.files?.[0]);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    if (isGenerating) return;
    const pastedImage = Array.from(event.clipboardData.files).find((file) =>
      SUPPORTED_REFERENCE_TYPES.has(file.type),
    );
    if (pastedImage) {
      event.preventDefault();
      selectReference(pastedImage);
    }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setError(null);
      setGenerationPhase(0);
      setIsGenerating(true);

      const body = new FormData();
      body.set("assetType", assetType);
      body.set("visualStyle", visualStyle);
      body.set("viewAngle", viewAngle);
      body.set("prompt", prompt.trim());
      if (referenceImage) body.set("referenceImage", referenceImage);

      const response = await fetch("/api/forge", { method: "POST", body });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "The forge cooled down. Please try again.",
        );
      }
      if (!isGeneratedImage(payload.image)) {
        throw new Error("The forge returned an unreadable image. Please try again.");
      }

      setImage(payload.image);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "The forge cooled down. Please try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey && !isGenerating) {
      event.currentTarget.form?.requestSubmit();
    }
  }

  const selectedAsset = ASSET_TYPES.find(({ value }) => value === assetType);
  const selectedStyle = VISUAL_STYLES.find(({ value }) => value === visualStyle);
  const selectedView = VIEW_ANGLES.find(({ value }) => value === viewAngle);

  return (
    <main className={styles.app}>
      <div className={styles.ambientGlow} aria-hidden="true" />
      <div className={styles.starField} aria-hidden="true" />

      <header className={styles.header}>
        <a className={styles.brand} href="#forge" aria-label="Atlas Forge home">
          <span className={styles.brandMark} aria-hidden="true">
            <RuneIcon />
          </span>
          <span>
            <strong>ATLAS</strong>
            <em>FORGE</em>
          </span>
        </a>
        <div className={styles.headerMeta}>
          <span className={styles.playtestBadge}>
            <span aria-hidden="true" />
            Playtest
          </span>
          <span className={styles.headerRule} aria-hidden="true" />
          <span className={styles.headerPromise}>One image. No setup.</span>
        </div>
      </header>

      <section className={styles.intro}>
        <p className={styles.eyebrow}>
          <SparkleIcon />
          AI game asset studio
        </p>
        <h1>
          Forge game art
          <span>in one spell.</span>
        </h1>
        <p className={styles.introCopy}>
          Add a reference if you have one, pick the essentials, and let Atlas
          handle the art direction.
        </p>
      </section>

      <section className={styles.workspace} id="forge">
        <form className={styles.controls} onSubmit={generate}>
          <section className={styles.controlSection}>
            <StepHeading
              number="01"
              title="Reference"
              aside={<span className={styles.optional}>Optional</span>}
            />
            <input
              accept="image/png,image/jpeg,image/webp"
              className={styles.srOnly}
              disabled={isGenerating}
              id="reference-image"
              onChange={handleFileInput}
              ref={fileInputRef}
              type="file"
            />
            <div
              className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""} ${
                referencePreview ? styles.dropzoneFilled : ""
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                if (!isGenerating) setIsDragging(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setIsDragging(false);
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              onKeyDown={(event) => {
                if (
                  !isGenerating &&
                  !referenceImage &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onPaste={handlePaste}
              tabIndex={referenceImage ? -1 : 0}
            >
              {referencePreview && referenceImage ? (
                <>
                  <img
                    alt="Selected reference"
                    className={styles.referenceThumb}
                    src={referencePreview}
                  />
                  <div className={styles.referenceInfo}>
                    <strong>{referenceImage.name}</strong>
                    <span>{formatFileSize(referenceImage.size)} · Ready</span>
                  </div>
                  <button
                    aria-label="Remove reference image"
                    className={styles.removeReference}
                    disabled={isGenerating}
                    onClick={removeReference}
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </>
              ) : (
                <label className={styles.dropzoneLabel} htmlFor="reference-image">
                  <span className={styles.uploadIcon} aria-hidden="true">
                    <UploadIcon />
                  </span>
                  <span>
                    <strong>Drop, paste, or browse</strong>
                    <small>PNG, JPG or WebP · up to 10 MB</small>
                  </span>
                </label>
              )}
            </div>
          </section>

          <fieldset className={styles.controlSection} disabled={isGenerating}>
            <StepHeading number="02" title="What are we making?" legend />
            <div className={styles.assetGrid}>
              {ASSET_TYPES.map((asset) => (
                <ChoiceButton
                  active={assetType === asset.value}
                  icon={asset.icon}
                  hint={asset.hint}
                  key={asset.value}
                  label={asset.label}
                  onClick={() => setAssetType(asset.value)}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.controlSection} disabled={isGenerating}>
            <StepHeading number="03" title="Choose a look" legend />
            <div className={styles.styleGrid}>
              {VISUAL_STYLES.map((style) => (
                <button
                  aria-pressed={visualStyle === style.value}
                  className={`${styles.styleChoice} ${
                    visualStyle === style.value ? styles.styleChoiceActive : ""
                  }`}
                  key={style.value}
                  onClick={() => setVisualStyle(style.value)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={`${styles.stylePreview} ${style.previewClass}`}
                  >
                    <span />
                  </span>
                  <span className={styles.styleCopy}>
                    <strong>{style.label}</strong>
                    <small>{style.hint}</small>
                  </span>
                  <span className={styles.choiceCheck} aria-hidden="true">
                    <CheckIcon />
                  </span>
                </button>
              ))}
            </div>

            <div className={styles.viewRow}>
              <p>View</p>
              <div className={styles.segmentedControl}>
                {VIEW_ANGLES.map((view) => (
                  <button
                    aria-pressed={viewAngle === view.value}
                    className={viewAngle === view.value ? styles.segmentActive : ""}
                    key={view.value}
                    onClick={() => setViewAngle(view.value)}
                    type="button"
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>

          <section className={styles.controlSection}>
            <StepHeading
              number="04"
              title="Add a detail"
              aside={<span className={styles.optional}>Optional</span>}
            />
            <label className={styles.promptField}>
              <SparkleIcon />
              <input
                aria-label="Optional creative detail"
                disabled={isGenerating}
                maxLength={280}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                placeholder="e.g. ancient forest guardian with a crystal staff"
                value={prompt}
              />
              <span>{prompt.length}/280</span>
            </label>
          </section>

          <button
            className={styles.generateButton}
            disabled={isGenerating}
            type="submit"
          >
            <span className={styles.generateShine} aria-hidden="true" />
            {isGenerating ? (
              <>
                <span className={styles.buttonSpinner} aria-hidden="true" />
                Forging…
              </>
            ) : (
              <>
                <HammerIcon />
                Forge asset
                <span className={styles.buttonKey}>↵</span>
              </>
            )}
          </button>
          <p className={styles.formFootnote}>
            PNG output · one asset per forge · choices are locked while generating
          </p>
        </form>

        <section
          aria-busy={isGenerating}
          aria-live="polite"
          className={styles.previewPanel}
        >
          <div className={styles.previewHeader}>
            <div>
              <span className={styles.previewRune} aria-hidden="true">
                <RuneIcon />
              </span>
              <div>
                <p>Forge preview</p>
                <span>
                  {isGenerating ? GENERATION_PHASES[generationPhase] : image ? "Your asset is ready" : "Waiting for your spell"}
                </span>
              </div>
            </div>
            <span className={`${styles.statusDot} ${isGenerating ? styles.statusBusy : image ? styles.statusReady : ""}`}>
              {isGenerating ? "Working" : image ? "Ready" : "Idle"}
            </span>
          </div>

          <div className={`${styles.canvas} ${image ? styles.canvasWithImage : ""}`}>
            {isGenerating ? (
              <ForgeLoader phase={generationPhase} />
            ) : image ? (
              <>
                <div className={styles.checkerboard} aria-hidden="true" />
                <img
                  alt={`Generated ${selectedAsset?.label.toLowerCase() ?? "game asset"}`}
                  className={styles.generatedImage}
                  src={image.imageUrl}
                />
                <div className={styles.successBurst} aria-hidden="true">
                  <SparkleIcon />
                </div>
              </>
            ) : (
              <>
                <Image
                  alt=""
                  className={styles.heroImage}
                  fill
                  preload
                  sizes="(max-width: 900px) 100vw, 58vw"
                  src="/images/atlas-forge-hero.webp"
                />
                <div className={styles.heroShade} aria-hidden="true" />
                <div className={styles.emptyMessage}>
                  <span className={styles.emptyRune} aria-hidden="true">
                    <SparkleIcon />
                  </span>
                  <p>Your next world starts here</p>
                  <span>Choose your ingredients, then forge.</span>
                </div>
              </>
            )}
          </div>

          <div className={styles.previewFooter}>
            <div className={styles.recipe}>
              <span>{selectedAsset?.label}</span>
              <i aria-hidden="true" />
              <span>{selectedStyle?.label}</span>
              <i aria-hidden="true" />
              <span>{selectedView?.label}</span>
              {referenceImage && (
                <>
                  <i aria-hidden="true" />
                  <span>Reference guided</span>
                </>
              )}
            </div>
            {image ? (
              <div className={styles.resultActions}>
                <button
                  className={styles.secondaryAction}
                  onClick={() => setImage(null)}
                  type="button"
                >
                  <WandIcon />
                  New canvas
                </button>
                <a
                  className={styles.downloadAction}
                  download={downloadName(assetType)}
                  href={image.imageUrl}
                >
                  <DownloadIcon />
                  Download PNG
                </a>
              </div>
            ) : (
              <p className={styles.canvasHint}>
                Reference images guide identity, palette, and shape language.
              </p>
            )}
          </div>

          {error && (
            <div className={styles.errorNotice} role="alert">
              <span aria-hidden="true">!</span>
              <p>
                <strong>That spell fizzled.</strong>
                {error}
              </p>
              <button onClick={() => setError(null)} type="button">
                Dismiss
              </button>
            </div>
          )}
        </section>
      </section>

      <footer className={styles.footer}>
        <p>
          <span aria-hidden="true">✦</span>
          Built for sprites, props, icons, and little worlds.
        </p>
        <span>Atlas Forge · Playtest build</span>
      </footer>
    </main>
  );
}

function StepHeading({
  number,
  title,
  aside,
  legend = false,
}: {
  number: string;
  title: string;
  aside?: ReactNode;
  legend?: boolean;
}) {
  const content = (
    <>
      <span>{number}</span>
      <strong>{title}</strong>
      {aside}
    </>
  );
  return legend ? (
    <legend className={styles.stepHeading}>{content}</legend>
  ) : (
    <div className={styles.stepHeading}>{content}</div>
  );
}

function ChoiceButton({
  active,
  icon,
  hint,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  hint: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`${styles.assetChoice} ${active ? styles.assetChoiceActive : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className={styles.assetIcon} aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <span className={styles.choiceCheck} aria-hidden="true">
        <CheckIcon />
      </span>
    </button>
  );
}

function ForgeLoader({ phase }: { phase: number }) {
  return (
    <div className={styles.loader}>
      <div className={styles.portal} aria-hidden="true">
        <span className={styles.portalRingOne} />
        <span className={styles.portalRingTwo} />
        <span className={styles.portalCore}>
          <HammerIcon />
        </span>
        {Array.from({ length: 8 }, (_, index) => (
          <i
            key={index}
            style={
              {
                "--angle": `${index * 45}deg`,
                "--delay": `${index * -180}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <p>{GENERATION_PHASES[phase]}</p>
      <span>Keep this window open while the magic settles.</span>
      <div className={styles.progressTrack}>
        <span style={{ width: `${36 + phase * 28}%` }} />
      </div>
    </div>
  );
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload: unknown = await response.json();
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isGeneratedImage(value: unknown): value is GeneratedImage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const image = value as Record<string, unknown>;
  return (
    typeof image.imageUrl === "string" &&
    image.imageUrl.startsWith("data:image/") &&
    typeof image.model === "string" &&
    typeof image.createdAt === "string"
  );
}

function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function downloadName(assetType: AssetType) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `atlas-${assetType.toLowerCase()}-${timestamp}.png`;
}

function RuneIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 2 29 16 16 30 3 16 16 2Z" stroke="currentColor" strokeWidth="2" />
      <path d="m16 8 7 8-7 8-7-8 7-8Z" fill="currentColor" />
      <path d="M16 11v10M11.5 16h9" stroke="#0c1020" strokeWidth="2" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 1.8c.7 4.4 3 6.7 7.4 7.4-4.4.7-6.7 3-7.4 7.4-.7-4.4-3-6.7-7.4-7.4C7 8.5 9.3 6.2 10 1.8Z" fill="currentColor" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15V4m0 0L8 8m4-4 4 4M5 14v4.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8V14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m5.5 5.5 9 9m0-9-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HammerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m13.6 6.1 4.3 4.3M12.2 7.5l4.3 4.3M14.8 4.9l4.3 4.3c.6.6.6 1.5 0 2.1l-.9.9L11.8 5.8l.9-.9c.6-.6 1.5-.6 2.1 0ZM4.7 18.1l8.2-8.2 2.2 2.2-8.2 8.2c-.6.6-1.6.6-2.2 0s-.6-1.6 0-2.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2.5v10m0 0 4-4m-4 4-4-4M3 14.5v1.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8v-1.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WandIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m4 16 9-9m-1.5-2.5L13 1l1.5 3.5L18 6l-3.5 1.5L13 11l-1.5-3.5L8 6l3.5-1.5ZM5 4 4.5 2.5 4 4l-1.5.5L4 5l.5 1.5L5 5l1.5-.5L5 4Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CharacterIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M9 28v-5.5c0-3.3 2.7-6 6-6h2c3.3 0 6 2.7 6 6V28" fill="currentColor" opacity=".25" />
      <path d="M16 16a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" fill="currentColor" />
      <path d="M9 28v-5.5c0-3.3 2.7-6 6-6h2c3.3 0 6 2.7 6 6V28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PotionIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M12 4h8M14 4v7L8.4 20.8A4.8 4.8 0 0 0 12.6 28h6.8a4.8 4.8 0 0 0 4.2-7.2L18 11V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 20h11L24 24.5 22 28H10l-2-3.5 2.5-4.5Z" fill="currentColor" opacity=".35" />
      <path d="M12 17h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 3 26 7v7c0 7-4.2 12.3-10 15-5.8-2.7-10-8-10-15V7l10-4Z" fill="currentColor" opacity=".28" />
      <path d="M16 3 26 7v7c0 7-4.2 12.3-10 15-5.8-2.7-10-8-10-15V7l10-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m16 8 2.2 4.3 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8L9 13l4.8-.7L16 8Z" fill="currentColor" />
    </svg>
  );
}

function TerrainIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="m4 19 8-9 5 5 3-4 8 8v8H4v-8Z" fill="currentColor" opacity=".3" />
      <path d="m4 19 8-9 5 5 3-4 8 8M4 27h24M4 19v8m24-8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m10 22 3-3 3 3 4-4 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
