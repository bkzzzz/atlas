"use client";

import {
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  WorkspaceLayerAction,
  WorkspaceMessage,
  WorkspaceNode,
  WorkspaceNodePatch,
  WorkspacePayload,
} from "@/lib/workspace-core";
import styles from "./workspace.module.css";

type SaveState = "idle" | "saving" | "saved" | "error";
type MobilePanel = "ai" | "canvas" | "inspector";
type Geometry = Pick<WorkspaceNode, "x" | "y" | "width" | "height">;
type Interaction = {
  nodeId: string;
  mode: "drag" | "resize";
  handle?: "nw" | "ne" | "sw" | "se";
  pointerId: number;
  startPointer: { x: number; y: number };
  start: Geometry;
  current: Geometry;
};

const assetTypes = [
  ["CHARACTER", "Character"],
  ["ITEM", "Item"],
  ["ICON", "Icon"],
  ["ENVIRONMENT", "Environment"],
] as const;
const visualStyles = [
  ["PIXEL_ART", "Pixel art"],
  ["FANTASY_2D", "2D fantasy"],
  ["STORYBOOK", "Storybook"],
] as const;
const viewAngles = [
  ["FRONT", "Front"],
  ["SIDE", "Side"],
  ["ISOMETRIC", "Isometric"],
  ["TOP_DOWN", "Top-down"],
] as const;

function Icon({
  name,
  size = 16,
}: {
  name:
    | "arrow-down"
    | "arrow-up"
    | "back"
    | "forward"
    | "image"
    | "layers"
    | "plus"
    | "send"
    | "spark"
    | "trash";
  size?: number;
}) {
  const paths = {
    "arrow-down": <path d="m5 9 7 7 7-7M12 16V3" />,
    "arrow-up": <path d="m5 15 7-7 7 7M12 8v13" />,
    back: <path d="M5 5h14v14H5zM9 1h14v14h-4" />,
    forward: <path d="M9 9h14v14H9zM5 5h14v4M5 5v14h4" />,
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="m3 16 5-4 4 3 3-2 6 5" />
      </>
    ),
    layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 18l9 5 9-5" />,
    plus: <path d="M12 5v14M5 12h14" />,
    send: <path d="m22 2-7 20-4-9-9-4 20-7Zm-11 11L22 2" />,
    spark: <path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2Zm7 13 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />,
    trash: <path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6" />,
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

function imageDimensions(file: File): Promise<{ width: number; height: number }> {
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

function localGeometry(
  interaction: Interaction,
  pointer: { x: number; y: number },
  workspace: WorkspacePayload,
) {
  const dx = pointer.x - interaction.startPointer.x;
  const dy = pointer.y - interaction.startPointer.y;
  const start = interaction.start;
  if (interaction.mode === "drag") {
    return {
      ...start,
      x: Math.min(Math.max(0, start.x + dx), workspace.width - start.width),
      y: Math.min(Math.max(0, start.y + dy), workspace.height - start.height),
    };
  }

  const handle = interaction.handle ?? "se";
  const fromLeft = handle.endsWith("w");
  const fromTop = handle.startsWith("n");
  const width = Math.min(
    workspace.width,
    Math.max(24, start.width + (fromLeft ? -dx : dx)),
  );
  const height = Math.min(
    workspace.height,
    Math.max(24, start.height + (fromTop ? -dy : dy)),
  );
  const x = fromLeft
    ? Math.max(0, Math.min(start.x + start.width - width, workspace.width - width))
    : Math.min(start.x, workspace.width - width);
  const y = fromTop
    ? Math.max(0, Math.min(start.y + start.height - height, workspace.height - height))
    : Math.min(start.y, workspace.height - height);
  return { x, y, width, height };
}

function InspectorField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className={styles.inspectorField} data-wide={label.length > 1}>
      <span>{label}</span>
      <span className={styles.numberBox}>
        <input
          aria-label={label}
          max={max}
          min={min}
          onBlur={onCommit}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          step={step}
          type="number"
          value={Math.round(value * 100) / 100}
        />
        {suffix ? <span>{suffix}</span> : null}
      </span>
    </label>
  );
}

