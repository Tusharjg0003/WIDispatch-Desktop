import { apiRequest } from "./client";

export const fetchNetworks = () => apiRequest("/api/networks");
export const fetchNetwork = (id) => apiRequest(`/api/networks/${encodeURIComponent(id)}`);
export const saveNetwork = (payload) => apiRequest("/api/networks", { method: "POST", body: payload });
export const updateNetwork = (id, payload) => apiRequest(`/api/networks/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
export const deleteNetwork = (id) => apiRequest(`/api/networks/${encodeURIComponent(id)}`, { method: "DELETE" });
