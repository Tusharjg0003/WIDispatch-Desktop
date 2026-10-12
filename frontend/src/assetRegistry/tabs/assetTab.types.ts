// Asset Registry tab types (Production model): a permanent "All Assets" tab,
// then one tab per opened asset (key = asset id) showing its view page or,
// on the `edit` sub-tab, its form. A "New asset" tab has a `new-…` key until
// it is saved, then takes the new asset's id.

export const ASSET_SUB_TABS = ["view", "edit"] as const;

export type AssetSubTab = (typeof ASSET_SUB_TABS)[number];

export const DEFAULT_ASSET_SUB_TAB: AssetSubTab = "view";

export const ASSET_LIST_TAB_TITLE = "All Assets";

export const NEW_ASSET_PREFIX = "new-";

export interface AssetTabState {
  subTab: string;
  /** Unsaved form input (dot on the tab, asks before closing). */
  dirty?: boolean;
}

export const isAssetSubTab = (value: unknown): value is AssetSubTab =>
  typeof value === "string" && (ASSET_SUB_TABS as readonly string[]).includes(value);

export const isNewAssetKey = (key: string | null | undefined): boolean =>
  typeof key === "string" && key.startsWith(NEW_ASSET_PREFIX);
