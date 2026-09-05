// Pure parsing of a stored tab session — no storage, no async.
//
// Degradation is one-way and deliberate: a tab that fails validation is
// dropped, never thrown. One malformed entry from an older schema must not
// stop the remaining tabs from coming back.

import { StoredTabSchema, TabSessionSchema } from "./tabSession.schemas.ts";
import type { TabInstance } from "../types/tab.types.ts";

export interface ParsedTabSession<TState> {
  tabs: TabInstance<TState>[];
  order: string[];
  activeTabId: string | null;
}

export interface TabSessionDiagnostics {
  onDroppedTab?(index: number, reason: string): void;
  onDroppedSession?(reason: string): void;
}

export const parseTabSession = <TState>(
  raw: unknown,
  diagnostics: TabSessionDiagnostics = {},
  // Zod types `state` as `unknown` deliberately — it cannot know a domain's
  // shape — so without this seam a stored `null` (or any garbage) state would
  // sail through as TState and blow up the first time a caller touches a
  // field on it. Supplying this lets a domain validate (or coerce) its own
  // state; omitting it preserves today's behaviour exactly.
  parseState?: (raw: unknown) => TState | null
): ParsedTabSession<TState> | null => {
  const session = TabSessionSchema.safeParse(raw);
  if (!session.success) {
    if (raw != null) diagnostics.onDroppedSession?.(session.error.message);
    return null;
  }

  const tabs: TabInstance<TState>[] = [];
  session.data.tabs.forEach((row, index) => {
    const parsed = StoredTabSchema.safeParse(row);
    if (!parsed.success) {
      diagnostics.onDroppedTab?.(index, parsed.error.message);
      return;
    }
    if (parseState) {
      const state = parseState(parsed.data.state);
      if (state === null) {
        diagnostics.onDroppedTab?.(index, "state failed validation");
        return;
      }
      tabs.push({ ...parsed.data, state } as TabInstance<TState>);
      return;
    }
    tabs.push(parsed.data as TabInstance<TState>);
  });

  // Every tab can fail validation and this still returns null rather than an
  // empty session: the caller (each domain's controller) always re-creates
  // its permanent list tab afterwards, so the list tab is never lost even
  // when the whole stored session is garbage.
  if (!tabs.length) return null;

  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  // De-duplicated: a corrupted stored `order` with a repeated id would
  // otherwise seat the same tab twice, producing duplicate React keys and
  // duplicate useSortable ids, and index-based logic (neighbourAfterClose,
  // reorderTabs) would then resolve to the wrong copy.
  const seen = new Set<string>();
  const listed = session.data.order.filter((id) => {
    if (!byId.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const unlisted = tabs
    .filter((tab) => !listed.includes(tab.id))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((tab) => tab.id);

  // Re-seat the regions rather than trusting stored order: a session written
  // by an older build could place a permanent tab anywhere, and the strip's
  // whole contract is that the permanent tab comes first.
  const order = [...listed, ...unlisted].sort((a, b) => {
    const rank = (id: string): number => {
      const tab = byId.get(id);
      if (tab?.permanent) return 0;
      if (tab?.pinned) return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });

  const stored = session.data.activeTabId;
  const activeTabId = stored && byId.has(stored) ? stored : order[0] ?? null;

  return { tabs, order, activeTabId };
};
