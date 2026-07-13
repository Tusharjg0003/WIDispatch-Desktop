const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

async function sendJson(path, method, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export function fetchProductionPlants() {
  return getJson("/api/production/plants");
}

export function fetchPlantBundle(id) {
  return getJson(`/api/production/plant/${encodeURIComponent(id)}/bundle`);
}

export function fetchRecentOutages({ since, limit } = {}) {
  const params = new URLSearchParams();
  if (since) params.set("since", since);
  if (limit) params.set("limit", String(limit));
  const query = params.toString();
  return getJson(`/api/production/outages/recent${query ? `?${query}` : ""}`);
}

export function updateMaintenanceDesktopApproval(recordId, status) {
  return sendJson(`/api/production/maintenance/${encodeURIComponent(recordId)}/desktop-approval`, "PATCH", { status });
}
