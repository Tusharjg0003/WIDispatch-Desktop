import { apiRequest, withQuery } from "./client";

const metricQuery = (filters = {}) => ({ from: filters.from, to: filters.to, plant: filters.plant });

export function fetchSummary(domain, filters) {
  return apiRequest(withQuery(`/api/${domain}/summary`, metricQuery(filters)));
}

export function fetchRecords(domain, filters) {
  return apiRequest(withQuery(`/api/${domain}/records`, metricQuery(filters)));
}

export function fetchTransmission(filters) {
  return apiRequest(withQuery("/api/transmission/summary", metricQuery(filters)));
}

export const fetchTransmissionPumpStations = () => apiRequest("/api/transmission/pump-stations");
export const fetchTransmissionPumpStationBundle = (id) => apiRequest(`/api/transmission/pump-station/${encodeURIComponent(id)}/bundle`);
export const fetchQuality = (filters) => apiRequest(withQuery("/api/quality", metricQuery(filters)));
export const fetchEconomics = (filters) => apiRequest(withQuery("/api/economics", metricQuery(filters)));
export const fetchAssets = (filters = {}) => apiRequest(withQuery("/api/assets", filters));
export const fetchAsset = (id) => apiRequest(`/api/assets/${encodeURIComponent(id)}`);
export const createAsset = (payload) => apiRequest("/api/assets", { method: "POST", body: payload });
export const updateAsset = (id, payload) => apiRequest(`/api/assets/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
export const deleteAsset = (id) => apiRequest(`/api/assets/${encodeURIComponent(id)}`, { method: "DELETE" });
export const fetchTransmissionSystems = () => apiRequest("/api/transmission-systems");
export const createTransmissionSystem = (payload) => apiRequest("/api/transmission-systems", { method: "POST", body: payload });
export const fetchTransmissionSystemLibrary = () => apiRequest("/api/transmission-systems/library");
export const fetchTransmissionSystemNetwork = (id) => apiRequest(`/api/transmission-systems/${encodeURIComponent(id)}/network`);
export const fetchTransmissionLines = () => apiRequest("/api/transmission-lines");
export const createTransmissionLine = (payload) => apiRequest("/api/transmission-lines", { method: "POST", body: payload });
export const deleteTransmissionLine = (id) => apiRequest(`/api/transmission-lines/${encodeURIComponent(id)}`, { method: "DELETE" });