function AiPanel({
  messages,
  generating,
  error,
  onGenerate,
  onSelectNode,
}: {
  messages: WorkspaceMessage[];
  generating: boolean;
  error: string | null;
  onGenerate: (form: FormData) => Promise<void>;
  onSelectNode: (id: string) => void;
}) {
  const [reference, setReference] = useState<File | null>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const referenceUrlRef = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (referenceUrlRef.current) URL.revokeObjectURL(referenceUrlRef.current);
    };
  }, []);

  function chooseReference(file: File | null) {
    if (referenceUrlRef.current) URL.revokeObjectURL(referenceUrlRef.current);
    const url = file ? URL.createObjectURL(file) : null;
    referenceUrlRef.current = url;
    setReference(file);
    setReferenceUrl(url);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (reference) form.set("referenceImage", reference);
    await onGenerate(form);
  }

  return (
    <aside className={`${styles.panel} ${styles.aiPanel}`} aria-label="AI asset panel">
      <div className={styles.panelHeader}>
        <span className={styles.panelIcon}><Icon name="spark" /></span>
        <div>
          <h2>AI</h2>
          <p>Generate into this canvas</p>
        </div>
      </div>

      <div className={styles.conversation} aria-live="polite">
        {messages.length === 0 ? (
          <div className={styles.emptyConversation}>
            <span><Icon name="spark" size={18} /></span>
            <p>No generations yet.</p>
            <small>Your completed assets will appear here and on the canvas.</small>
          </div>
        ) : (
          messages.map((message) => (
            <div
              className={`${styles.message} ${
                message.role === "USER" ? styles.userMessage : styles.assistantMessage
              }`}
              key={message.id}
            >
              <span>{message.role === "USER" ? "You" : "Atlas"}</span>
              <p>{message.content}</p>
              {message.role === "ASSISTANT" && message.nodeId ? (
                <button type="button" onClick={() => onSelectNode(message.nodeId!)}>
                  Select on canvas
                </button>
              ) : null}
            </div>
          ))
        )}
        {generating ? (
          <div className={`${styles.message} ${styles.assistantMessage}`}>
            <span>Atlas</span>
            <p className={styles.generatingText}>
              <i />
              Generating and saving asset…
            </p>
          </div>
        ) : null}
      </div>

      <form className={styles.aiComposer} onSubmit={submit}>
        <div className={styles.compactFields}>
          <label>
            <span>Asset</span>
            <select defaultValue="CHARACTER" name="assetType">
              {assetTypes.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Style</span>
            <select defaultValue="PIXEL_ART" name="visualStyle">
              {visualStyles.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>View</span>
            <select defaultValue="FRONT" name="viewAngle">
              {viewAngles.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <input
          accept="image/png,image/jpeg,image/webp"
          className={styles.hiddenInput}
          onChange={(event) => chooseReference(event.target.files?.[0] ?? null)}
          ref={fileInput}
          tabIndex={-1}
          type="file"
        />
        {reference && referenceUrl ? (
          <div className={styles.referenceCard}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={referenceUrl} />
            <span title={reference.name}>{reference.name}</span>
            <button
              aria-label="Remove reference image"
              onClick={() => {
                chooseReference(null);
                if (fileInput.current) fileInput.current.value = "";
              }}
              type="button"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            className={styles.referenceButton}
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            <Icon name="image" />
            Add reference
            <span>optional</span>
          </button>
        )}

        <label className={styles.promptField}>
          <span className={styles.srOnly}>Optional prompt</span>
          <textarea
            maxLength={280}
            name="prompt"
            placeholder="Describe a change or an asset…"
            rows={3}
          />
        </label>
        {error ? <p className={styles.formError} role="alert">{error}</p> : null}
        <button className={styles.generateButton} disabled={generating} type="submit">
          <Icon name="send" />
          {generating ? "Generating…" : "Generate to canvas"}
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
    handle: Interaction["handle"],
  ) => void;
}) {
  return (
    <div
      className={`${styles.canvasNode} ${selected ? styles.selectedNode : ""}`}
      data-node-id={node.id}
      id={`canvas-node-${node.id}`}
      aria-label={node.name}
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
        transform: `rotate(${node.rotation}deg)`,
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
              style={{ backgroundColor: node.color }}
            />
          ) : null}
        </>
      ) : (
        <span className={styles.rectangleFill} style={{ backgroundColor: node.color }} />
      )}
      {selected
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
    </div>
  );
}

