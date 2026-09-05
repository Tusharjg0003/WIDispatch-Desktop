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
  diagnostics: TabSessionDiagnostics = {}
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
    tabs.push(parsed.data as TabInstance<TState>);
  });

  if (!tabs.length) return null;

  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const listed = session.data.order.filter((id) => byId.has(id));
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
