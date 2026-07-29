export const DEFAULT_HISTORY_LIMIT = 100;

export type SnapshotHistory<T> = Readonly<{
  past: readonly T[];
  present: T;
  future: readonly T[];
  limit: number;
}>;

export type SnapshotHistoryOptions = Readonly<{
  limit?: number;
}>;

export type CommitHistoryOptions<T> = Readonly<{
  equals?: (current: T, next: T) => boolean;
}>;

function validHistoryLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("History limit must be a positive integer.");
  }
  return limit;
}

function appendWithinLimit<T>(
  snapshots: readonly T[],
  snapshot: T,
  limit: number,
) {
  const next = [...snapshots, snapshot];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function createSnapshotHistory<T>(
  initialSnapshot: T,
  options: SnapshotHistoryOptions = {},
): SnapshotHistory<T> {
  return {
    past: [],
    present: initialSnapshot,
    future: [],
    limit: validHistoryLimit(options.limit ?? DEFAULT_HISTORY_LIMIT),
  };
}

export function commitHistory<T>(
  history: SnapshotHistory<T>,
  nextSnapshot: T,
  options: CommitHistoryOptions<T> = {},
): SnapshotHistory<T> {
  const equals = options.equals ?? Object.is;
  if (equals(history.present, nextSnapshot)) return history;

  return {
    past: appendWithinLimit(history.past, history.present, history.limit),
    present: nextSnapshot,
    future: [],
    limit: history.limit,
  };
}

export function undoHistory<T>(
  history: SnapshotHistory<T>,
): SnapshotHistory<T> {
  if (history.past.length === 0) return history;
  const previous = history.past[history.past.length - 1];

  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    limit: history.limit,
  };
}

export function redoHistory<T>(
  history: SnapshotHistory<T>,
): SnapshotHistory<T> {
  if (history.future.length === 0) return history;
  const next = history.future[0];

  return {
    past: appendWithinLimit(history.past, history.present, history.limit),
    present: next,
    future: history.future.slice(1),
    limit: history.limit,
  };
}

export function canUndoHistory<T>(history: SnapshotHistory<T>) {
  return history.past.length > 0;
}

export function canRedoHistory<T>(history: SnapshotHistory<T>) {
  return history.future.length > 0;
}
