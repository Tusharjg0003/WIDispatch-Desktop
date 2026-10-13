import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryCanvasRepository, scopeRepositoryToWorkspace } from "./CanvasRepository.ts";
import { createWorkspaceInstance } from "../../workspace/types/workspace.types.ts";
import { SNAPSHOT_VERSION } from "./canvasSnapshot.types.ts";

const record = (name: string) => {
  const workspace = createWorkspaceInstance({ name });
  return {
    workspaceId: workspace.id,
    workspace,
    snapshot: { version: SNAPSHOT_VERSION, elements: [], viewport: null },
    updatedAt: Date.now(),
  };
};

test("a tab window's repository sees and writes only its own workspace", async () => {
  const inner = new InMemoryCanvasRepository();
  const mine = record("Mine");
  const other = record("Other");
  await inner.saveWorkspace(mine);
  await inner.saveWorkspace(other);
  await inner.saveSession(other.workspaceId, [mine.workspaceId, other.workspaceId]);

  const scoped = scopeRepositoryToWorkspace(inner, mine.workspaceId);
  const seen = await scoped.loadAll();
  assert.deepEqual(seen.workspaces.map((w) => w.id), [mine.workspaceId]);
  assert.deepEqual(seen.order, [mine.workspaceId]);
  assert.equal(seen.activeWorkspaceId, mine.workspaceId);

  // Its own record is written through; anything else, and the main window's
  // session, are left alone.
  await scoped.saveWorkspace({ ...mine, workspace: { ...mine.workspace, dirty: true } });
  await scoped.saveWorkspace({ ...other, workspace: { ...other.workspace, dirty: true } });
  await scoped.saveSession(null, []);
  await scoped.deleteWorkspace(other.workspaceId);

  const all = await inner.loadAll();
  assert.equal(all.workspaces.find((w) => w.id === mine.workspaceId)?.dirty, true);
  assert.equal(all.workspaces.find((w) => w.id === other.workspaceId)?.dirty, false);
  assert.deepEqual(all.order, [mine.workspaceId, other.workspaceId]);
  assert.equal(all.activeWorkspaceId, other.workspaceId);
});
