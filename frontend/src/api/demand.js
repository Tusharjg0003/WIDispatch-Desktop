import { apiRequest } from "./client";

export const fetchCityGates = () => apiRequest("/api/demand/city-gates");
export const fetchCityGateBundle = (id) => apiRequest(`/api/demand/city-gate/${encodeURIComponent(id)}/bundle`);
export const updateDemandDesktopApproval = (recordId, status) => apiRequest(`/api/demand/${encodeURIComponent(recordId)}/desktop-approval`, {
  method: "PATCH",
  body: { status },
});
