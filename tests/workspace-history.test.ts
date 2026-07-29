import assert from "node:assert/strict";
import test from "node:test";
import {
  canRedoHistory,
  canUndoHistory,
  commitHistory,
  createSnapshotHistory,
  redoHistory,
  undoHistory,
} from "../src/lib/workspace-history";

test("snapshot history commits, undoes, and redoes without mutation", () => {
  const initial = createSnapshotHistory({ nodes: ["a"] });
  const committed = commitHistory(initial, { nodes: ["a", "b"] });
  const undone = undoHistory(committed);
  const redone = redoHistory(undone);

  assert.deepEqual(initial, {
    past: [],
    present: { nodes: ["a"] },
    future: [],
    limit: 100,
  });
  assert.deepEqual(undone.present, { nodes: ["a"] });
  assert.deepEqual(undone.future, [{ nodes: ["a", "b"] }]);
  assert.deepEqual(redone.present, { nodes: ["a", "b"] });
  assert.equal(canUndoHistory(committed), true);
  assert.equal(canRedoHistory(undone), true);
});

test("committing after undo truncates the redo branch", () => {
  let history = createSnapshotHistory("initial");
  history = commitHistory(history, "first edit");
  history = commitHistory(history, "second edit");
  history = undoHistory(history);

  assert.equal(history.present, "first edit");
  assert.deepEqual(history.future, ["second edit"]);

  history = commitHistory(history, "alternate edit");
  assert.equal(history.present, "alternate edit");
  assert.deepEqual(history.future, []);
  assert.equal(canRedoHistory(history), false);
});

test("layer ordering and selection can be restored as one editor snapshot", () => {
  const initial = {
    orderedNodeIds: ["background", "hero", "effects"],
    selectedNodeId: "hero",
  };
  const reordered = {
    orderedNodeIds: ["background", "effects", "hero"],
    selectedNodeId: "hero",
  };
  const history = commitHistory(createSnapshotHistory(initial), reordered);

  assert.deepEqual(undoHistory(history).present, initial);
  assert.deepEqual(redoHistory(undoHistory(history)).present, reordered);
});

test("no-op commits preserve redo and history is capped", () => {
  let history = createSnapshotHistory({ value: 0 }, { limit: 2 });
  history = commitHistory(history, { value: 1 });
  history = commitHistory(history, { value: 2 });
  history = commitHistory(history, { value: 3 });

  assert.deepEqual(
    history.past.map((snapshot) => snapshot.value),
    [1, 2],
  );
  history = undoHistory(history);
  const noOp = commitHistory(history, { value: 2 }, {
    equals: (current, next) => current.value === next.value,
  });
  assert.equal(noOp, history);
  assert.deepEqual(noOp.future, [{ value: 3 }]);
});

test("undo and redo at the ends are stable no-ops", () => {
  const history = createSnapshotHistory("only");
  assert.equal(undoHistory(history), history);
  assert.equal(redoHistory(history), history);
  assert.equal(canUndoHistory(history), false);
  assert.equal(canRedoHistory(history), false);
  assert.throws(
    () => createSnapshotHistory("invalid", { limit: 0 }),
    RangeError,
  );
});
