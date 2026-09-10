import { apiRequest, withQuery } from "./client";

export const fetchProductionPlants = () => apiRequest("/api/production/plants");
export const fetchPlantBundle = (id) => apiRequest(`/api/production/plant/${encodeURIComponent(id)}/bundle`);
export const fetchEconomicsPlantBundle = (id) => apiRequest(`/api/economics/plant/${encodeURIComponent(id)}/bundle`);
export const fetchRecentOutages = ({ since, limit } = {}) => apiRequest(withQuery("/api/production/outages/recent", { since, limit }));
export const updateMaintenanceDesktopApproval = (recordId, status) => apiRequest(`/api/production/maintenance/${encodeURIComponent(recordId)}/desktop-approval`, {
  method: "PATCH",
  body: { status },
});
