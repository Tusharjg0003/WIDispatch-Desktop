// Transmission-system tab domain types. A system tab's `key` is the system
// id; the permanent list tab has no key and shows the systems table.

export const SYSTEM_SUB_TABS = ["overview", "lines", "assets"] as const;

export type SystemSubTab = (typeof SYSTEM_SUB_TABS)[number];

export const DEFAULT_SYSTEM_SUB_TAB: SystemSubTab = "overview";

export const SYSTEM_LIST_TAB_TITLE = "All Systems";

export const isSystemSubTab = (value: unknown): value is SystemSubTab =>
  typeof value === "string" && (SYSTEM_SUB_TABS as readonly string[]).includes(value);
