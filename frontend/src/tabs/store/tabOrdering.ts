// Pure ordering rules for every tab strip in the app.
//
// A strip is three regions in fixed sequence: permanent tabs, then pinned
// tabs, then the rest. Keeping the rules here — with no store, no React and no
// domain types — is what lets the canvas workspaces and the Production tabs
// share behaviour without sharing a data shape.

export interface OrderableTab {
  pinned?: boolean;
  /** Unclosable, and always first. At most one per strip. */
  permanent?: boolean;
}

export type TabLookup = Record<string, OrderableTab | undefined>;

/** Size of the leading permanent region. */
export const permanentCount = (order: string[], tabs: TabLookup): number => {
  let count = 0;
  for (const id of order) {
    if (!tabs[id]?.permanent) break;
    count += 1;
  }
  return count;
};

/**
 * Index where the unpinned region starts — i.e. the count of leading tabs that
 * are permanent or pinned. Toggling a pin re-seats the tab at exactly this
 * index in both directions, because with the tab already spliced out, the end
 * of the pinned block and the start of the unpinned block are the same place.
 */
export const pinnedCount = (order: string[], tabs: TabLookup): number => {
  let count = 0;
  for (const id of order) {
    const tab = tabs[id];
    if (!tab?.permanent && !tab?.pinned) break;
    count += 1;
  }
  return count;
};

/** Inclusive [lower, upper] index range a tab may be dragged within. */
export const regionBounds = (
  order: string[],
  tabs: TabLookup,
  movingId: string
): [number, number] => {
  const tab = tabs[movingId];
  const permanent = permanentCount(order, tabs);
  const fixed = pinnedCount(order, tabs);
  if (tab?.permanent) return [0, Math.max(0, permanent - 1)];
  if (tab?.pinned) return [permanent, Math.max(permanent, fixed - 1)];
  return [fixed, Math.max(fixed, order.length - 1)];
};

/**
 * Target index for a drag, clamped into the mover's own region so no drag can
 * break the region sequence. Returns null when the source index is invalid.
 */
export const clampReorder = (
  order: string[],
  tabs: TabLookup,
  from: number,
  to: number
): number | null => {
  if (from < 0 || from >= order.length) return null;
  const [lower, upper] = regionBounds(order, tabs, order[from]);
  return Math.max(lower, Math.min(to, upper));
};

/** Which tab becomes active when `closingId` closes: right neighbour, else left. */
export const neighbourAfterClose = (
  order: string[],
  closingId: string
): string | null => {
  const index = order.indexOf(closingId);
  if (index === -1) return null;
  const remaining = order.filter((id) => id !== closingId);
  if (!remaining.length) return null;
  // The element that shifted into this index is the right neighbour.
  return remaining[Math.min(index, remaining.length - 1)];
};
