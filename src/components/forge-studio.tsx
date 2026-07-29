"use client";
/* eslint-disable @next/next/no-img-element -- Object URLs and generated data URLs are transient browser previews. */

import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AtlasArtwork,
  type ArtworkAsset,
  type ArtworkStyle,
  type ArtworkView,
} from "./atlas-artwork";
import styles from "./forge-studio.module.css";

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_REFERENCE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const ASSET_TYPES = [
  { value: "CHARACTER", label: "Character" },
  { value: "ITEM", label: "Item" },
  { value: "ICON", label: "Icon" },
  { value: "ENVIRONMENT", label: "Scenery" },
] as const;

const VISUAL_STYLES = [
  { value: "PIXEL_ART", label: "Pixel" },
  { value: "FANTASY_2D", label: "2D Fantasy" },
  { value: "STORYBOOK", label: "Storybook" },
] as const;

const VIEW_ANGLES = [
  { value: "FRONT", label: "Front", coordinate: "0° / 0°" },
  { value: "SIDE", label: "Side", coordinate: "90° / 0°" },
  { value: "ISOMETRIC", label: "Isometric", coordinate: "45° / 35°" },
  { value: "TOP_DOWN", label: "Top-down", coordinate: "0° / 90°" },
] as const;

const DIRECTION_DETAILS = {
  PIXEL_ART: {
    index: "01",
    name: "Pixel",
    title: "Every cluster earns its place.",
    note: "Hard edges, stepped shading, and a palette that stays legible at game scale.",
    tags: ["Hard edge", "16-color feel", "No anti-aliasing"],
    palette: ["#13151a", "#4e3f9b", "#e84e32", "#ff8764", "#69f4c2"],
  },
  FANTASY_2D: {
    index: "02",
    name: "2D Fantasy",
    title: "Shape first. Detail second.",
    note: "Painted material, controlled light, and a silhouette built to read before the texture.",
    tags: ["Painted form", "Material light", "Crisp silhouette"],
    palette: ["#171821", "#303a7b", "#bb3f4e", "#f27467", "#79e8d5"],
  },
  STORYBOOK: {
    index: "03",
    name: "Storybook",
    title: "A softer line, not a softer idea.",
    note: "Drawn contours and warm texture keep the subject specific without losing clarity.",
    tags: ["Drawn contour", "Tactile color", "Warm contrast"],
    palette: ["#302c35", "#396f73", "#cf684f", "#f2a473", "#f3c75f"],
  },
} satisfies Record<
  ArtworkStyle,
  {
    index: string;
    name: string;
    title: string;
    note: string;
    tags: string[];
    palette: string[];
  }
>;

const OUTPUT_FRAMES = [
  {
    assetType: "CHARACTER",
    visualStyle: "PIXEL_ART",
    viewAngle: "ISOMETRIC",
    name: "ember_warden_01.png",
  },
  {
    assetType: "ITEM",
    visualStyle: "FANTASY_2D",
    viewAngle: "FRONT",
    name: "sunsteel_blade_04.png",
  },
  {
    assetType: "ENVIRONMENT",
    visualStyle: "STORYBOOK",
    viewAngle: "ISOMETRIC",
    name: "hollow_keep_02.png",
  },
] as const satisfies ReadonlyArray<{
  assetType: ArtworkAsset;
  visualStyle: ArtworkStyle;
  viewAngle: ArtworkView;
  name: string;
}>;

type AssetType = (typeof ASSET_TYPES)[number]["value"];
type VisualStyle = (typeof VISUAL_STYLES)[number]["value"];
type ViewAngle = (typeof VIEW_ANGLES)[number]["value"];
type GeneratedImage = {
  imageUrl: string;
  model: string;
  createdAt: string;
};