function InspectorPanel({
  node,
  nodes,
  workspace,
  onLocalUpdate,
  onCommit,
  onLayerAction,
  onDelete,
  onSelectNode,
}: {
  node: WorkspaceNode | null;
  nodes: WorkspaceNode[];
  workspace: WorkspacePayload;
  onLocalUpdate: (patch: Partial<WorkspaceNode>) => void;
  onCommit: (patch: WorkspaceNodePatch) => void;
  onLayerAction: (action: WorkspaceLayerAction) => void;
  onDelete: () => void;
  onSelectNode: (id: string) => void;
}) {
  const selectedIndex = node
    ? [...nodes].sort((a, b) => a.zIndex - b.zIndex).findIndex((item) => item.id === node.id)
    : -1;
  const commit = (property: keyof WorkspaceNodePatch) => {
    if (node) onCommit({ [property]: node[property as keyof WorkspaceNode] });
  };

  return (
    <aside className={`${styles.panel} ${styles.inspectorPanel}`} aria-label="Inspector">
      <div className={styles.panelHeader}>
        <span className={styles.panelIcon}><Icon name="layers" /></span>
        <div>
          <h2>Inspector</h2>
          <p>{node ? node.name : "Nothing selected"}</p>
        </div>
      </div>

      {node ? (
        <div className={styles.inspectorContent}>
          <section className={styles.inspectorSection}>
            <h3>Transform</h3>
            <div className={styles.fieldGrid}>
              <InspectorField
                label="X"
                max={workspace.width - node.width}
                min={0}
                onChange={(x) => onLocalUpdate({ x })}
                onCommit={() => commit("x")}
                value={node.x}
              />
              <InspectorField
                label="Y"
                max={workspace.height - node.height}
                min={0}
                onChange={(y) => onLocalUpdate({ y })}
                onCommit={() => commit("y")}
                value={node.y}
              />
              <InspectorField
                label="W"
                max={workspace.width}
                min={24}
                onChange={(width) => onLocalUpdate({ width })}
                onCommit={() => commit("width")}
                value={node.width}
              />
              <InspectorField
                label="H"
                max={workspace.height}
                min={24}
                onChange={(height) => onLocalUpdate({ height })}
                onCommit={() => commit("height")}
                value={node.height}
              />
            </div>
            <InspectorField
              label="Rotation"
              max={180}
              min={-180}
              onChange={(rotation) => onLocalUpdate({ rotation })}
              onCommit={() => commit("rotation")}
              suffix="°"
              value={node.rotation}
            />
          </section>

          <section className={styles.inspectorSection}>
            <h3>Appearance</h3>
            <label className={styles.colorField}>
              <span>{node.kind === "IMAGE" ? "Tint" : "Color"}</span>
              <span>
                <input
                  aria-label={node.kind === "IMAGE" ? "Image tint" : "Fill color"}
                  onChange={(event) => {
                    const color = event.target.value;
                    onLocalUpdate({ color });
                    onCommit({ color });
                  }}
                  type="color"
                  value={node.color}
                />
                <code>{node.color.toUpperCase()}</code>
              </span>
            </label>
            <label className={styles.opacityField}>
              <span>Opacity</span>
              <output>{Math.round(node.opacity * 100)}%</output>
              <input
                aria-label="Opacity"
                max="1"
                min="0"
                onBlur={() => commit("opacity")}
                onChange={(event) => onLocalUpdate({ opacity: Number(event.target.value) })}
                onPointerUp={() => commit("opacity")}
                step="0.01"
                type="range"
                value={node.opacity}
              />
            </label>
          </section>

          <section className={styles.inspectorSection}>
            <div className={styles.sectionHeading}>
              <h3>Layer</h3>
              <span>{selectedIndex + 1} of {nodes.length}</span>
            </div>
            <div className={styles.layerActions}>
              <button
                aria-label="Send to back"
                disabled={selectedIndex <= 0}
                onClick={() => onLayerAction("SEND_TO_BACK")}
                title="Send to back"
                type="button"
              >
                <Icon name="back" />
              </button>
              <button
                aria-label="Send backward"
                disabled={selectedIndex <= 0}
                onClick={() => onLayerAction("SEND_BACKWARD")}
                title="Send backward"
                type="button"
              >
                <Icon name="arrow-down" />
              </button>
              <button
                aria-label="Bring forward"
                disabled={selectedIndex === nodes.length - 1}
                onClick={() => onLayerAction("BRING_FORWARD")}
                title="Bring forward"
                type="button"
              >
                <Icon name="arrow-up" />
              </button>
              <button
                aria-label="Bring to front"
                disabled={selectedIndex === nodes.length - 1}
                onClick={() => onLayerAction("BRING_TO_FRONT")}
                title="Bring to front"
                type="button"
              >
                <Icon name="forward" />
              </button>
            </div>
          </section>

          <button className={styles.deleteButton} onClick={onDelete} type="button">
            <Icon name="trash" />
            Delete layer
          </button>
        </div>
      ) : (
        <div className={styles.emptyInspector}>
          <div className={styles.selectionGlyph}><span /><span /><span /><span /></div>
          <p>Select an asset on the canvas to edit its properties.</p>
        </div>
      )}

      <section className={styles.layersList}>
        <div className={styles.sectionHeading}>
          <h3>Canvas layers</h3>
          <span>{nodes.length}</span>
        </div>
        <div>
          {[...nodes]
            .sort((a, b) => b.zIndex - a.zIndex)
            .map((item) => (
              <button
                aria-pressed={item.id === node?.id}
                className={item.id === node?.id ? styles.activeLayer : ""}
                key={item.id}
                onClick={() => onSelectNode(item.id)}
                type="button"
              >
                <i
                  className={item.kind === "IMAGE" ? styles.imageLayerIcon : ""}
                  style={item.kind === "RECTANGLE" ? { backgroundColor: item.color } : undefined}
                >
                  {item.kind === "IMAGE" ? <Icon name="image" size={13} /> : null}
                </i>
                <span>{item.name}</span>
              </button>
            ))}
          {nodes.length === 0 ? <p>No layers yet.</p> : null}
        </div>
      </section>
    </aside>
  );
}

