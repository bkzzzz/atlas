"use client";

import {
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  GameBrief,
  ReferenceItem,
  StyleSpec,
} from "@/lib/art-direction-core";
import {
  type WorkspaceLayerAction,
  type WorkspaceNode,
  type WorkspaceNodePatch,
  type WorkspaceNodeSnapshot,
  type WorkspacePayload,
  workspaceNodeSnapshot,
} from "@/lib/workspace-core";
import {
  constrainRectToBounds,
  dragRectWithSnapping,
  fitCanvasZoom,
  moveRectWithinBounds,
  resizeRectFromCorner,
  type ResizeCorner,
  type SnapGuide,
} from "@/lib/workspace-geometry";
import {
  canRedoHistory,
  canUndoHistory,
  commitHistory,
  createSnapshotHistory,
  redoHistory,
  type SnapshotHistory,
  undoHistory,
} from "@/lib/workspace-history";
import {
  createWorkspaceExportPlan,
  normalizedCropToPixels,
  removeBorderConnectedBackground,
  type NormalizedCropRect,
} from "@/lib/workspace-image-core";
import styles from "./workspace.module.css";

type SaveState = "idle" | "saving" | "saved" | "error";
type MobilePanel = "direction" | "canvas" | "inspector";
type NodeGeometry = Pick<WorkspaceNode, "x" | "y" | "width" | "height">;
type Interaction = {
  nodeId: string;
  mode: "drag" | "resize";
  handle?: ResizeCorner;
  pointerId: number;
  startPointer: { x: number; y: number };
  start: NodeGeometry;
  current: NodeGeometry;
  moved: boolean;
};
type AssetOperation = "REPLACE" | "CROP" | "REMOVE_SOLID_BACKGROUND";
type AssetOperationParameters =
  | { fit: "contain" }
  | NormalizedCropRect
  | {
      method: "border-flood-fill";
      tolerance: number;
      removedPixelCount: number;
      borderMatchRatio: number;
      backgroundColor: string | null;
    };

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
const MIN_NODE_SIZE = 24;
const MAX_DEV_BACKGROUND_PIXELS = 4_000_000;
const DEV_BACKGROUND_TOLERANCE = 18;
const EMPTY_CROP: NormalizedCropRect = {
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.8,
};
const BRIEF_FIELDS: ReadonlyArray<{
  key: keyof GameBrief;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  {
    key: "description",
    label: "Game",
    placeholder: "A cozy dungeon crawler about rebuilding a ruined village",
    multiline: true,
  },
  { key: "genre", label: "Genre", placeholder: "Cozy action RPG" },
  { key: "mood", label: "Mood", placeholder: "Hopeful, worn, magical" },
  { key: "targetPlatform", label: "Platform", placeholder: "PC + console" },
  { key: "assetType", label: "Asset", placeholder: "Character sprite" },
];

function Icon({
  name,
  size = 16,
}: {
  name:
    | "backward"
    | "crop"
    | "duplicate"
    | "export"
    | "eye"
    | "eye-off"
    | "fit"
    | "forward"
    | "image"
    | "layers"
    | "lock"
    | "minus"
    | "plus"
    | "redo"
    | "spark"
    | "trash"
    | "undo"
    | "unlock"
    | "wand";
  size?: number;
}) {
  const paths = {
    backward: <path d="m14 7-5 5 5 5" />,
    crop: <path d="M7 3v14a2 2 0 0 0 2 2h12M3 7h12a2 2 0 0 1 2 2v12" />,
    duplicate: <path d="M8 8h12v12H8zM4 16V4h12" />,
    export: <path d="M12 3v12m0-12 4 4m-4-4L8 7M5 13v7h14v-7" />,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    "eye-off": <><path d="m3 3 18 18M10.6 6.1A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.8M6.4 6.5C3.8 8.3 2.5 12 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 3-.5" /></>,
    fit: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" /><path d="M8 8h8v8H8z" /></>,
    forward: <path d="m10 7 5 5-5 5" />,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m3 17 5-5 4 3 3-2 6 5" /></>,
    layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 18l9 5 9-5" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    minus: <path d="M5 12h14" />,
    plus: <path d="M12 5v14M5 12h14" />,
    redo: <path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7" />,
    spark: <path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2Zm7 13 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />,
    trash: <path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6" />,
    undo: <path d="M4 7v5h5M4 12a8 8 0 1 1 2.3 5.7" />,
    unlock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M16 10V7a4 4 0 0 0-7.6-1.7" /></>,
    wand: <><path d="m4 20 12-12 3 3L7 23 4 20Z" /><path d="m6 4 .7 2.3L9 7l-2.3.7L6 10l-.7-2.3L3 7l2.3-.7L6 4Zm11-2 .7 2.3L20 5l-2.3.7L17 8l-.7-2.3L14 5l2.3-.7L17 2Z" /></>,
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
        {paths[name]}
      </g>
    </svg>
  );
}

function getErrorMessage(value: unknown, fallback: string) {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }
  return fallback;
}

async function responseJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function imageDimensions(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be read."));
    };
    image.src = url;
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The asset image could not be decoded."));
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not encode the image."));
    }, "image/png");
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = fileName;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sortedNodes(nodes: readonly WorkspaceNode[]) {
  return [...nodes].sort(
    (left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id),
  );
}

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function inspectorSizeGeometry(
  node: WorkspaceNode,
  dimension: "width" | "height",
  requestedValue: number,
  workspace: Pick<WorkspacePayload, "width" | "height">,
) {
  if (!node.aspectLocked) {
    return constrainRectToBounds(
      { ...node, [dimension]: requestedValue },
      { width: workspace.width, height: workspace.height },
    );
  }

  const requestedScale = requestedValue / node[dimension];
  const minimumScale = Math.max(
    MIN_NODE_SIZE / node.width,
    MIN_NODE_SIZE / node.height,
  );
  const maximumScale = Math.min(
    workspace.width / node.width,
    workspace.height / node.height,
  );
  const scale = clampNumber(requestedScale, minimumScale, maximumScale);
  return constrainRectToBounds(
    {
      ...node,
      width: node.width * scale,
      height: node.height * scale,
    },
    { width: workspace.width, height: workspace.height },
  );
}

function displayFrameForAspect(
  node: WorkspaceNode,
  pixelWidth: number,
  pixelHeight: number,
  workspace: Pick<WorkspacePayload, "width" | "height">,
) {
  const outputAspect = pixelWidth / pixelHeight;
  const currentAspect = node.width / node.height;
  let width: number;
  let height: number;

  if (outputAspect >= currentAspect) {
    width = node.width;
    height = width / outputAspect;
  } else {
    height = node.height;
    width = height * outputAspect;
  }

  const minimumScale = Math.max(
    1,
    MIN_NODE_SIZE / width,
    MIN_NODE_SIZE / height,
  );
  width *= minimumScale;
  height *= minimumScale;
  const maximumScale = Math.min(
    1,
    workspace.width / width,
    workspace.height / height,
  );

  return constrainRectToBounds(
    {
      ...node,
      width: width * maximumScale,
      height: height * maximumScale,
    },
    { width: workspace.width, height: workspace.height },
  );
}

