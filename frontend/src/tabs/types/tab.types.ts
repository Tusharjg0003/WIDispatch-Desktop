// Domain-neutral tab types.
//
// A tab is one open thing plus the UI state of the person viewing it. Tab
// identity is deliberately separate from domain identity: `id` addresses the
// tab, `key` addresses what it shows, and a tab with no domain entity behind
// it (a list view) has `key === null`.

export interface TabInstance<TState> {
  /** Tab id. Never the domain entity id. */
  id: string;
  /** Domain identity, used to avoid opening the same thing twice. */
  key: string | null;
  title: string;
  pinned: boolean;
  /** Unclosable and always first. At most one per strip. */
  permanent: boolean;
  state: TState;
  createdAt: number;
  updatedAt: number;
}

export interface ClosedTab<TState> {
  tab: TabInstance<TState>;
  /** Index the tab occupied, so reopening puts it back where it was. */
  index: number;
}

export interface CreateTabOptions<TState> {
  title: string;
  state: TState;
  key?: string | null;
  pinned?: boolean;
  permanent?: boolean;
}

let tabSeq = 0;

/** Test seam: keeps generated ids deterministic across runs. */
export const resetTabIdSequence = (): void => {
  tabSeq = 0;
};

export const createTabId = (): string => {
  tabSeq += 1;
  return `tab-${Date.now().toString(36)}-${tabSeq}`;
};

export const createTabInstance = <TState>(
  options: CreateTabOptions<TState>
): TabInstance<TState> => {
  const now = Date.now();
  return {
    id: createTabId(),
    key: options.key ?? null,
    title: options.title,
    pinned: options.pinned ?? false,
    permanent: options.permanent ?? false,
    state: options.state,
    createdAt: now,
    updatedAt: now,
  };
};
