// Demand tab domain types.
//
// A city gate tab's `key` is the gate id, which is what makes opening the same
// gate twice impossible. The list tab has no key and renders the table again.

export const CITY_GATE_SUB_TABS = [
  "overview",
  "demand",
  "quality",
  "maintenance",
  "outages",
] as const;

export type CityGateSubTab = (typeof CITY_GATE_SUB_TABS)[number];

export const DEFAULT_SUB_TAB: CityGateSubTab = "overview";

export interface DemandTabState {
  subTab: CityGateSubTab;
}

export const LIST_TAB_TITLE = "All City Gates";

export const isCityGateSubTab = (value: unknown): value is CityGateSubTab =>
  typeof value === "string" && (CITY_GATE_SUB_TABS as readonly string[]).includes(value);
