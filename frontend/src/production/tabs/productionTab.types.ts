// Production tab domain types.
//
// A plant tab's `key` is the plant id, which is what makes opening the same
// plant twice impossible. The list tab has no key: it shows no single entity.

// A const array rather than an enum: tsconfig sets erasableSyntaxOnly, so
// Node can strip types instead of compiling them.
export const PLANT_SUB_TABS = [
  "overview",
  "production",
  "quality",
  "maintenance",
  "outages",
] as const;

export type PlantSubTab = (typeof PLANT_SUB_TABS)[number];

export const DEFAULT_SUB_TAB: PlantSubTab = "overview";

export interface ProductionTabState {
  subTab: PlantSubTab;
}

export const LIST_TAB_TITLE = "All Plants";

export const isPlantSubTab = (value: unknown): value is PlantSubTab =>
  typeof value === "string" && (PLANT_SUB_TABS as readonly string[]).includes(value);
