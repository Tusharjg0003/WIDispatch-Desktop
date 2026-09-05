import test from "node:test";
import assert from "node:assert/strict";

import { parseTabSession } from "./parseTabSession.ts";
import { TAB_SESSION_VERSION } from "./tabSession.schemas.ts";

interface DemoState {
  subTab: string;
}

const tab = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  key: `plant-${id}`,
  title: id.toUpperCase(),
  pinned: false,
  permanent: false,
  state: { subTab: "overview" },
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const session = (extra: Record<string, unknown> = {}) => ({
  version: TAB_SESSION_VERSION,
  activeTabId: "a",
  order: ["a", "b"],
  tabs: [tab("a"), tab("b")],
  ...extra,
});

test("parses a valid session", () => {
  const parsed = parseTabSession<DemoState>(session());
  assert.equal(parsed?.tabs.length, 2);
  assert.deepEqual(parsed?.order, ["a", "b"]);
  assert.equal(parsed?.activeTabId, "a");
});

test("returns null for a payload that is not a session", () => {
  assert.equal(parseTabSession<DemoState>(null), null);
  assert.equal(parseTabSession<DemoState>({ nope: true }), null);
});

test("returns null for an unknown version rather than guessing at the shape", () => {
  assert.equal(parseTabSession<DemoState>(session({ version: 99 })), null);
});

test("drops order entries with no surviving tab and appends unlisted tabs", () => {
  const parsed = parseTabSession<DemoState>(
    session({ order: ["ghost", "b"], tabs: [tab("a"), tab("b")] })
  );
  assert.deepEqual(parsed?.order, ["b", "a"]);
});

test("permanent tabs are seated in front however they were stored", () => {
  const parsed = parseTabSession<DemoState>(
    session({
      order: ["a", "list"],
      activeTabId: "a",
      tabs: [tab("a"), tab("list", { permanent: true, key: null })],
    })
  );
  assert.deepEqual(parsed?.order, ["list", "a"]);
});

test("an active id that did not survive falls back to the first tab", () => {
  const parsed = parseTabSession<DemoState>(session({ activeTabId: "ghost" }));
  assert.equal(parsed?.activeTabId, "a");
});

test("a single malformed tab is dropped, not the whole session", () => {
  const diagnostics: string[] = [];
  const parsed = parseTabSession<DemoState>(
    session({ order: ["a", "b"], tabs: [tab("a"), { id: "b" }] }),
    { onDroppedTab: (index) => diagnostics.push(String(index)) }
  );
  assert.deepEqual(parsed?.order, ["a"]);
  assert.deepEqual(diagnostics, ["1"]);
});

test("duplicate ids in the stored order survive only once", () => {
  const parsed = parseTabSession<DemoState>(
    session({ order: ["a", "a", "b"], tabs: [tab("a"), tab("b")] })
  );
  assert.deepEqual(parsed?.order, ["a", "b"]);
});

test("a tab whose state is null is not handed to the caller unvalidated", () => {
  // The Zod schema types `state` as `unknown`, which accepts `null` — without a
  // validator a stored `null` state would reach a domain expecting an object
  // and throw on first property access (e.g. `tab.state.subTab`).
  const parsed = parseTabSession<DemoState>(
    session({ tabs: [tab("a", { state: null }), tab("b")] }),
    {},
    (raw) => (raw && typeof raw === "object" ? (raw as DemoState) : null)
  );
  assert.deepEqual(parsed?.order, ["b"]);
});

test("a supplied validator that returns null drops just that tab", () => {
  const diagnostics: string[] = [];
  const parsed = parseTabSession<DemoState>(
    session({ tabs: [tab("a", { state: { subTab: "bogus" } }), tab("b")] }),
    { onDroppedTab: (index) => diagnostics.push(String(index)) },
    (raw) => {
      const state = raw as DemoState;
      return state?.subTab === "overview" ? state : null;
    }
  );
  assert.deepEqual(parsed?.order, ["b"]);
  assert.deepEqual(diagnostics, ["0"]);
});
