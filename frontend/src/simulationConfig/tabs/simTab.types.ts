// Simulation Config tab types. One tab per open simulation (key = config id),
// Network Builder style — no permanent list tab; the rail is the list.
// A tab keeps its unsaved setup (`draft`) while you work in other tabs.

export const SIM_SUB_TABS = ["configuration", "results", "decisions", "canvas"] as const;

export type SimSubTab = (typeof SIM_SUB_TABS)[number];

export const DEFAULT_SIM_SUB_TAB: SimSubTab = "configuration";

export interface SimTabState {
  subTab: string;
  /** Unsaved config (name, network, dates, overrides…) while switching tabs. */
  draft?: Record<string, unknown> | null;
  dirty?: boolean;
}

export const isSimSubTab = (value: unknown): value is SimSubTab =>
  typeof value === "string" && (SIM_SUB_TABS as readonly string[]).includes(value);

/** A "New simulation" tab (nothing saved yet) has a key with this prefix. */
export const NEW_SIM_PREFIX = "new-";
export const NEW_SIM_TITLE = "New simulation";

export const isNewSimKey = (key: unknown): boolean =>
  typeof key === "string" && key.startsWith(NEW_SIM_PREFIX);
