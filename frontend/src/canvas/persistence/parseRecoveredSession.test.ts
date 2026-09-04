import test from "node:test";
import assert from "node:assert/strict";

import { parseRecoveredSession } from "./parseRecoveredSession.ts";
import { createWorkspaceInstance } from "../../workspace/types/workspace.types.ts";
import type { WorkspaceInstance } from "../../workspace/types/workspace.types.ts";

const snapshot = (ids: string[] = []) => ({
  version: 1,
  elements: ids.map((id) => ({ group: "nodes", data: { id } })),
  viewport: { zoom: 1, pan: { x: 0, y: 0 } },
});

const record = (workspace: WorkspaceInstance, ids: string[] = []) => ({
  workspaceId: workspace.id,
  workspace,
  snapshot: snapshot(ids),
  updatedAt: workspace.updatedAt,
});

const session = (activeWorkspaceId: string | null, order: string[]) => ({
  key: "current",
  activeWorkspaceId,
  order,
});

test("restores instances, order and active workspace from valid records", () => {
  const a = createWorkspaceInstance({ name: "A" });
  const b = createWorkspaceInstance({ name: "B" });

  const result = parseRecoveredSession(
    [record(a, ["n1"]), record(b, ["n2"])],
    session(b.id, [b.id, a.id])
  );

  assert.equal(result.workspaces.length, 2);
  assert.deepEqual(result.order, [b.id, a.id]);
  assert.equal(result.activeWorkspaceId, b.id);
  assert.equal(result.droppedRecordCount, 0);
  assert.deepEqual(result.snapshots.get(a.id)?.elements, snapshot(["n1"]).elements);
});

test("drops one corrupt record and still recovers the rest", () => {
  const a = createWorkspaceInstance({ name: "A" });
  const b = createWorkspaceInstance({ name: "B" });
  const corrupt = { workspaceId: "ghost", workspace: { id: "ghost" } };

  const dropped: string[] = [];
  const result = parseRecoveredSession(
    [record(a), corrupt, record(b)],
    session(a.id, [a.id, "ghost", b.id]),
    { onDroppedRecord: (index) => dropped.push(String(index)) }
  );

  assert.equal(result.workspaces.length, 2);
  assert.equal(result.droppedRecordCount, 1);
  assert.deepEqual(dropped, ["1"]);
  // The dropped id must not survive in the order.
  assert.deepEqual(result.order, [a.id, b.id]);
  assert.equal(result.activeWorkspaceId, a.id);
});

test("drops a record whose key disagrees with its payload", () => {
  const a = createWorkspaceInstance({ name: "A" });
  const mismatched = { ...record(a), workspaceId: "different-id" };

  const result = parseRecoveredSession([mismatched], null);

  assert.equal(result.workspaces.length, 0);
  assert.equal(result.droppedRecordCount, 1);
});

test("falls back to derived order when the session row is corrupt", () => {
  const a = createWorkspaceInstance({ name: "A" });
  const b = createWorkspaceInstance({ name: "B" });
  a.createdAt = 100;
  b.createdAt = 200;
  a.updatedAt = 500;
  b.updatedAt = 900;

  let reason: string | null = null;
  const result = parseRecoveredSession(
    [record(b), record(a)],
    { key: "wrong", order: "not-an-array" },
    { onDroppedSession: (r) => { reason = r; } }
  );

  assert.notEqual(reason, null);
  // Derived order is by creation time, not by row order.
  assert.deepEqual(result.order, [a.id, b.id]);
  // Active falls back to the most recently updated survivor.
  assert.equal(result.activeWorkspaceId, b.id);
});

test("ignores a session pointing at a workspace that did not survive", () => {
  const a = createWorkspaceInstance({ name: "A" });
  a.updatedAt = 42;

  const result = parseRecoveredSession([record(a)], session("vanished", ["vanished", a.id]));

  assert.deepEqual(result.order, [a.id]);
  assert.equal(result.activeWorkspaceId, a.id);
});

test("returns an empty session when nothing was stored", () => {
  const result = parseRecoveredSession([], null);

  assert.deepEqual(result.workspaces, []);
  assert.deepEqual(result.order, []);
  assert.equal(result.activeWorkspaceId, null);
  assert.equal(result.droppedRecordCount, 0);
});