function rgbaHex(color: { r: number; g: number; b: number } | null) {
  if (!color) return null;
  return `#${[color.r, color.g, color.b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function nodeSnapshots(nodes: readonly WorkspaceNode[]) {
  return sortedNodes(nodes).map(workspaceNodeSnapshot);
}

function snapshotsEqual(
  left: readonly WorkspaceNodeSnapshot[],
  right: readonly WorkspaceNodeSnapshot[],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function briefComplete(brief: GameBrief) {
  return Object.values(brief).every((value) => value.trim().length > 0);
}

function titleForReference(id: string, references: readonly ReferenceItem[]) {
  return references.find((reference) => reference.id === id)?.title ?? id;
}

function ArtDirectionPanel({
  workspace,
  brief,
  selectedReferenceIds,
  currentStyleSpec,
  directionDirty,
  generating,
  buildingSpec,
  mutationsBlocked,
  onBriefChange,
  onSaveDraft,
  onToggleReference,
  onUploadReference,
  onBuildSpec,
  onGenerate,
}: {
  workspace: WorkspacePayload;
  brief: GameBrief;
  selectedReferenceIds: string[];
  currentStyleSpec: StyleSpec | null;
  directionDirty: boolean;
  generating: boolean;
  buildingSpec: boolean;
  mutationsBlocked: boolean;
  onBriefChange: (key: keyof GameBrief, value: string) => void;
  onSaveDraft: () => void;
  onToggleReference: (id: string) => void;
  onUploadReference: (event: ChangeEvent<HTMLInputElement>) => void;
  onBuildSpec: () => void;
  onGenerate: (prompt: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const uploadReferenceInput = useRef<HTMLInputElement>(null);
  const directionDisabled = buildingSpec || mutationsBlocked;
  const canBuild =
    briefComplete(brief) &&
    selectedReferenceIds.length >= 1 &&
    selectedReferenceIds.length <= 3 &&
    !mutationsBlocked;
  const canGenerate = Boolean(
    currentStyleSpec && !directionDirty && !directionDisabled,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onGenerate(prompt);
  }

  return (
    <aside className={`${styles.panel} ${styles.directionPanel}`} aria-label="Art direction">
      <div className={styles.panelHeader}>
        <span className={styles.panelIcon}><Icon name="spark" /></span>
        <div>
          <h2>Art direction</h2>
          <p>Brief → references → reusable StyleSpec</p>
        </div>
      </div>

      <div className={styles.directionScroll}>
        <section className={styles.directionSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span>01</span>
              <h3>Describe the game</h3>
            </div>
            <small>{briefComplete(brief) ? "Ready" : "Required"}</small>
          </div>
          <div className={styles.briefFields}>
            {BRIEF_FIELDS.map((field) => (
              <label
                className={field.multiline ? styles.briefWide : ""}
                key={field.key}
              >
                <span>{field.label}</span>
                {field.multiline ? (
                  <textarea
                    disabled={directionDisabled}
                    maxLength={600}
                    onBlur={onSaveDraft}
                    onChange={(event) => onBriefChange(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    value={brief[field.key]}
                  />
                ) : (
                  <input
                    disabled={directionDisabled}
                    maxLength={80}
                    onBlur={onSaveDraft}
                    onChange={(event) => onBriefChange(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    type="text"
                    value={brief[field.key]}
                  />
                )}
              </label>
            ))}
          </div>
        </section>

        <section className={styles.directionSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span>02</span>
              <h3>Choose visual references</h3>
            </div>
            <small>{selectedReferenceIds.length}/3 selected</small>
          </div>
          <p className={styles.sectionHelp}>
            Select one to three directions. Their real metadata becomes project memory.
          </p>
          <div className={styles.referenceGrid}>
            {workspace.references.map((reference) => {
              const selected = selectedReferenceIds.includes(reference.id);
              const selectionFull = selectedReferenceIds.length >= 3 && !selected;
              return (
                <button
                  aria-pressed={selected}
                  className={`${styles.referenceTile} ${selected ? styles.referenceSelected : ""}`}
                  disabled={selectionFull || directionDisabled}
                  key={reference.id}
                  onClick={() => onToggleReference(reference.id)}
                  type="button"
                >
                  <span className={styles.referenceImage}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" src={reference.imageUrl} />
                    <i>{selected ? selectedReferenceIds.indexOf(reference.id) + 1 : "+"}</i>
                  </span>
                  <span className={styles.referenceCopy}>
                    <strong>{reference.title}</strong>
                    <small>{reference.description}</small>
                    <em>{reference.traits.join(" · ")}</em>
                    <span className={styles.palette} aria-label={`${reference.title} palette`}>
                      {reference.palette.slice(0, 6).map((color) => (
                        <i key={color} style={{ backgroundColor: color }} title={color} />
                      ))}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <input
            accept="image/png,image/jpeg,image/webp"
            className={styles.hiddenInput}
            disabled={directionDisabled}
            onChange={onUploadReference}
            ref={uploadReferenceInput}
            tabIndex={-1}
            type="file"
          />
          <button
            className={styles.secondaryButton}
            disabled={directionDisabled}
            onClick={() => uploadReferenceInput.current?.click()}
            type="button"
          >
            <Icon name="image" />
            Add your own reference
          </button>
        </section>

        <section className={styles.directionSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span>03</span>
              <h3>Style memory</h3>
            </div>
            <small>{currentStyleSpec && !directionDirty ? "Approved" : "Not built"}</small>
          </div>
          {currentStyleSpec && !directionDirty ? (
            <div className={styles.styleSpecCard}>
              <div>
                <span>StyleSpec</span>
                <strong>{currentStyleSpec.styleName}</strong>
              </div>
              <dl>
                <div>
                  <dt>Line</dt>
                  <dd>{currentStyleSpec.lineStyle}</dd>
                </div>
                <div>
                  <dt>Light</dt>
                  <dd>{currentStyleSpec.lighting}</dd>
                </div>
                <div>
                  <dt>Shape</dt>
                  <dd>{currentStyleSpec.shapeLanguage}</dd>
                </div>
                <div>
                  <dt>Detail</dt>
                  <dd>{currentStyleSpec.detailLevel}</dd>
                </div>
              </dl>
              <div className={styles.stylePalette}>
                {currentStyleSpec.palette.map((color) => (
                  <i key={color} style={{ backgroundColor: color }} title={color} />
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.emptySpec}>
              <Icon name="layers" />
              <p>
                Build a deterministic StyleSpec from the brief and selected references.
              </p>
            </div>
          )}
          <button
            className={styles.buildButton}
            disabled={!canBuild || buildingSpec}
            onClick={onBuildSpec}
            type="button"
          >
            <Icon name="wand" />
            {buildingSpec
              ? "Building StyleSpec…"
              : currentStyleSpec && !directionDirty
                ? "Rebuild StyleSpec"
                : "Build StyleSpec"}
          </button>
        </section>
      </div>

      <form className={styles.generateComposer} onSubmit={submit}>
        <label>
          <span>Optional direction</span>
          <textarea
            disabled={!canGenerate || generating}
            maxLength={280}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={
              canGenerate
                ? "e.g. An elderly herbalist carrying a lantern"
                : "Build the StyleSpec first"
            }
            rows={2}
            value={prompt}
          />
        </label>
        <button disabled={!canGenerate || generating} type="submit">
          <Icon name="spark" />
          {generating ? "Generating asset…" : "Generate to canvas"}
        </button>
      </form>
    </aside>
  );
}

function CanvasNode({
  node,
  selected,
  onSelect,
  onPointerDown,
  onResizePointerDown,
}: {
  node: WorkspaceNode;
  selected: boolean;
  onSelect: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, node: WorkspaceNode) => void;
  onResizePointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    node: WorkspaceNode,
    handle: ResizeCorner,
  ) => void;
}) {
  return (
    <div
      aria-label={`${node.name}${node.locked ? ", locked" : ""}`}
      className={`${styles.canvasNode} ${selected ? styles.selectedNode : ""} ${
        node.locked ? styles.lockedNode : ""
      }`}
      data-node-id={node.id}
      id={`canvas-node-${node.id}`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      onPointerDown={(event) => onPointerDown(event, node)}
      role="button"
      style={{
        height: node.height,
        left: node.x,
        opacity: node.opacity,
        top: node.y,
        transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
        width: node.width,
        zIndex: node.zIndex + 1,
      }}
      tabIndex={0}
    >
      {node.kind === "IMAGE" && node.assetUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={node.name} draggable={false} src={node.assetUrl} />
          {node.color !== "#ffffff" ? (
            <span
              className={styles.imageTint}
              style={{
                backgroundColor: node.color,
                maskImage: `url("${node.assetUrl}")`,
                maskSize: "100% 100%",
                WebkitMaskImage: `url("${node.assetUrl}")`,
                WebkitMaskSize: "100% 100%",
              }}
            />
          ) : null}
        </>
      ) : (
        <span className={styles.rectangleFill} style={{ backgroundColor: node.color }} />
      )}
      {selected && !node.locked && node.rotation === 0
        ? (["nw", "ne", "sw", "se"] as const).map((handle) => (
            <button
              aria-label={`Resize ${node.name} from ${handle}`}
              className={`${styles.resizeHandle} ${styles[handle]}`}
              key={handle}
              onPointerDown={(event) => onResizePointerDown(event, node, handle)}
              type="button"
            />
          ))
        : null}
      {selected && node.locked ? (
        <span className={styles.lockBadge}><Icon name="lock" size={11} /> Locked</span>
      ) : null}
      {selected && !node.locked && node.rotation !== 0 ? (
        <span className={styles.legacyRotationBadge}>
          Legacy rotation · resize unavailable
        </span>
      ) : null}
    </div>
  );
}

function InspectorNumber({
  label,
  value,
  min,
  max,
  disabled = false,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className={styles.inspectorNumber}>
      <span>{label}</span>
      <input
        aria-label={label}
        disabled={disabled}
        max={max}
        min={min}
        onBlur={onCommit}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (Number.isFinite(value)) onChange(Math.min(max, Math.max(min, value)));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        step="1"
        type="number"
        value={Math.round(value)}
      />
    </label>
  );
}

function InspectorPanel({
  workspace,
  node,
  processingAsset,
  mutationsBlocked,
  onSelect,
  onLocalPatch,
  onCommitPatch,
  onImmediatePatch,
  onLayerAction,
  onDuplicate,
  onDelete,
  onReplace,
  onCrop,
  onRemoveBackground,
}: {
  workspace: WorkspacePayload;
  node: WorkspaceNode | null;
  processingAsset: boolean;
  mutationsBlocked: boolean;
  onSelect: (id: string) => void;
  onLocalPatch: (patch: Partial<WorkspaceNode>) => void;
  onCommitPatch: (patch: WorkspaceNodePatch) => void;
  onImmediatePatch: (patch: WorkspaceNodePatch) => void;
  onLayerAction: (action: WorkspaceLayerAction) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReplace: (event: ChangeEvent<HTMLInputElement>) => void;
  onCrop: () => void;
  onRemoveBackground: () => void;
}) {
  const replaceInput = useRef<HTMLInputElement>(null);
  const ordered = sortedNodes(workspace.nodes);
  const selectedIndex = node ? ordered.findIndex((item) => item.id === node.id) : -1;
  const styleSpec = node
    ? workspace.styleSpecs.find((spec) => spec.id === node.styleSpecId) ?? null
    : null;
  const editingDisabled = Boolean(node?.locked || mutationsBlocked);
  const resizeDisabled = Boolean(editingDisabled || node?.rotation);
  const backgroundRemovalTooLarge = Boolean(
    node &&
      node.pixelWidth > 0 &&
      node.pixelHeight > 0 &&
      node.pixelWidth * node.pixelHeight > MAX_DEV_BACKGROUND_PIXELS,
  );

  return (
    <aside className={`${styles.panel} ${styles.inspectorPanel}`} aria-label="Inspector">
      <div className={styles.panelHeader}>
        <span className={styles.panelIcon}><Icon name="layers" /></span>
        <div>
          <h2>Inspector</h2>
          <p>{node ? node.name : "Select a layer to edit it"}</p>
        </div>
      </div>

      <div className={styles.inspectorScroll}>
        {node ? (
          <>
            <section className={styles.inspectorSection}>
              <label className={styles.nameField}>
                <span>Layer name</span>
                <input
                  disabled={editingDisabled}
                  maxLength={80}
                  onBlur={() => onCommitPatch({ name: node.name })}
                  onChange={(event) => onLocalPatch({ name: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  value={node.name}
                />
              </label>
              <div className={styles.statusToggles}>
                <button
                  aria-pressed={node.visible}
                  disabled={mutationsBlocked}
                  onClick={() => onImmediatePatch({ visible: !node.visible })}
                  type="button"
                >
                  <Icon name={node.visible ? "eye" : "eye-off"} />
                  {node.visible ? "Visible" : "Hidden"}
                </button>
                <button
                  aria-pressed={node.locked}
                  disabled={mutationsBlocked}
                  onClick={() => onImmediatePatch({ locked: !node.locked })}
                  type="button"
                >
                  <Icon name={node.locked ? "lock" : "unlock"} />
                  {node.locked ? "Locked" : "Unlocked"}
                </button>
              </div>
            </section>

            <section className={styles.inspectorSection}>
              <div className={styles.inspectorTitle}>
                <h3>Geometry</h3>
                <button
                  aria-label={
                    node.aspectLocked ? "Unlock aspect ratio" : "Lock aspect ratio"
                  }
                  aria-pressed={node.aspectLocked}
                  disabled={resizeDisabled}
                  onClick={() =>
                    onImmediatePatch({ aspectLocked: !node.aspectLocked })}
                  title={node.aspectLocked ? "Aspect ratio locked" : "Aspect ratio free"}
                  type="button"
                >
                  <Icon name={node.aspectLocked ? "lock" : "unlock"} size={13} />
                  Ratio
                </button>
              </div>
              <div className={styles.geometryGrid}>
                <InspectorNumber
                  disabled={editingDisabled}
                  label="X"
                  max={workspace.width - node.width}
                  min={0}
                  onChange={(x) => onLocalPatch({ x })}
                  onCommit={() => onCommitPatch({ x: node.x })}
                  value={node.x}
                />
                <InspectorNumber
                  disabled={editingDisabled}
                  label="Y"
                  max={workspace.height - node.height}
                  min={0}
                  onChange={(y) => onLocalPatch({ y })}
                  onCommit={() => onCommitPatch({ y: node.y })}
                  value={node.y}
                />
                <InspectorNumber
                  disabled={resizeDisabled}
                  label="W"
                  max={workspace.width}
                  min={24}
                  onChange={(width) => {
                    onLocalPatch(inspectorSizeGeometry(node, "width", width, workspace));
                  }}
                  onCommit={() =>
                    onCommitPatch({ width: node.width, height: node.height })}
                  value={node.width}
                />
                <InspectorNumber
                  disabled={resizeDisabled}
                  label="H"
                  max={workspace.height}
                  min={24}
                  onChange={(height) => {
                    onLocalPatch(inspectorSizeGeometry(node, "height", height, workspace));
                  }}
                  onCommit={() =>
                    onCommitPatch({ width: node.width, height: node.height })}
                  value={node.height}
                />
              </div>
              {node.rotation !== 0 ? (
                <p className={styles.legacyGeometryNote}>
                  This legacy layer is rotated. Resize is disabled to prevent
                  incorrect geometry.
                </p>
              ) : null}
            </section>

            <section className={styles.inspectorSection}>
              <h3>Appearance</h3>
              <label className={styles.colorField}>
                <span>{node.kind === "IMAGE" ? "Tint" : "Fill"}</span>
                <span>
                  <input
                    aria-label={node.kind === "IMAGE" ? "Image tint" : "Fill color"}
                    disabled={editingDisabled}
                    onBlur={() => onCommitPatch({ color: node.color })}
                    onChange={(event) => onLocalPatch({ color: event.target.value })}
                    type="color"
                    value={node.color}
                  />
                  <code>{node.color.toUpperCase()}</code>
                </span>
              </label>
              <label className={styles.opacityField}>
                <span>Opacity</span>
                <output aria-label="Opacity value">
                  {Math.round(node.opacity * 100)}%
                </output>
                <input
                  aria-label="Opacity"
                  disabled={editingDisabled}
                  max="1"
                  min="0"
                  onBlur={() => onCommitPatch({ opacity: node.opacity })}
                  onChange={(event) =>
                    onLocalPatch({ opacity: Number(event.target.value) })}
                  onPointerUp={() => onCommitPatch({ opacity: node.opacity })}
                  step="0.01"
                  type="range"
                  value={node.opacity}
                />
              </label>
            </section>

            <section className={styles.inspectorSection}>
              <div className={styles.inspectorTitle}>
                <h3>Layer order</h3>
                <span>{selectedIndex + 1} / {ordered.length}</span>
              </div>
              <div className={styles.orderButtons}>
                <button
                  disabled={editingDisabled || selectedIndex <= 0}
                  onClick={() => onLayerAction("SEND_BACKWARD")}
                  type="button"
                >
                  <Icon name="backward" />
                  Backward
                </button>
                <button
                  disabled={editingDisabled || selectedIndex >= ordered.length - 1}
                  onClick={() => onLayerAction("BRING_FORWARD")}
                  type="button"
                >
                  <Icon name="forward" />
                  Forward
                </button>
              </div>
            </section>

            {node.kind === "IMAGE" ? (
              <section className={styles.inspectorSection}>
                <h3>Image</h3>
                <input
                  accept="image/png,image/jpeg,image/webp"
                  className={styles.hiddenInput}
                  onChange={onReplace}
                  ref={replaceInput}
                  tabIndex={-1}
                  type="file"
                />
                <div className={styles.imageActions}>
                  <button
                    disabled={processingAsset || editingDisabled}
                    onClick={() => replaceInput.current?.click()}
                    type="button"
                  >
                    <Icon name="image" />
                    Replace
                  </button>
                  <button
                    disabled={processingAsset || editingDisabled}
                    onClick={onCrop}
                    type="button"
                  >
                    <Icon name="crop" />
                    Crop
                  </button>
                </div>
                {workspace.developmentFeatures.solidBackgroundRemoval ? (
                  <button
                    className={styles.devAction}
                    disabled={
                      processingAsset ||
                      editingDisabled ||
                      backgroundRemovalTooLarge
                    }
                    onClick={onRemoveBackground}
                    type="button"
                  >
                    <Icon name="wand" />
                    Remove solid background
                    <span>
                      {backgroundRemovalTooLarge
                        ? "Unavailable over 4 MP"
                        : "Development only · max 4 MP"}
                    </span>
                  </button>
                ) : null}
                <dl className={styles.assetFacts}>
                  <div><dt>Source</dt><dd>{node.assetSource ?? "Unknown"}</dd></div>
                  <div>
                    <dt>Pixels</dt>
                    <dd>
                      {node.pixelWidth > 0 && node.pixelHeight > 0
                        ? `${node.pixelWidth} × ${node.pixelHeight}`
                        : "Not recorded"}
                    </dd>
                  </div>
                  {node.assetOperation ? (
                    <div><dt>Derived</dt><dd>{node.assetOperation.replaceAll("_", " ")}</dd></div>
                  ) : null}
                </dl>
              </section>
            ) : null}

            <section className={styles.inspectorSection}>
              <h3>Project memory</h3>
              <label className={styles.selectField}>
                <span>StyleSpec</span>
                <select
                  disabled={editingDisabled}
                  onChange={(event) => {
                    const nextSpec =
                      workspace.styleSpecs.find((item) => item.id === event.target.value) ??
                      null;
                    onImmediatePatch({
                      styleSpecId: nextSpec?.id ?? null,
                      referenceIds: nextSpec?.referenceIds ?? [],
                    });
                  }}
                  value={node.styleSpecId ?? ""}
                >
                  <option value="">Unassigned</option>
                  {workspace.styleSpecs.map((spec) => (
                    <option key={spec.id} value={spec.id}>{spec.styleName}</option>
                  ))}
                </select>
              </label>
              {styleSpec ? (
                <div className={styles.memorySummary}>
                  <strong>{styleSpec.styleName}</strong>
                  <span>{styleSpec.detailLevel}</span>
                </div>
              ) : null}
              <div className={styles.sourceRefs}>
                <span>Source references</span>
                {node.referenceIds.length ? (
                  node.referenceIds.map((id) => (
                    <i key={id}>{titleForReference(id, workspace.references)}</i>
                  ))
                ) : (
                  <small>None associated</small>
                )}
              </div>
            </section>

            <section className={`${styles.inspectorSection} ${styles.destructiveSection}`}>
              <button disabled={mutationsBlocked} onClick={onDuplicate} type="button">
                <Icon name="duplicate" />
                Duplicate layer
              </button>
              <button disabled={editingDisabled} onClick={onDelete} type="button">
                <Icon name="trash" />
                Delete layer
              </button>
            </section>
          </>
        ) : (
          <div className={styles.emptyInspector}>
            <div><span /><span /><span /><span /></div>
            <strong>Nothing selected</strong>
            <p>Select an asset on the canvas or in the layer list.</p>
          </div>
        )}

        <section className={styles.layersList}>
          <div className={styles.inspectorTitle}>
            <h3>Layers</h3>
            <span>{workspace.nodes.length}</span>
          </div>
          <div>
            {[...workspace.nodes]
              .sort((left, right) => right.zIndex - left.zIndex)
              .map((item) => (
                <div
                  className={`${styles.layerRow} ${
                    item.id === node?.id ? styles.activeLayer : ""
                  }`}
                  key={item.id}
                >
                  <button
                    className={styles.layerSelect}
                    onClick={() => onSelect(item.id)}
                    type="button"
                  >
                    <i
                      style={
                        item.kind === "RECTANGLE"
                          ? { backgroundColor: item.color }
                          : undefined
                      }
                    >
                      {item.kind === "IMAGE" ? <Icon name="image" size={12} /> : null}
                    </i>
                    <span>{item.name}</span>
                  </button>
                  <span className={styles.layerFlags}>
                    {!item.visible ? <Icon name="eye-off" size={12} /> : null}
                    {item.locked ? <Icon name="lock" size={11} /> : null}
                  </span>
                </div>
              ))}
            {workspace.nodes.length === 0 ? <p>No layers yet.</p> : null}
          </div>
        </section>
      </div>
    </aside>
  );
}

function CropDialog({
  node,
  crop,
  processing,
  onChange,
  onCancel,
  onApply,
}: {
  node: WorkspaceNode;
  crop: NormalizedCropRect;
  processing: boolean;
  onChange: (crop: NormalizedCropRect) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  function update(field: keyof NormalizedCropRect, percent: number) {
    if (!Number.isFinite(percent)) return;
    const next = { ...crop };
    if (field === "x") {
      next.x = clampNumber(percent / 100, 0, 0.99);
      next.width = clampNumber(next.width, 0.01, 1 - next.x);
    } else if (field === "y") {
      next.y = clampNumber(percent / 100, 0, 0.99);
      next.height = clampNumber(next.height, 0.01, 1 - next.y);
    } else if (field === "width") {
      next.width = clampNumber(percent / 100, 0.01, 1 - next.x);
    } else {
      next.height = clampNumber(percent / 100, 0.01, 1 - next.y);
    }
    onChange(next);
  }

  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <section
        aria-labelledby="crop-title"
        aria-modal="true"
        className={styles.cropDialog}
        role="dialog"
      >
        <header>
          <div>
            <span>Non-destructive derivative</span>
            <h2 id="crop-title">Crop {node.name}</h2>
          </div>
          <button aria-label="Close crop dialog" onClick={onCancel} type="button">×</button>
        </header>
        <div className={styles.cropPreview}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={node.assetUrl ?? ""} />
          <span
            style={{
              height: `${crop.height * 100}%`,
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.width * 100}%`,
            }}
          />
        </div>
        <div className={styles.cropFields}>
          {(
            [
              ["x", "Left"],
              ["y", "Top"],
              ["width", "Width"],
              ["height", "Height"],
            ] as const
          ).map(([field, label]) => (
            <label key={field}>
              <span>{label}</span>
              <input
                max={
                  field === "x" || field === "y"
                    ? 99
                    : 100
                }
                min={field === "width" || field === "height" ? 1 : 0}
                onChange={(event) => update(field, Number(event.target.value))}
                type="number"
                value={Math.round(crop[field] * 100)}
              />
              <i>%</i>
            </label>
          ))}
        </div>
        <footer>
          <button disabled={processing} onClick={onCancel} type="button">Cancel</button>
          <button disabled={processing} onClick={onApply} type="button">
            {processing ? "Creating crop…" : "Create cropped asset"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function Workspace({
  initialWorkspace,
}: {
  initialWorkspace: WorkspacePayload;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const workspaceRef = useRef(initialWorkspace);
  const [brief, setBrief] = useState(initialWorkspace.brief);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState(
    initialWorkspace.selectedReferenceIds,
  );
  const [directionDirty, setDirectionDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialWorkspace.nodes.at(-1)?.id ?? null,
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [buildingSpec, setBuildingSpec] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processingAsset, setProcessingAsset] = useState(false);
  const [restoringHistory, setRestoringHistory] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("canvas");
  const [zoom, setZoom] = useState(0.7);
  const [snapGuides, setSnapGuides] = useState<readonly SnapGuide[]>([]);
  const [cropNodeId, setCropNodeId] = useState<string | null>(null);
  const [crop, setCrop] = useState<NormalizedCropRect>(EMPTY_CROP);
  const [exportOpen, setExportOpen] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const canvasScroller = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction | null>(null);
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());
  const directionMutationQueue = useRef<Promise<void>>(Promise.resolve());
  const directionRevision = useRef(0);
  const pendingWrites = useRef(0);
  const writeFailed = useRef(false);
  const restoringHistoryRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialSnapshot = useMemo(
    () => nodeSnapshots(initialWorkspace.nodes),
    [initialWorkspace.nodes],
  );
  const [history, setHistory] = useState<
    SnapshotHistory<readonly WorkspaceNodeSnapshot[]>
  >(() => createSnapshotHistory(initialSnapshot));
  const historyRef = useRef(history);

  const currentStyleSpec =
    workspace.styleSpecs.find((spec) => spec.id === workspace.currentStyleSpecId) ??
    null;
  const selectedNode =
    workspace.nodes.find((node) => node.id === selectedId) ?? null;
  const cropNode =
    workspace.nodes.find((node) => node.id === cropNodeId) ?? null;

  const replaceWorkspace = useCallback(
    (
      value:
        | WorkspacePayload
        | ((current: WorkspacePayload) => WorkspacePayload),
    ) => {
      setWorkspace((current) => {
        const next = typeof value === "function" ? value(current) : value;
        workspaceRef.current = next;
        return next;
      });
    },
    [],
  );

  function setHistoryValue(
    next: SnapshotHistory<readonly WorkspaceNodeSnapshot[]>,
  ) {
    historyRef.current = next;
    setHistory(next);
  }

  function recordNodes(nodes: readonly WorkspaceNode[]) {
    setHistoryValue(
      commitHistory(historyRef.current, nodeSnapshots(nodes), {
        equals: snapshotsEqual,
      }),
    );
  }

  function beginPendingWrite() {
    if (pendingWrites.current === 0) writeFailed.current = false;
    pendingWrites.current += 1;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    setActionError(null);
  }

  function markSaved() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saved");
    saveTimer.current = setTimeout(() => setSaveState("idle"), 1500);
  }

  function markWriteFailed() {
    writeFailed.current = true;
    setSaveState("error");
  }

  function finishPendingWrite() {
    pendingWrites.current = Math.max(0, pendingWrites.current - 1);
    if (pendingWrites.current === 0 && !writeFailed.current) markSaved();
  }

  function queueMutation<T>(mutation: () => Promise<T>) {
    beginPendingWrite();
    const pending = mutationQueue.current.then(mutation);
    const tracked = pending.finally(finishPendingWrite);
    mutationQueue.current = tracked.then(
      () => undefined,
      () => undefined,
    );
    return tracked;
  }

  const loadWorkspace = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const data = await responseJson(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(data, "The workspace could not be opened."));
      }
      const next = data as WorkspacePayload;
      directionRevision.current += 1;
      replaceWorkspace(next);
      setBrief(next.brief);
      setSelectedReferenceIds(next.selectedReferenceIds);
      setDirectionDirty(false);
      const nextHistory = createSnapshotHistory(nodeSnapshots(next.nodes));
      historyRef.current = nextHistory;
      setHistory(nextHistory);
      setSelectedId((current) =>
        next.nodes.some((node) => node.id === current) ? current : null);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The workspace could not be opened.",
      );
    }
  }, [replaceWorkspace]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const fitCanvas = useCallback(() => {
    const scroller = canvasScroller.current;
    if (!scroller) return;
    const next = Math.round(
      fitCanvasZoom({
        canvas: { width: workspace.width, height: workspace.height },
        maxZoom: ZOOM_MAX,
        minZoom: ZOOM_MIN,
        padding: 56,
        viewport: {
          width: scroller.clientWidth,
          height: scroller.clientHeight,
        },
      }) * 100,
    ) / 100;
    setZoom(next);
    requestAnimationFrame(() => {
      const contentWidth = workspace.width * next;
      const contentHeight = workspace.height * next;
      scroller.scrollLeft = Math.max(0, (contentWidth - scroller.clientWidth) / 2 + 56);
      scroller.scrollTop = Math.max(0, (contentHeight - scroller.clientHeight) / 2 + 56);
    });
  }, [workspace.height, workspace.width]);

  useEffect(() => {
    const frame = requestAnimationFrame(fitCanvas);
    return () => cancelAnimationFrame(frame);
  }, [fitCanvas]);

  function updateLocalNode(id: string, patch: Partial<WorkspaceNode>) {
    if (restoringHistoryRef.current) return;
    replaceWorkspace((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === id ? { ...node, ...patch } : node),
    }));
  }

  async function persistNode(id: string, patch: WorkspaceNodePatch) {
    if (restoringHistoryRef.current) return null;
    return queueMutation(async () => {
      try {
        const response = await fetch(
          `/api/workspace/nodes/${encodeURIComponent(id)}`,
          {
            body: JSON.stringify(patch),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          },
        );
        const data = await responseJson(response);
        if (!response.ok) {
          throw new Error(getErrorMessage(data, "The layer could not be saved."));
        }
        return (data as { node: WorkspaceNode }).node;
      } catch (cause) {
        markWriteFailed();
        setActionError(
          cause instanceof Error ? cause.message : "The layer could not be saved.",
        );
        await loadWorkspace();
        return null;
      }
    });
  }

  function commitSelectedPatch(patch: WorkspaceNodePatch) {
    if (!selectedId || restoringHistoryRef.current) return;
    const current = workspaceRef.current;
    const node = current.nodes.find((item) => item.id === selectedId);
    if (!node) return;
    const normalizedPatch = { ...patch };
    if (normalizedPatch.name !== undefined) {
      normalizedPatch.name = normalizedPatch.name.trim();
      if (!normalizedPatch.name) {
        const previousName =
          historyRef.current.present.find((item) => item.id === selectedId)?.name ??
          "Untitled layer";
        updateLocalNode(selectedId, { name: previousName });
        setActionError("Layer name cannot be empty.");
        return;
      }
    }
    const nextNodes = current.nodes.map((item) =>
      item.id === selectedId ? { ...item, ...normalizedPatch } : item);
    replaceWorkspace({ ...current, nodes: nextNodes });
    recordNodes(nextNodes);
    void persistNode(selectedId, normalizedPatch);
  }

  function immediateSelectedPatch(patch: WorkspaceNodePatch) {
    commitSelectedPatch(patch);
  }

  function startInteraction(
    event: ReactPointerEvent<HTMLElement>,
    node: WorkspaceNode,
    mode: Interaction["mode"],
    handle?: ResizeCorner,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(node.id);
    if (
      node.locked ||
      restoringHistoryRef.current ||
      (mode === "resize" && node.rotation !== 0)
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    interaction.current = {
      nodeId: node.id,
      mode,
      handle,
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      start: { x: node.x, y: node.y, width: node.width, height: node.height },
      current: { x: node.x, y: node.y, width: node.width, height: node.height },
      moved: false,
    };
  }

  function moveInteraction(event: ReactPointerEvent<HTMLElement>) {
    const active = interaction.current;
    if (!active || event.pointerId !== active.pointerId) return;
    if (restoringHistoryRef.current) return;
    const current = workspaceRef.current;
    const screenDelta = {
      x: event.clientX - active.startPointer.x,
      y: event.clientY - active.startPointer.y,
    };
    const node = current.nodes.find((item) => item.id === active.nodeId);
    if (!node) return;
    let next: NodeGeometry;
    if (active.mode === "drag") {
      const result = dragRectWithSnapping({
        bounds: { width: current.width, height: current.height },
        movingNodeId: node.id,
        rect: active.start,
        screenDelta,
        targets: current.nodes,
        zoom,
      });
      next = result.rect;
      setSnapGuides(result.guides);
    } else {
      next = resizeRectFromCorner({
        bounds: { width: current.width, height: current.height },
        handle: active.handle ?? "se",
        lockAspectRatio: node.aspectLocked,
        rect: active.start,
        screenDelta,
        shiftKey: event.shiftKey,
        zoom,
      });
      setSnapGuides([]);
    }
    active.current = next;
    active.moved =
      active.moved ||
      Math.abs(screenDelta.x) > 1 ||
      Math.abs(screenDelta.y) > 1;
    updateLocalNode(active.nodeId, next);
  }

  function endInteraction(event: ReactPointerEvent<HTMLElement>) {
    const active = interaction.current;
    if (!active || active.pointerId !== event.pointerId) return;
    interaction.current = null;
    setSnapGuides([]);
    if (restoringHistoryRef.current) return;
    if (!active.moved) return;
    const current = workspaceRef.current;
    const nextNodes = current.nodes.map((node) =>
      node.id === active.nodeId ? { ...node, ...active.current } : node);
    replaceWorkspace({ ...current, nodes: nextNodes });
    recordNodes(nextNodes);
    void persistNode(active.nodeId, active.current);
  }

  function selectNode(id: string) {
    setSelectedId(id);
  }

  function persistDirectionDraft(
    nextBrief: GameBrief,
    nextReferenceIds: string[],
  ) {
    const revision = ++directionRevision.current;
    beginPendingWrite();
    const pending = directionMutationQueue.current.then(async () => {
      try {
        const response = await fetch("/api/workspace/direction", {
          body: JSON.stringify({
            brief: nextBrief,
            selectedReferenceIds: nextReferenceIds,
          }),
          headers: { "Content-Type": "application/json" },
          method: "PATCH",
        });
        const data = await responseJson(response);
        if (!response.ok) {
          throw new Error(
            getErrorMessage(data, "The art direction could not be saved."),
          );
        }
        if (revision !== directionRevision.current) return;
        const saved = data as {
          brief: GameBrief;
          selectedReferenceIds: string[];
          currentStyleSpecId: string | null;
        };
        replaceWorkspace((current) => ({
          ...current,
          brief: saved.brief,
          selectedReferenceIds: saved.selectedReferenceIds,
          currentStyleSpecId: saved.currentStyleSpecId,
        }));
        setDirectionDirty(saved.currentStyleSpecId === null);
      } catch (cause) {
        if (revision !== directionRevision.current) return;
        markWriteFailed();
        setActionError(
          cause instanceof Error
            ? cause.message
            : "The art direction could not be saved.",
        );
      }
    });
    const tracked = pending.finally(finishPendingWrite);
    directionMutationQueue.current = tracked.then(
      () => undefined,
      () => undefined,
    );
    return tracked;
  }

  async function saveDirectionDraft() {
    await persistDirectionDraft(brief, selectedReferenceIds);
  }

  function changeBrief(key: keyof GameBrief, value: string) {
    if (buildingSpec || restoringHistoryRef.current) return;
    setBrief((current) => ({ ...current, [key]: value }));
    setDirectionDirty(true);
  }

  function toggleReference(id: string) {
    if (buildingSpec || restoringHistoryRef.current) return;
    const next = selectedReferenceIds.includes(id)
      ? selectedReferenceIds.filter((item) => item !== id)
      : selectedReferenceIds.length < 3
        ? [...selectedReferenceIds, id]
        : selectedReferenceIds;
    setSelectedReferenceIds(next);
    setDirectionDirty(true);
    void persistDirectionDraft(brief, next);
  }

  async function uploadReference(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || buildingSpec || restoringHistoryRef.current) return;
    setUploading(true);
    setActionError(null);
    try {
      const dimensions = await imageDimensions(file);
      const form = new FormData();
      form.set("file", file);
      form.set("width", String(dimensions.width));
      form.set("height", String(dimensions.height));
      const response = await fetch("/api/workspace/references", {
        body: form,
        method: "POST",
      });
      const data = await responseJson(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(data, "The reference could not be uploaded."));
      }
      const reference = (data as { reference: ReferenceItem }).reference;
      replaceWorkspace((current) => ({
        ...current,
        references: [...current.references, reference],
      }));
      const nextReferenceIds =
        selectedReferenceIds.length < 3
          ? [...selectedReferenceIds, reference.id]
          : selectedReferenceIds;
      setSelectedReferenceIds(nextReferenceIds);
      if (nextReferenceIds !== selectedReferenceIds) setDirectionDirty(true);
      await persistDirectionDraft(brief, nextReferenceIds);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The reference could not be uploaded.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function buildStyleSpec() {
    if (restoringHistoryRef.current) return;
    setBuildingSpec(true);
    setActionError(null);
    try {
      await directionMutationQueue.current;
      const response = await fetch("/api/workspace/direction", {
        body: JSON.stringify({ brief, selectedReferenceIds }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await responseJson(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(data, "The StyleSpec could not be built."));
      }
      const styleSpec = (data as { styleSpec: StyleSpec }).styleSpec;
      replaceWorkspace((current) => ({
        ...current,
        brief,
        selectedReferenceIds,
        currentStyleSpecId: styleSpec.id,
        styleSpecs: current.styleSpecs.some((item) => item.id === styleSpec.id)
          ? current.styleSpecs
          : [...current.styleSpecs, styleSpec],
      }));
      setDirectionDirty(false);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The StyleSpec could not be built.",
      );
    } finally {
      setBuildingSpec(false);
    }
  }

  async function uploadAsset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || restoringHistoryRef.current) return;
    setUploading(true);
    setActionError(null);
    try {
      const dimensions = await imageDimensions(file);
      const form = new FormData();
      form.set("file", file);
      form.set("width", String(dimensions.width));
      form.set("height", String(dimensions.height));
      const response = await fetch("/api/workspace/assets", {
        body: form,
        method: "POST",
      });
      const data = await responseJson(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(data, "The asset could not be imported."));
      }
      const node = (data as { node: WorkspaceNode }).node;
      const current = workspaceRef.current;
      const nextNodes = [...current.nodes, node];
      replaceWorkspace({ ...current, nodes: nextNodes });
      recordNodes(nextNodes);
      setSelectedId(node.id);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The asset could not be imported.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function generate(prompt: string) {
    if (restoringHistoryRef.current) return;
    const spec = workspaceRef.current.styleSpecs.find(
      (item) => item.id === workspaceRef.current.currentStyleSpecId,
    );
    if (!spec || directionDirty) return;
    setGenerating(true);
    setActionError(null);
    try {
      const form = new FormData();
      form.set("styleSpecId", spec.id);
      if (prompt.trim()) form.set("prompt", prompt.trim());
      const response = await fetch("/api/workspace/generate", {
        body: form,
        method: "POST",
      });
      const data = await responseJson(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(data, "The asset could not be generated."));
      }
      const node = (data as { node: WorkspaceNode }).node;
      const current = workspaceRef.current;
      const nextNodes = [...current.nodes, node];
      replaceWorkspace({ ...current, nodes: nextNodes });
      recordNodes(nextNodes);
      setSelectedId(node.id);
      setMobilePanel("canvas");
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The asset could not be generated.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function duplicateSelected() {
    if (!selectedId || restoringHistoryRef.current) return;
    setActionError(null);
    try {
      const response = await fetch(
        `/api/workspace/nodes/${encodeURIComponent(selectedId)}/duplicate`,
        { method: "POST" },
      );
      const data = await responseJson(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(data, "The layer could not be duplicated."));
      }
      const node = (data as { node: WorkspaceNode }).node;
      const current = workspaceRef.current;
      const nextNodes = [...current.nodes, node];
      replaceWorkspace({ ...current, nodes: nextNodes });
      recordNodes(nextNodes);
      setSelectedId(node.id);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The layer could not be duplicated.",
      );
    }
  }

  async function deleteSelected() {
    if (!selectedId || restoringHistoryRef.current) return;
    const id = selectedId;
    const selected = workspaceRef.current.nodes.find((node) => node.id === id);
    if (!selected || selected.locked) return;
    setActionError(null);
    try {
      const response = await fetch(
        `/api/workspace/nodes/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = response.status === 204 ? null : await responseJson(response);
      if (!response.ok) {
        throw new Error(getErrorMessage(data, "The layer could not be deleted."));
      }
      const current = workspaceRef.current;
      const nextNodes = current.nodes
        .filter((node) => node.id !== id)
        .map((node, zIndex) => ({ ...node, zIndex }));
      replaceWorkspace({ ...current, nodes: nextNodes });
      recordNodes(nextNodes);
      setSelectedId(null);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The layer could not be deleted.",
      );
    }
  }

  function changeLayer(action: WorkspaceLayerAction) {
    if (!selectedId || restoringHistoryRef.current) return;
    const current = workspaceRef.current;
    const ordered = sortedNodes(current.nodes);
    const index = ordered.findIndex((node) => node.id === selectedId);
    if (index < 0) return;
    const moving = ordered[index];
    if (moving.locked) return;
    const remaining = ordered.filter((node) => node.id !== selectedId);
    if (action === "SEND_TO_BACK") remaining.unshift(moving);
    else if (action === "BRING_TO_FRONT") remaining.push(moving);
    else if (action === "SEND_BACKWARD") {
      remaining.splice(Math.max(0, index - 1), 0, moving);
    } else {
      remaining.splice(Math.min(remaining.length, index + 1), 0, moving);
    }
    const z = new Map(remaining.map((node, zIndex) => [node.id, zIndex]));
    const nextNodes = current.nodes.map((node) => ({
      ...node,
      zIndex: z.get(node.id) ?? node.zIndex,
    }));
    replaceWorkspace({ ...current, nodes: nextNodes });
    recordNodes(nextNodes);
    void persistNode(selectedId, { layerAction: action });
  }

  async function syncHistorySnapshot(
    snapshots: readonly WorkspaceNodeSnapshot[],
  ) {
    if (restoringHistoryRef.current) return;
    restoringHistoryRef.current = true;
    interaction.current = null;
    setRestoringHistory(true);
    setSnapGuides([]);
    setExportOpen(false);
    try {
      await queueMutation(async () => {
        try {
          const response = await fetch("/api/workspace/nodes", {
            body: JSON.stringify({ nodes: snapshots }),
            headers: { "Content-Type": "application/json" },
            method: "PUT",
          });
          const data = await responseJson(response);
          if (!response.ok) {
            throw new Error(
              getErrorMessage(data, "History could not be restored."),
            );
          }
          const nodes = (data as { nodes: WorkspaceNode[] }).nodes;
          replaceWorkspace((current) => ({ ...current, nodes }));
          setSelectedId((current) =>
            nodes.some((node) => node.id === current)
              ? current
              : sortedNodes(nodes).at(-1)?.id ?? null);
        } catch (cause) {
          markWriteFailed();
          setActionError(
            cause instanceof Error
              ? cause.message
              : "History could not be restored.",
          );
          await loadWorkspace();
        }
      });
    } finally {
      restoringHistoryRef.current = false;
      setRestoringHistory(false);
    }
  }

  function undo() {
    if (restoringHistoryRef.current) return;
    const next = undoHistory(historyRef.current);
    if (next === historyRef.current) return;
    setHistoryValue(next);
    void syncHistorySnapshot(next.present);
  }

  function redo() {
    if (restoringHistoryRef.current) return;
    const next = redoHistory(historyRef.current);
    if (next === historyRef.current) return;
    setHistoryValue(next);
    void syncHistorySnapshot(next.present);
  }

  function nudgeSelected(dx: number, dy: number) {
    if (restoringHistoryRef.current) return;
    const current = workspaceRef.current;
    const node = current.nodes.find((item) => item.id === selectedId);
    if (!node || node.locked) return;
    const nextRect = moveRectWithinBounds(
      node,
      { x: dx, y: dy },
      { width: current.width, height: current.height },
    );
    const nextNodes = current.nodes.map((item) =>
      item.id === node.id ? { ...item, ...nextRect } : item);
    replaceWorkspace({ ...current, nodes: nextNodes });
    recordNodes(nextNodes);
    void persistNode(node.id, { x: nextRect.x, y: nextRect.y });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']") ||
        cropNodeId
      ) {
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void duplicateSelected();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        void deleteSelected();
      } else if (selectedId && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        nudgeSelected(
          event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0,
          event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0,
        );
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function replaceAssetBytes(
    node: WorkspaceNode,
    blob: Blob,
    operation: AssetOperation,
    fileName: string,
    operationParameters: AssetOperationParameters,
  ) {
    const dimensions = await imageDimensions(blob);
    const current = workspaceRef.current;
    const frame =
      operation === "REMOVE_SOLID_BACKGROUND"
        ? node
        : displayFrameForAspect(
            node,
            dimensions.width,
            dimensions.height,
            current,
          );
    const form = new FormData();
    form.set("file", new File([blob], fileName, { type: blob.type || "image/png" }));
    form.set("width", String(dimensions.width));
    form.set("height", String(dimensions.height));
    form.set("displayWidth", String(frame.width));
    form.set("displayHeight", String(frame.height));
    form.set("operation", operation);
    form.set("operationParameters", JSON.stringify(operationParameters));
    const response = await fetch(
      `/api/workspace/nodes/${encodeURIComponent(node.id)}/asset`,
      { body: form, method: "PUT" },
    );
    const data = await responseJson(response);
    if (!response.ok) {
      throw new Error(getErrorMessage(data, "The image edit could not be saved."));
    }
    const updated = (data as { node: WorkspaceNode }).node;
    const latest = workspaceRef.current;
    const nextNodes = latest.nodes.map((item) =>
      item.id === updated.id ? updated : item);
    replaceWorkspace({ ...latest, nodes: nextNodes });
    recordNodes(nextNodes);
  }

  async function replaceImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const node = workspaceRef.current.nodes.find((item) => item.id === selectedId);
    if (
      !file ||
      !node ||
      node.kind !== "IMAGE" ||
      node.locked ||
      restoringHistoryRef.current
    ) {
      return;
    }
    setProcessingAsset(true);
    setActionError(null);
    try {
      await replaceAssetBytes(
        node,
        file,
        "REPLACE",
        file.name,
        { fit: "contain" },
      );
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The image could not be replaced.",
      );
    } finally {
      setProcessingAsset(false);
    }
  }

  async function removeBackground() {
    const node = workspaceRef.current.nodes.find((item) => item.id === selectedId);
    if (
      !node?.assetUrl ||
      node.kind !== "IMAGE" ||
      node.locked ||
      restoringHistoryRef.current
    ) {
      return;
    }
    setProcessingAsset(true);
    setActionError(null);
    try {
      const image = await loadImage(node.assetUrl);
      const pixelCount = image.naturalWidth * image.naturalHeight;
      if (pixelCount > MAX_DEV_BACKGROUND_PIXELS) {
        throw new Error(
          "The development-only background remover supports images up to 4 megapixels.",
        );
      }
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas image processing is unavailable.");
      context.drawImage(image, 0, 0);
      const source = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = removeBorderConnectedBackground({
        width: source.width,
        height: source.height,
        data: source.data,
      }, { tolerance: DEV_BACKGROUND_TOLERANCE });
      if (result.removedPixelCount === 0) {
        throw new Error(
          "No edge-connected solid background was detected. The development tool only handles flat backgrounds.",
        );
      }
      context.putImageData(
        new ImageData(result.data, result.width, result.height),
        0,
        0,
      );
      await replaceAssetBytes(
        node,
        await canvasBlob(canvas),
        "REMOVE_SOLID_BACKGROUND",
        `${node.name}-transparent.png`,
        {
          method: "border-flood-fill",
          tolerance: DEV_BACKGROUND_TOLERANCE,
          removedPixelCount: result.removedPixelCount,
          borderMatchRatio: result.borderMatchRatio,
          backgroundColor: rgbaHex(result.backgroundColor),
        },
      );
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The background could not be removed.",
      );
    } finally {
      setProcessingAsset(false);
    }
  }

  async function applyCrop() {
    const node = workspaceRef.current.nodes.find((item) => item.id === cropNodeId);
    if (
      !node?.assetUrl ||
      node.kind !== "IMAGE" ||
      node.locked ||
      restoringHistoryRef.current
    ) {
      return;
    }
    setProcessingAsset(true);
    setActionError(null);
    try {
      const image = await loadImage(node.assetUrl);
      const pixels = normalizedCropToPixels(crop, image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = pixels.width;
      canvas.height = pixels.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas image processing is unavailable.");
      context.drawImage(
        image,
        pixels.x,
        pixels.y,
        pixels.width,
        pixels.height,
        0,
        0,
        pixels.width,
        pixels.height,
      );
      await replaceAssetBytes(
        node,
        await canvasBlob(canvas),
        "CROP",
        `${node.name}-crop.png`,
        { ...crop },
      );
      setCropNodeId(null);
      setCrop(EMPTY_CROP);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The crop could not be created.",
      );
    } finally {
      setProcessingAsset(false);
    }
  }

  function exportInput() {
    const current = workspaceRef.current;
    return {
      workspace: {
        id: current.id,
        name: current.name,
        width: current.width,
        height: current.height,
      },
      brief,
      nodes: current.nodes.map((node) => ({
        ...node,
        assetMimeType: node.mimeType,
      })),
      references: current.references,
      selectedReferenceIds,
      selectedStyleSpec:
        directionDirty
          ? null
          : current.styleSpecs.find(
              (spec) => spec.id === current.currentStyleSpecId,
            ) ?? null,
    };
  }

  async function exportComposedPng() {
    setExportOpen(false);
    setActionError(null);
    try {
      const plan = createWorkspaceExportPlan(exportInput());
      const file = plan.files.find((item) => item.kind === "COMPOSED_PNG");
      if (!file) throw new Error("The PNG export plan is unavailable.");
      const canvas = document.createElement("canvas");
      canvas.width = plan.canvas.width;
      canvas.height = plan.canvas.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas export is unavailable.");
      for (const node of plan.renderNodes) {
        context.save();
        context.globalAlpha = node.opacity;
        context.translate(node.x + node.width / 2, node.y + node.height / 2);
        context.rotate((node.rotation * Math.PI) / 180);
        if (node.type === "image" && node.imageUrl) {
          const image = await loadImage(node.imageUrl);
          const layer = document.createElement("canvas");
          layer.width = Math.max(1, Math.ceil(node.width));
          layer.height = Math.max(1, Math.ceil(node.height));
          const layerContext = layer.getContext("2d");
          if (!layerContext) {
            throw new Error("Canvas image export is unavailable.");
          }
          layerContext.drawImage(image, 0, 0, layer.width, layer.height);
          if (node.tint.toLowerCase() !== "#ffffff") {
            layerContext.globalAlpha = 0.58;
            layerContext.globalCompositeOperation = "source-atop";
            layerContext.fillStyle = node.tint;
            layerContext.fillRect(0, 0, layer.width, layer.height);
          }
          context.drawImage(
            layer,
            -node.width / 2,
            -node.height / 2,
            node.width,
            node.height,
          );
        } else {
          context.fillStyle = node.tint;
          context.fillRect(-node.width / 2, -node.height / 2, node.width, node.height);
        }
        context.restore();
      }
      downloadBlob(await canvasBlob(canvas), file.fileName);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The PNG could not be exported.",
      );
    }
  }

  function exportJson(
    kind:
      | "WORKSPACE_JSON"
      | "ASSET_METADATA_JSON"
      | "STYLE_SPEC_JSON"
      | "REFERENCE_METADATA_JSON",
  ) {
    setExportOpen(false);
    try {
      const file = createWorkspaceExportPlan(exportInput()).files.find(
        (item) => item.kind === kind,
      );
      if (!file || !("content" in file)) {
        throw new Error(
          kind === "STYLE_SPEC_JSON"
            ? "Build a StyleSpec before exporting it."
            : "This export is unavailable.",
        );
      }
      downloadBlob(
        new Blob([file.content], { type: "application/json" }),
        file.fileName,
      );
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The metadata could not be exported.",
      );
    }
  }

  return (
    <main className={styles.workspaceShell}>
      <header className={styles.appBar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>A</span>
          <strong>Atlas</strong>
          <i />
          <span>{workspace.name}</span>
        </div>
        <div className={styles.documentState} aria-live="polite">
          {saveState === "saving" ? <><i className={styles.savingDot} />Saving</> : null}
          {saveState === "saved" ? <><i className={styles.savedDot} />Saved</> : null}
          {saveState === "error" ? <><i className={styles.errorDot} />Save failed</> : null}
          {saveState === "idle" ? <>{workspace.nodes.length} layers</> : null}
        </div>
      </header>

      <nav className={styles.mobileNav} aria-label="Workspace panels">
        {(["direction", "canvas", "inspector"] as const).map((panel) => (
          <button
            aria-pressed={mobilePanel === panel}
            key={panel}
            onClick={() => setMobilePanel(panel)}
            type="button"
          >
            {panel === "direction" ? "Direction" : panel === "canvas" ? "Canvas" : "Inspector"}
          </button>
        ))}
      </nav>

      <div className={styles.workspaceGrid}>
        <div className={mobilePanel === "direction" ? styles.mobileActive : ""}>
          <ArtDirectionPanel
            brief={brief}
            buildingSpec={buildingSpec}
            currentStyleSpec={currentStyleSpec}
            directionDirty={directionDirty}
            generating={generating}
            mutationsBlocked={restoringHistory}
            onBriefChange={changeBrief}
            onBuildSpec={() => void buildStyleSpec()}
            onGenerate={generate}
            onSaveDraft={() => void saveDirectionDraft()}
            onToggleReference={toggleReference}
            onUploadReference={uploadReference}
            selectedReferenceIds={selectedReferenceIds}
            workspace={workspace}
          />
        </div>

        <section
          aria-label="Editable canvas"
          className={`${styles.canvasPanel} ${
            mobilePanel === "canvas" ? styles.mobileActive : ""
          }`}
        >
          <div className={styles.canvasToolbar}>
            <div className={styles.toolbarGroup}>
              <button
                aria-label="Undo"
                disabled={restoringHistory || !canUndoHistory(history)}
                onClick={undo}
                title="Undo (⌘Z)"
                type="button"
              >
                <Icon name="undo" />
              </button>
              <button
                aria-label="Redo"
                disabled={restoringHistory || !canRedoHistory(history)}
                onClick={redo}
                title="Redo (⇧⌘Z)"
                type="button"
              >
                <Icon name="redo" />
              </button>
              <span />
              <input
                accept="image/png,image/jpeg,image/webp"
                className={styles.hiddenInput}
                onChange={uploadAsset}
                ref={uploadInput}
                tabIndex={-1}
                type="file"
              />
              <button
                disabled={uploading || restoringHistory}
                onClick={() => uploadInput.current?.click()}
                title="Import a PNG, JPEG, or WebP"
                type="button"
              >
                <Icon name="image" />
                <em>{uploading ? "Importing…" : "Import"}</em>
              </button>
            </div>
            <div className={styles.canvasTitle}>
              <strong>Canvas</strong>
              <span>{workspace.width} × {workspace.height}</span>
            </div>
            <div className={styles.toolbarGroup}>
              <button
                aria-label="Zoom out"
                disabled={zoom <= ZOOM_MIN}
                onClick={() =>
                  setZoom((current) =>
                    Math.max(ZOOM_MIN, Math.round((current - ZOOM_STEP) * 100) / 100))}
                type="button"
              >
                <Icon name="minus" />
              </button>
              <button className={styles.zoomValue} onClick={fitCanvas} type="button">
                {Math.round(zoom * 100)}%
              </button>
              <button
                aria-label="Zoom in"
                disabled={zoom >= ZOOM_MAX}
                onClick={() =>
                  setZoom((current) =>
                    Math.min(ZOOM_MAX, Math.round((current + ZOOM_STEP) * 100) / 100))}
                type="button"
              >
                <Icon name="plus" />
              </button>
              <button aria-label="Fit canvas" onClick={fitCanvas} title="Fit canvas" type="button">
                <Icon name="fit" />
              </button>
              <span />
              <div className={styles.exportMenu}>
                <button
                  aria-expanded={exportOpen}
                  className={styles.exportButton}
                  disabled={restoringHistory}
                  onClick={() => setExportOpen((current) => !current)}
                  type="button"
                >
                  <Icon name="export" />
                  <em>Export</em>
                </button>
                {exportOpen ? (
                  <div>
                    <button onClick={() => void exportComposedPng()} type="button">
                      <strong>Composed PNG</strong>
                      <span>Rendered canvas</span>
                    </button>
                    <button onClick={() => exportJson("WORKSPACE_JSON")} type="button">
                      <strong>Workspace JSON</strong>
                      <span>Editable scene</span>
                    </button>
                    <button onClick={() => exportJson("ASSET_METADATA_JSON")} type="button">
                      <strong>Asset metadata</strong>
                      <span>Geometry and properties</span>
                    </button>
                    <button
                      disabled={
                        !currentStyleSpec || directionDirty || restoringHistory
                      }
                      onClick={() => exportJson("STYLE_SPEC_JSON")}
                      type="button"
                    >
                      <strong>Current StyleSpec</strong>
                      <span>Approved art direction</span>
                    </button>
                    <button onClick={() => exportJson("REFERENCE_METADATA_JSON")} type="button">
                      <strong>Reference metadata</strong>
                      <span>Source provenance</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className={styles.canvasScroller} ref={canvasScroller}>
            <div
              className={styles.canvasStage}
              style={{
                height: workspace.height * zoom,
                width: workspace.width * zoom,
              }}
            >
              <div
                className={styles.canvas}
                onPointerCancel={endInteraction}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) setSelectedId(null);
                }}
                onPointerMove={moveInteraction}
                onPointerUp={endInteraction}
                style={{
                  "--guide-shadow": `${0.5 / zoom}px`,
                  "--guide-size": `${1 / zoom}px`,
                  "--handle-border": `${2 / zoom}px`,
                  "--handle-offset": `${-7 / zoom}px`,
                  "--handle-radius": `${2 / zoom}px`,
                  "--handle-size": `${11 / zoom}px`,
                  "--selection-border": `${2 / zoom}px`,
                  "--selection-offset": `${-3 / zoom}px`,
                  "--selection-ring": `${1 / zoom}px`,
                  "--selection-shadow": `${18 / zoom}px`,
                  height: workspace.height,
                  transform: `scale(${zoom})`,
                  width: workspace.width,
                } as CSSProperties}
              >
                {workspace.nodes
                  .filter((node) => node.visible)
                  .map((node) => (
                    <CanvasNode
                      key={node.id}
                      node={node}
                      onSelect={() => setSelectedId(node.id)}
                      onPointerDown={(event, item) =>
                        startInteraction(event, item, "drag")}
                      onResizePointerDown={(event, item, handle) =>
                        startInteraction(event, item, "resize", handle)}
                      selected={node.id === selectedId}
                    />
                  ))}
                {snapGuides.map((guide) => (
                  <i
                    className={
                      guide.axis === "x" ? styles.verticalGuide : styles.horizontalGuide
                    }
                    key={`${guide.axis}-${guide.position}`}
                    style={
                      guide.axis === "x"
                        ? { left: guide.position }
                        : { top: guide.position }
                    }
                  />
                ))}
                {workspace.nodes.length === 0 ? (
                  <div className={styles.emptyCanvas}>
                    <span><Icon name="image" size={22} /></span>
                    <strong>Build the first asset</strong>
                    <p>Import an image or generate from an approved StyleSpec.</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <div className={mobilePanel === "inspector" ? styles.mobileActive : ""}>
          <InspectorPanel
            node={selectedNode}
            mutationsBlocked={restoringHistory}
            onCommitPatch={commitSelectedPatch}
            onCrop={() => {
              if (selectedNode) {
                setCrop(EMPTY_CROP);
                setCropNodeId(selectedNode.id);
              }
            }}
            onDelete={() => void deleteSelected()}
            onDuplicate={() => void duplicateSelected()}
            onImmediatePatch={immediateSelectedPatch}
            onLayerAction={changeLayer}
            onLocalPatch={(patch) => {
              if (selectedId) updateLocalNode(selectedId, patch);
            }}
            onRemoveBackground={() => void removeBackground()}
            onReplace={replaceImage}
            onSelect={selectNode}
            processingAsset={processingAsset}
            workspace={workspace}
          />
        </div>
      </div>

      {cropNode ? (
        <CropDialog
          crop={crop}
          node={cropNode}
          onApply={() => void applyCrop()}
          onCancel={() => setCropNodeId(null)}
          onChange={setCrop}
          processing={processingAsset || restoringHistory}
        />
      ) : null}

      {actionError ? (
        <div className={styles.globalError} role="alert">
          {actionError}
          <button
            aria-label="Dismiss error"
            onClick={() => setActionError(null)}
            type="button"
          >
            ×
          </button>
        </div>
      ) : null}
    </main>
  );
}
