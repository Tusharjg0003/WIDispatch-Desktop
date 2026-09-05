// Transmission pump-station tab domain types.
//
// A pump-station tab's `key` is the station id. The list tab has no key and
// renders the table again.

export const PUMP_STATION_SUB_TABS = [
  "overview",
  "maintenance",
  "outages",
] as const;

export type PumpStationSubTab = (typeof PUMP_STATION_SUB_TABS)[number];

export const DEFAULT_SUB_TAB: PumpStationSubTab = "overview";

export interface TransmissionTabState {
  subTab: PumpStationSubTab;
}

export const LIST_TAB_TITLE = "All Pump Stations";

export const isPumpStationSubTab = (value: unknown): value is PumpStationSubTab =>
  typeof value === "string" && (PUMP_STATION_SUB_TABS as readonly string[]).includes(value);