const GENERATION_PHASES = [
  "Reading direction",
  "Building the silhouette",
  "Rendering the final asset",
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
  const [demoStyle, setDemoStyle] = useState<VisualStyle>("FANTASY_2D");
  const [demoView, setDemoView] = useState<ViewAngle>("ISOMETRIC");
  const [outputFrame, setOutputFrame] = useState(2);
  const [showCanvasGrid, setShowCanvasGrid] = useState(true);
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
    if (isGenerating) return;

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
            : "Generation stopped before the image was ready. Try again.",
        );
      }
      if (!isGeneratedImage(payload.image)) {
        throw new Error("The image response could not be read. Try again.");
      }

      setImage(payload.image);
      setOutputFrame(3);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Generation stopped before the image was ready. Try again.",
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

  function focusStyleTab(index: number) {
    const nextIndex = (index + VISUAL_STYLES.length) % VISUAL_STYLES.length;
    const nextStyle = VISUAL_STYLES[nextIndex];
    setDemoStyle(nextStyle.value);
    document.getElementById(`direction-${nextStyle.value}`)?.focus();
  }

  function handleStyleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusStyleTab(index + 1);
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusStyleTab(index - 1);
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusStyleTab(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      focusStyleTab(VISUAL_STYLES.length - 1);
    }
  }

  function applyDirectionStyle() {
    if (isGenerating) return;
    setVisualStyle(demoStyle);
    returnToForge();
  }

  function applyCameraView() {
    if (isGenerating) return;
    setViewAngle(demoView);
    returnToForge();
  }

  function loadOutputSetup(index: number) {
    if (isGenerating) return;
    const frame = OUTPUT_FRAMES[index];
    setAssetType(frame.assetType);
    setVisualStyle(frame.visualStyle);
    setViewAngle(frame.viewAngle);
    returnToForge();
  }

  function returnToForge() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("forge")?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  const selectedAsset = ASSET_TYPES.find(({ value }) => value === assetType);
  const selectedStyle = VISUAL_STYLES.find(({ value }) => value === visualStyle);
  const selectedView = VIEW_ANGLES.find(({ value }) => value === viewAngle);
  const selectedDirection = DIRECTION_DETAILS[demoStyle];
  const selectedCamera = VIEW_ANGLES.find(({ value }) => value === demoView);
  const selectedOutput = OUTPUT_FRAMES[Math.min(outputFrame, OUTPUT_FRAMES.length - 1)];
  const selectedLiveOutput = outputFrame === 3 ? image : null;

  return (
    <main className={styles.page}>
      <header className={styles.siteHeader}>
        <a className={styles.brand} href="#" aria-label="Atlas home">
          <AtlasMark />
          <span>Atlas</span>
        </a>
        <nav className={styles.nav} aria-label="Product">
          <a href="#forge">Create</a>
          <a href="#direction">Direction</a>
          <a href="#camera">Camera</a>
          <a href="#output">Output</a>
        </nav>
        <a className={styles.headerAction} href="#forge">
          Open Forge
          <ArrowIcon />
        </a>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroHeading}>
          <p className={styles.productLabel}>
            <span aria-hidden="true" />
            AI game asset studio
          </p>
          <h1 id="hero-title">
            Make game art
            <span>you can direct.</span>
          </h1>
        </div>
        <div className={styles.heroAside}>
          <p>
            One optional reference. Three clear decisions. One production-ready
            image.
          </p>
          <a href="#forge">
            Start on the canvas
            <ArrowDownIcon />
          </a>
        </div>
      </section>

      <form className={styles.studioWindow} id="forge" onSubmit={generate}>
        <div className={styles.studioBar}>
          <div className={styles.windowIdentity}>
            <span className={styles.windowMark}>
              <AtlasMark />
            </span>
            <span className={styles.windowDivider} aria-hidden="true" />
            <strong>Untitled asset</strong>
          </div>
          <div className={styles.windowStatus} aria-live="polite">
            <span
              className={`${styles.statusLight} ${
                isGenerating ? styles.statusLightBusy : image ? styles.statusLightReady : ""
              }`}
              aria-hidden="true"
            />
            {isGenerating ? GENERATION_PHASES[generationPhase] : image ? "Output ready" : "Ready"}
          </div>
          <div className={styles.windowTools}>
            <span>1024 × 1024</span>
            {image ? (
              <a
                download={downloadName(assetType)}
                href={image.imageUrl}
                className={styles.topDownload}
              >
                <DownloadIcon />
                Export
              </a>
            ) : (
              <span className={styles.topDownloadDisabled}>
                <DownloadIcon />
                Export
              </span>
            )}
          </div>
        </div>

        <CanvasPanel
          assetType={assetType}
          generationPhase={generationPhase}
          image={image}
          isGenerating={isGenerating}
          onToggleGrid={() => setShowCanvasGrid((visible) => !visible)}
          selectedAsset={selectedAsset?.label ?? "Asset"}
          selectedStyle={selectedStyle?.label ?? "Style"}
          selectedView={selectedView?.label ?? "View"}
          showCanvasGrid={showCanvasGrid}
          viewAngle={viewAngle}
          visualStyle={visualStyle}
        />

        <aside className={styles.briefPanel} aria-label="Creative brief">
          <div className={styles.panelHeading}>
            <span>Input</span>
            <span className={styles.panelIndex}>01</span>
          </div>

          <section className={styles.inputBlock}>
            <div className={styles.inputLabel}>
              <label htmlFor="reference-image">Reference</label>
              <span>Optional</span>
            </div>
            <input
              accept="image/png,image/jpeg,image/webp"
              aria-label="Choose a reference image"
              className={styles.srOnly}
              disabled={isGenerating}
              id="reference-image"
              onChange={handleFileInput}
              ref={fileInputRef}
              tabIndex={-1}
              type="file"
            />
            <div
              aria-label="Reference image drop area"
              className={`${styles.dropzone} ${
                isDragging ? styles.dropzoneActive : ""
              } ${referencePreview ? styles.dropzoneFilled : ""}`}
              onClick={() => {
                if (!referenceImage && !isGenerating) fileInputRef.current?.click();
              }}
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
                  !referenceImage &&
                  !isGenerating &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onPaste={handlePaste}
              role={referenceImage ? "group" : "button"}
              tabIndex={referenceImage || isGenerating ? -1 : 0}
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
                    <span>{formatFileSize(referenceImage.size)}</span>
                  </div>
                  <button
                    aria-label="Remove reference image"
                    className={styles.removeReference}
                    disabled={isGenerating}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeReference();
                    }}
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </>
              ) : (
                <div className={styles.emptyReference}>
                  <span className={styles.uploadGlyph} aria-hidden="true">
                    <UploadIcon />
                  </span>
                  <strong>Drop or paste</strong>
                  <span>
                    or <u>browse a file</u>
                  </span>
                  <small>PNG, JPG, WebP · 10 MB</small>
                </div>
              )}
            </div>
          </section>

          <section className={styles.inputBlock}>
            <div className={styles.inputLabel}>
              <label htmlFor="asset-prompt">Prompt</label>
              <span>Optional</span>
            </div>
            <div className={styles.promptField}>
              <input
                disabled={isGenerating}
                id="asset-prompt"
                maxLength={280}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                placeholder="A detail worth keeping…"
                value={prompt}
              />
              <span>{prompt.length}/280</span>
            </div>
            <p>Use a short note for mood, material, or a defining feature.</p>
          </section>

          <div className={styles.inputNote}>
            <CrosshairIcon />
            <p>
              <strong>Reference behavior</strong>
              Guides identity, palette, and shape language.
            </p>
          </div>
        </aside>

        <aside className={styles.inspector} aria-label="Asset properties">
          <div className={styles.panelHeading}>
            <span>Properties</span>
            <span className={styles.panelIndex}>02</span>
          </div>

          <fieldset disabled={isGenerating} className={styles.propertyGroup}>
            <legend>
              Type
              <span>Required</span>
            </legend>
            <div className={styles.assetOptions}>
              {ASSET_TYPES.map((asset) => (
                <button
                  aria-pressed={assetType === asset.value}
                  className={assetType === asset.value ? styles.optionActive : ""}
                  key={asset.value}
                  onClick={() => setAssetType(asset.value)}
                  type="button"
                >
                  <AssetTypeIcon kind={asset.value} />
                  <span>{asset.label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={isGenerating} className={styles.propertyGroup}>
            <legend>
              Style
              <span>Required</span>
            </legend>
            <div className={styles.styleOptions}>
              {VISUAL_STYLES.map((style) => (
                <button
                  aria-pressed={visualStyle === style.value}
                  className={visualStyle === style.value ? styles.optionActive : ""}
                  key={style.value}
                  onClick={() => setVisualStyle(style.value)}
                  type="button"
                >
                  <span
                    className={`${styles.styleSwatch} ${
                      styles[`swatch${style.value}`]
                    }`}
                    aria-hidden="true"
                  />
                  <span>{style.label}</span>
                  <CheckIcon />
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={isGenerating} className={styles.propertyGroup}>
            <legend>
              View
              <span>Required</span>
            </legend>
            <div className={styles.viewOptions}>
              {VIEW_ANGLES.map((view) => (
                <button
                  aria-pressed={viewAngle === view.value}
                  className={viewAngle === view.value ? styles.optionActive : ""}
                  key={view.value}
                  onClick={() => setViewAngle(view.value)}
                  type="button"
                >
                  {view.label}
                </button>
              ))}
            </div>
          </fieldset>
        </aside>

        <div className={styles.commandBar}>
          <div className={styles.recipe}>
            <span>{selectedAsset?.label}</span>
            <i aria-hidden="true" />
            <span>{selectedStyle?.label}</span>
            <i aria-hidden="true" />
            <span>{selectedView?.label}</span>
            {referenceImage && (
              <>
                <i aria-hidden="true" />
                <span>Reference linked</span>
              </>
            )}
          </div>
          <div className={styles.commandActions}>
            {image && (
              <button
                className={styles.newAssetButton}
                disabled={isGenerating}
                onClick={() => {
                  setImage(null);
                  setOutputFrame(2);
                }}
                type="button"
              >
                New asset
              </button>
            )}
            <button
              className={styles.generateButton}
              disabled={isGenerating}
              type="submit"
            >
              {isGenerating ? (
                <>
                  <span className={styles.buttonSpinner} aria-hidden="true" />
                  Generating
                </>
              ) : (
                <>
                  <GenerateIcon />
                  Generate
                  <kbd>↵</kbd>
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className={styles.errorNotice} role="alert">
            <span aria-hidden="true">!</span>
            <p>{error}</p>
            <button onClick={() => setError(null)} type="button">
              Dismiss
            </button>
          </div>
        )}
      </form>

      <section className={styles.directionSection} id="direction">
        <SectionHeading
          index="01"
          title="Direct the rendering."
          copy="Change the art system without rewriting the subject."
        />

        <div className={styles.directionWorkbench}>
          <div className={styles.directionTabs} role="tablist" aria-label="Visual style">
            {VISUAL_STYLES.map((style, index) => {
              const details = DIRECTION_DETAILS[style.value];
              return (
                <button
                  aria-controls="direction-panel"
                  aria-selected={demoStyle === style.value}
                  className={demoStyle === style.value ? styles.directionTabActive : ""}
                  id={`direction-${style.value}`}
                  key={style.value}
                  onClick={() => setDemoStyle(style.value)}
                  onKeyDown={(event) => handleStyleTabKeyDown(event, index)}
                  role="tab"
                  tabIndex={demoStyle === style.value ? 0 : -1}
                  type="button"
                >
                  <span>{details.index}</span>
                  <strong>{details.name}</strong>
                  <i aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <div
            aria-labelledby={`direction-${demoStyle}`}
            className={styles.directionCanvas}
            id="direction-panel"
            role="tabpanel"
          >
            <div className={styles.demoTopbar}>
              <span>Style study / atlas crest</span>
              <span>LIVE PREVIEW</span>
            </div>
            <div className={styles.directionStage}>
              <div className={styles.directionGrid} aria-hidden="true" />
              <AtlasArtwork
                assetType="ICON"
                className={styles.directionArtwork}
                key={demoStyle}
                viewAngle="FRONT"
                visualStyle={demoStyle}
              />
              <div
                className={`${styles.annotation} ${styles.annotationOne}`}
                aria-hidden="true"
              >
                <span />
                edge profile
              </div>
              <div
                className={`${styles.annotation} ${styles.annotationTwo}`}
                aria-hidden="true"
              >
                <span />
                palette anchor
              </div>
            </div>
          </div>

          <aside className={styles.directionNotes}>
            <span className={styles.notesIndex}>STYLE / {selectedDirection.index}</span>
            <h3>{selectedDirection.title}</h3>
            <p>{selectedDirection.note}</p>
            <div className={styles.palette} aria-label={`${selectedDirection.name} palette`}>
              {selectedDirection.palette.map((color) => (
                <i key={color} style={{ backgroundColor: color }} />
              ))}
            </div>
            <div className={styles.directionTags}>
              {selectedDirection.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <button
              disabled={isGenerating}
              onClick={applyDirectionStyle}
              type="button"
            >
              Use this style
              <ArrowIcon />
            </button>
          </aside>
        </div>
      </section>

      <section className={styles.cameraSection} id="camera">
        <div className={styles.cameraCopy}>
          <span className={styles.sectionIndex}>02 / CAMERA</span>
          <h2>Choose the view before the model guesses.</h2>
          <p>Four explicit camera positions. No buried prompt language.</p>
          <div className={styles.cameraControls}>
            {VIEW_ANGLES.map((view) => (
              <button
                aria-pressed={demoView === view.value}
                className={demoView === view.value ? styles.cameraControlActive : ""}
                key={view.value}
                onClick={() => setDemoView(view.value)}
                type="button"
              >
                <span>
                  <CameraIcon />
                  {view.label}
                </span>
                <code>{view.coordinate}</code>
              </button>
            ))}
          </div>
          <button
            className={styles.applyCamera}
            disabled={isGenerating}
            onClick={applyCameraView}
            type="button"
          >
            Use {selectedCamera?.label.toLowerCase()} view
            <ArrowIcon />
          </button>
        </div>

        <div className={styles.cameraStage}>
          <div className={styles.cameraTopbar}>
            <span>Camera stage</span>
            <span>
              CAM <strong>{selectedCamera?.coordinate}</strong>
            </span>
          </div>
          <div className={styles.stageViewport}>
            <div className={styles.stageHorizon} aria-hidden="true" />
            <div className={styles.stageDisc} aria-hidden="true">
              <span>N</span>
              <span>E</span>
              <span>S</span>
              <span>W</span>
            </div>
            <div className={styles.cameraAsset}>
              <AtlasArtwork
                assetType="ITEM"
                viewAngle={demoView}
                visualStyle="FANTASY_2D"
              />
            </div>
            <div className={styles.cameraReticle} aria-hidden="true">
              <span />
              <span />
            </div>
            <span className={styles.cameraLabel}>SUNSTEEL_BLADE / 04</span>
          </div>
        </div>
      </section>

      <section className={styles.outputSection} id="output">
        <SectionHeading
          index="03"
          title="The output is the handoff."
          copy="A square PNG, isolated and ready for the rest of the build."
        />

        <div className={styles.outputWorkbench}>
          <div className={styles.outputBrowser}>
            <div className={styles.outputTopbar}>
              <div>
                <span className={styles.outputStatus} aria-hidden="true" />
                <strong>
                  {selectedLiveOutput
                    ? downloadNameStatic(assetType)
                    : selectedOutput.name}
                </strong>
              </div>
              <span>
                {selectedLiveOutput ? "CURRENT OUTPUT" : "EXAMPLE OUTPUT"}
              </span>
            </div>
            <div className={styles.outputCanvas}>
              <div className={styles.checkerboard} aria-hidden="true" />
              {selectedLiveOutput ? (
                <img
                  alt={`Generated ${selectedAsset?.label.toLowerCase() ?? "game asset"} output`}
                  className={styles.outputImage}
                  src={selectedLiveOutput.imageUrl}
                />
              ) : (
                <AtlasArtwork
                  assetType={selectedOutput.assetType}
                  className={styles.outputArtwork}
                  key={selectedOutput.name}
                  viewAngle={selectedOutput.viewAngle}
                  visualStyle={selectedOutput.visualStyle}
                />
              )}
              <span className={styles.outputDimensions}>1024 × 1024</span>
            </div>
            <div className={styles.outputStrip} aria-label="Example outputs">
              {OUTPUT_FRAMES.map((frame, index) => (
                <button
                  aria-label={`Preview ${frame.name}`}
                  aria-pressed={outputFrame === index}
                  className={outputFrame === index ? styles.outputThumbActive : ""}
                  key={frame.name}
                  onClick={() => setOutputFrame(index)}
                  type="button"
                >
                  <AtlasArtwork
                    assetType={frame.assetType}
                    compact
                    viewAngle={frame.viewAngle}
                    visualStyle={frame.visualStyle}
                  />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </button>
              ))}
              {image && (
                <button
                  aria-label="Preview current generated output"
                  aria-pressed={outputFrame === 3}
                  className={`${styles.liveOutputThumb} ${
                    outputFrame === 3 ? styles.outputThumbActive : ""
                  }`}
                  onClick={() => setOutputFrame(3)}
                  type="button"
                >
                  <img alt="" src={image.imageUrl} />
                  <span>LIVE</span>
                </button>
              )}
              <span className={styles.stripRule} aria-hidden="true" />
              <span className={styles.stripLabel}>Output tray</span>
            </div>
          </div>

          <aside className={styles.deliveryPanel}>
            <div className={styles.deliveryHeading}>
              <span>Delivery</span>
              <span>{selectedLiveOutput ? "Ready" : "Preview"}</span>
            </div>
            <dl>
              <div>
                <dt>Format</dt>
                <dd>PNG</dd>
              </div>
              <div>
                <dt>Canvas</dt>
                <dd>1024 × 1024</dd>
              </div>
              <div>
                <dt>Asset count</dt>
                <dd>1</dd>
              </div>
              <div>
                <dt>Profile</dt>
                <dd>
                  {selectedLiveOutput
                    ? selectedStyle?.label
                    : VISUAL_STYLES.find(
                        ({ value }) => value === selectedOutput.visualStyle,
                      )?.label}
                </dd>
              </div>
            </dl>
            <div className={styles.deliveryNote}>
              <CheckIcon />
              <p>
                <strong>Output checked</strong>
                Single subject · no labels · no watermark
              </p>
            </div>
            {selectedLiveOutput ? (
              <a
                className={styles.downloadButton}
                download={downloadName(assetType)}
                href={selectedLiveOutput.imageUrl}
              >
                <DownloadIcon />
                Download PNG
              </a>
            ) : (
              <button
                className={styles.downloadButton}
                disabled={isGenerating}
                onClick={() => loadOutputSetup(outputFrame)}
                type="button"
              >
                Load this setup
                <ArrowIcon />
              </button>
            )}
          </aside>
        </div>
      </section>

      <footer className={styles.footer}>
        <a className={styles.brand} href="#" aria-label="Atlas home">
          <AtlasMark />
          <span>Atlas</span>
        </a>
        <p>Creative software for game assets.</p>
        <a href="#forge">
          Back to canvas
          <ArrowUpIcon />
        </a>
      </footer>
    </main>
  );
}

function CanvasPanel({
  assetType,
  generationPhase,
  image,
  isGenerating,
  onToggleGrid,
  selectedAsset,
  selectedStyle,
  selectedView,
  showCanvasGrid,
  viewAngle,
  visualStyle,
}: {
  assetType: AssetType;
  generationPhase: number;
  image: GeneratedImage | null;
  isGenerating: boolean;
  onToggleGrid: () => void;
  selectedAsset: string;
  selectedStyle: string;
  selectedView: string;
  showCanvasGrid: boolean;
  viewAngle: ViewAngle;
  visualStyle: VisualStyle;
}) {
  return (
    <section
      aria-busy={isGenerating}
      aria-label="Asset canvas"
      className={styles.canvasPanel}
    >
      <div className={styles.canvasToolbar}>
        <div>
          <span
            aria-hidden="true"
            className={`${styles.canvasTool} ${styles.toolActive}`}
          >
            <CursorIcon />
          </span>
          <button
            aria-label="Toggle canvas grid"
            aria-pressed={showCanvasGrid}
            className={`${styles.canvasTool} ${
              showCanvasGrid ? styles.gridToolActive : ""
            }`}
            onClick={onToggleGrid}
            type="button"
          >
            <GridIcon />
          </button>
          <span className={styles.toolDivider} aria-hidden="true" />
          <span className={styles.canvasMode}>
            {image ? "Output" : "Direction preview"}
          </span>
        </div>
        <div>
          <span>100%</span>
          <span className={styles.fitLabel}>Fit</span>
        </div>
      </div>

      <div className={`${styles.canvasStage} ${image ? styles.canvasStageOutput : ""}`}>
        <div
          className={`${styles.canvasGrid} ${
            showCanvasGrid ? "" : styles.canvasGridHidden
          }`}
          aria-hidden="true"
        />
        <span className={styles.rulerTop} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className={styles.rulerSide} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>

        {isGenerating ? (
          <GenerationLoader phase={generationPhase} />
        ) : image ? (
          <div className={styles.generatedFrame}>
            <img
              alt={`Generated ${selectedAsset.toLowerCase()} game asset`}
              className={styles.generatedImage}
              src={image.imageUrl}
            />
          </div>
        ) : (
          <div className={styles.artboard}>
            <AtlasArtwork
              assetType={assetType}
              className={styles.canvasArtwork}
              viewAngle={viewAngle}
              visualStyle={visualStyle}
            />
            <div className={styles.selectionBounds} aria-hidden="true">
              {Array.from({ length: 8 }, (_, index) => (
                <i key={index} />
              ))}
              <span>{selectedAsset.toLowerCase()}_preview</span>
            </div>
            <div className={styles.artboardAxis} aria-hidden="true">
              <span>X</span>
              <span>Y</span>
            </div>
          </div>
        )}

        <div className={styles.canvasReadout}>
          <span>{selectedStyle}</span>
          <span>{selectedView}</span>
          <span>1024 px</span>
        </div>
      </div>

      <div className={styles.mobileGenerateBar}>
        <span>
          {selectedAsset} · {selectedStyle} · {selectedView}
        </span>
        <button disabled={isGenerating} type="submit">
          {isGenerating ? (
            <>
              <span className={styles.buttonSpinner} aria-hidden="true" />
              Generating
            </>
          ) : (
            <>
              <GenerateIcon />
              Generate
              <kbd>↵</kbd>
            </>
          )}
        </button>
      </div>
    </section>
  );
}

function SectionHeading({
  index,
  title,
  copy,
}: {
  index: string;
  title: string;
  copy: string;
}) {
  return (
    <header className={styles.sectionHeading}>
      <span className={styles.sectionIndex}>{index} / PRODUCT</span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </header>
  );
}

function GenerationLoader({ phase }: { phase: number }) {
  return (
    <div className={styles.generationLoader}>
      <div className={styles.loaderFrame} aria-hidden="true">
        <AtlasArtwork
          assetType="CHARACTER"
          viewAngle="FRONT"
          visualStyle="PIXEL_ART"
        />
        <span className={styles.scanLine} />
      </div>
      <div className={styles.loaderCopy}>
        <span>{String(phase + 1).padStart(2, "0")} / 03</span>
        <p>{GENERATION_PHASES[phase]}</p>
        <div className={styles.progressTrack}>
          <span
            className={
              phase === 0
                ? styles.progressOne
                : phase === 1
                  ? styles.progressTwo
                  : styles.progressThree
            }
          />
        </div>
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
  const generated = value as Record<string, unknown>;
  return (
    typeof generated.imageUrl === "string" &&
    generated.imageUrl.startsWith("data:image/") &&
    typeof generated.model === "string" &&
    typeof generated.createdAt === "string"
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

function downloadNameStatic(assetType: AssetType) {
  return `atlas_${assetType.toLowerCase()}_01.png`;
}

function AtlasMark() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M4 19 12 3l8 16M7.5 14h9" />
      <path d="M3 19h5m8 0h5" />
    </svg>
  );
}

function AssetTypeIcon({ kind }: { kind: AssetType }) {
  if (kind === "CHARACTER") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="7" r="3.5" />
        <path d="M5.5 20c.3-5 2.5-7.5 6.5-7.5s6.2 2.5 6.5 7.5" />
      </svg>
    );
  }
  if (kind === "ITEM") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="m14.5 3 2 2-8.8 11.2-2.9 2.9 2.9-2.9L18.8 7.5l2 2" />
        <path d="m4 20 3.7-3.8m1.8-1.7 4 4" />
      </svg>
    );
  }
  if (kind === "ICON") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="m12 3 8 4v5c0 4.8-2.8 8-8 9.5C6.8 20 4 16.8 4 12V7l8-4Z" />
        <path d="m12 8 1.2 2.5 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4L12 8Z" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="m3 18 6-7 4 4 2.5-3 5.5 6M3 21h18M4 18v3m16-3v3" />
      <circle cx="17" cy="6" r="2.5" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M12 15V4m0 0L8 8m4-4 4 4M5 14v4.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8V14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path d="m5.5 5.5 9 9m0-9-9 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path d="m3.5 8 3 3 6-6" />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path d="m4 3 11 7-5.2 1.1L7 16 4 3Z" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path d="M3 3h14v14H3V3Zm4.7 0v14M12.3 3v14M3 7.7h14M3 12.3h14" />
    </svg>
  );
}

function CrosshairIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="5" />
      <path d="M10 1v5m0 8v5M1 10h5m8 0h5" />
    </svg>
  );
}

function GenerateIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path d="M10 2v16M2 10h16" />
      <path d="m4.3 4.3 11.4 11.4m0-11.4L4.3 15.7" opacity=".38" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path d="M10 2.5v10m0 0 4-4m-4 4-4-4M3 14.5v1.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8v-1.2" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path d="M3 6.5h10v8H3v-8Zm10 2.2 4-2v7l-4-2v-3Z" />
      <circle cx="8" cy="10.5" r="2" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 18 18">
      <path d="M3 9h11m-4-4 4 4-4 4" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 18 18">
      <path d="M9 3v11m-4-4 4 4 4-4" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 18 18">
      <path d="M9 15V4M5 8l4-4 4 4" />
    </svg>
  );
}