export function Workspace({
  initialWorkspace,
}: {
  initialWorkspace: WorkspacePayload;
}) {
  const [workspace, setWorkspace] = useState<WorkspacePayload>(initialWorkspace);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("canvas");
  const uploadInput = useRef<HTMLInputElement>(null);
  const interaction = useRef<Interaction | null>(null);
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());
  const nodeRevisions = useRef(new Map<string, number>());
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadWorkspace = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(getErrorMessage(data, "The workspace could not be opened."));
      setWorkspace(data as WorkspacePayload);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The workspace could not be opened.");
    }
  }, []);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const selectNode = useCallback((id: string) => {
    setSelectedId(id);
    setMobilePanel("canvas");
    requestAnimationFrame(() => {
      document.getElementById(`canvas-node-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    });
  }, []);

  function updateLocalNode(id: string, patch: Partial<WorkspaceNode>) {
    nodeRevisions.current.set(id, (nodeRevisions.current.get(id) ?? 0) + 1);
    setWorkspace((current) =>
      ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === id ? { ...node, ...patch } : node,
        ),
      }),
    );
  }

  async function performNodeUpdate(
    id: string,
    patch: WorkspaceNodePatch,
    expectedRevision: number,
  ) {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setSaveState("saving");
    setActionError(null);
    try {
      const response = await fetch(`/api/workspace/nodes/${encodeURIComponent(id)}`, {
        body: JSON.stringify(patch),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(getErrorMessage(data, "The layer could not be saved."));
      const { node } = data as { node: WorkspaceNode };
      if ((nodeRevisions.current.get(id) ?? 0) === expectedRevision) {
        setWorkspace((current) => ({
          ...current,
          nodes: current.nodes.map((item) => (item.id === id ? node : item)),
        }));
      }
      setSaveState("saved");
      savedTimer.current = setTimeout(() => setSaveState("idle"), 1600);
      return node;
    } catch (cause) {
      setSaveState("error");
      setActionError(cause instanceof Error ? cause.message : "The layer could not be saved.");
      await loadWorkspace();
      return null;
    }
  }

  function persistNode(id: string, patch: WorkspaceNodePatch) {
    const expectedRevision = nodeRevisions.current.get(id) ?? 0;
    const update = mutationQueue.current.then(() =>
      performNodeUpdate(id, patch, expectedRevision),
    );
    mutationQueue.current = update.then(
      () => undefined,
      () => undefined,
    );
    return update;
  }

  function pointerPosition(event: { clientX: number; clientY: number }) {
    return { x: event.clientX, y: event.clientY };
  }

  function startInteraction(
    event: ReactPointerEvent<HTMLElement>,
    node: WorkspaceNode,
    mode: Interaction["mode"],
    handle?: Interaction["handle"],
  ) {
    if (!workspace || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(node.id);
    interaction.current = {
      nodeId: node.id,
      mode,
      handle,
      pointerId: event.pointerId,
      startPointer: pointerPosition(event),
      start: { x: node.x, y: node.y, width: node.width, height: node.height },
      current: { x: node.x, y: node.y, width: node.width, height: node.height },
    };
  }

  function moveInteraction(event: ReactPointerEvent<HTMLElement>) {
    const active = interaction.current;
    if (!workspace || !active || event.pointerId !== active.pointerId) return;
    const next = localGeometry(active, pointerPosition(event), workspace);
    active.current = next;
    updateLocalNode(active.nodeId, next);
  }

  function endInteraction(event: ReactPointerEvent<HTMLElement>) {
    const active = interaction.current;
    if (!active || event.pointerId !== active.pointerId) return;
    interaction.current = null;
    void persistNode(active.nodeId, active.current);
  }

  async function insertRectangle() {
    setActionError(null);
    try {
      const response = await fetch("/api/workspace", {
        body: JSON.stringify({ action: "CREATE_RECTANGLE" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(getErrorMessage(data, "The rectangle could not be added."));
      const { node } = data as { node: WorkspaceNode };
      setWorkspace((current) =>
        ({ ...current, nodes: [...current.nodes, node] }),
      );
      setSelectedId(node.id);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The rectangle could not be added.");
    }
  }

  async function uploadAsset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setActionError(null);
    try {
      const dimensions = await imageDimensions(file);
      const form = new FormData();
      form.set("file", file);
      form.set("width", String(dimensions.width));
      form.set("height", String(dimensions.height));
      const response = await fetch("/api/workspace/assets", { body: form, method: "POST" });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(getErrorMessage(data, "The asset could not be imported."));
      const { node } = data as { node: WorkspaceNode };
      setWorkspace((current) =>
        ({ ...current, nodes: [...current.nodes, node] }),
      );
      setSelectedId(node.id);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The asset could not be imported.");
    } finally {
      setUploading(false);
    }
  }

  async function generate(form: FormData) {
    setGenerating(true);
    setGenerationError(null);
    try {
      const response = await fetch("/api/workspace/generate", { body: form, method: "POST" });
      const data = await responseJson(response);
      if (!response.ok) throw new Error(getErrorMessage(data, "The asset could not be generated."));
      const result = data as { node: WorkspaceNode; messages: WorkspaceMessage[] };
      setWorkspace((current) =>
        ({
          ...current,
          nodes: [...current.nodes, result.node],
          messages: [...current.messages, ...result.messages],
        }),
      );
      setSelectedId(result.node.id);
      setMobilePanel("canvas");
    } catch (cause) {
      setGenerationError(cause instanceof Error ? cause.message : "The asset could not be generated.");
    } finally {
      setGenerating(false);
    }
  }

  async function changeLayer(action: WorkspaceLayerAction) {
    if (!selectedId) return;
    const orderedIds = [...workspace.nodes]
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((node) => node.id);
    const currentIndex = orderedIds.indexOf(selectedId);
    if (currentIndex === -1) return;
    const nextIds = orderedIds.filter((id) => id !== selectedId);
    if (action === "SEND_TO_BACK") {
      nextIds.unshift(selectedId);
    } else if (action === "BRING_TO_FRONT") {
      nextIds.push(selectedId);
    } else if (action === "SEND_BACKWARD") {
      nextIds.splice(Math.max(0, currentIndex - 1), 0, selectedId);
    } else {
      nextIds.splice(Math.min(nextIds.length, currentIndex + 1), 0, selectedId);
    }
    const zIndexes = new Map(nextIds.map((id, index) => [id, index]));
    for (const id of nextIds) {
      nodeRevisions.current.set(id, (nodeRevisions.current.get(id) ?? 0) + 1);
    }
    setWorkspace((current) => ({
      ...current,
      nodes: current.nodes.map((node) => ({
        ...node,
        zIndex: zIndexes.get(node.id) ?? node.zIndex,
      })),
    }));
    await persistNode(selectedId, { layerAction: action });
  }

  async function deleteSelected() {
    if (!selectedId) return;
    await mutationQueue.current;
    setActionError(null);
    try {
      const response = await fetch(
        `/api/workspace/nodes/${encodeURIComponent(selectedId)}`,
        { method: "DELETE" },
      );
      const data = response.status === 204 ? null : await responseJson(response);
      if (!response.ok) throw new Error(getErrorMessage(data, "The layer could not be deleted."));
      setWorkspace((current) =>
        ({
          ...current,
          nodes: current.nodes.filter((node) => node.id !== selectedId),
        }),
      );
      setSelectedId(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The layer could not be deleted.");
    }
  }

  const selectedNode = workspace.nodes.find((node) => node.id === selectedId) ?? null;
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
          {saveState === "saving" ? <><i className={styles.savingDot} />Saving…</> : null}
          {saveState === "saved" ? <><i className={styles.savedDot} />Saved</> : null}
          {saveState === "error" ? <><i className={styles.errorDot} />Save failed</> : null}
          {saveState === "idle" ? <>{workspace.nodes.length} layers</> : null}
        </div>
      </header>

      <nav className={styles.mobileNav} aria-label="Workspace panels">
        {(["ai", "canvas", "inspector"] as const).map((panel) => (
          <button
            aria-pressed={mobilePanel === panel}
            key={panel}
            onClick={() => setMobilePanel(panel)}
            type="button"
          >
            {panel === "ai" ? "AI" : panel === "canvas" ? "Canvas" : "Inspector"}
          </button>
        ))}
      </nav>

      <div className={styles.workspaceGrid}>
        <div className={mobilePanel === "ai" ? styles.mobileActive : ""}>
          <AiPanel
            error={generationError}
            generating={generating}
            messages={workspace.messages}
            onGenerate={generate}
            onSelectNode={selectNode}
          />
        </div>

        <section
          className={`${styles.canvasPanel} ${
            mobilePanel === "canvas" ? styles.mobileActive : ""
          }`}
          aria-label="Editable canvas"
        >
          <div className={styles.canvasToolbar}>
            <div>
              <strong>Canvas</strong>
              <span>{workspace.width} × {workspace.height}</span>
            </div>
            <div className={styles.canvasActions}>
              <input
                accept="image/png,image/jpeg,image/webp"
                className={styles.hiddenInput}
                onChange={uploadAsset}
                ref={uploadInput}
                tabIndex={-1}
                type="file"
              />
              <button
                disabled={uploading}
                onClick={() => uploadInput.current?.click()}
                type="button"
              >
                <Icon name="image" />
                {uploading ? "Importing…" : "Import image"}
              </button>
              <button onClick={() => void insertRectangle()} type="button">
                <Icon name="plus" />
                Rectangle
              </button>
            </div>
          </div>
          <div className={styles.canvasScroller}>
            <div
              className={styles.canvas}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) setSelectedId(null);
              }}
              onPointerMove={moveInteraction}
              onPointerUp={endInteraction}
              onPointerCancel={endInteraction}
              style={{ height: workspace.height, width: workspace.width }}
            >
              {workspace.nodes.map((node) => (
                <CanvasNode
                  key={node.id}
                  node={node}
                  onSelect={() => setSelectedId(node.id)}
                  onPointerDown={(event, item) => startInteraction(event, item, "drag")}
                  onResizePointerDown={(event, item, handle) =>
                    startInteraction(event, item, "resize", handle)
                  }
                  selected={node.id === selectedId}
                />
              ))}
              {workspace.nodes.length === 0 ? (
                <div className={styles.emptyCanvas}>
                  <span><Icon name="image" size={22} /></span>
                  <strong>Start with a real asset</strong>
                  <p>Import an image, add a rectangle, or generate from the AI panel.</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div className={mobilePanel === "inspector" ? styles.mobileActive : ""}>
          <InspectorPanel
            node={selectedNode}
            nodes={workspace.nodes}
            onCommit={(patch) => {
              if (selectedId) void persistNode(selectedId, patch);
            }}
            onDelete={() => void deleteSelected()}
            onLayerAction={(action) => void changeLayer(action)}
            onLocalUpdate={(patch) => {
              if (selectedId) updateLocalNode(selectedId, patch);
            }}
            onSelectNode={selectNode}
            workspace={workspace}
          />
        </div>
      </div>
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
