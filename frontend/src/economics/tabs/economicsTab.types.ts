// Economics tab domain types.
//
// A plant tab's `key` is the plant id, which is what makes opening the same
// plant twice impossible. The list tab has no key and renders the table again.

export const PLANT_SUB_TABS = [
  "overview",
  "financial",
] as const;

export type PlantSubTab = (typeof PLANT_SUB_TABS)[number];

export const DEFAULT_SUB_TAB: PlantSubTab = "overview";

export interface EconomicsTabState {
  subTab: PlantSubTab;
}

export const LIST_TAB_TITLE = "All Plants";

export const isPlantSubTab = (value: unknown): value is PlantSubTab =>
  typeof value === "string" && (PLANT_SUB_TABS as readonly string[]).includes(value);
