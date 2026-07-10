const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

function buildQuery(filters = {}) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.plant) params.set("plant", filters.plant);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

// domain is "production" | "demand"
export function fetchSummary(domain, filters) {
  return getJson(`/api/${domain}/summary${buildQuery(filters)}`);
}

export function fetchRecords(domain, filters) {
  return getJson(`/api/${domain}/records${buildQuery(filters)}`);
}

export function fetchTransmission(filters) {
  return getJson(`/api/transmission/summary${buildQuery(filters)}`);
}

export function fetchQuality(filters) {
  return getJson(`/api/quality${buildQuery(filters)}`);
}

export function fetchEconomics(filters) {
  return getJson(`/api/economics${buildQuery(filters)}`);
}

export function fetchAssets(filters = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return getJson(`/api/assets${qs ? `?${qs}` : ""}`);
}

export function fetchAsset(id) {
  return getJson(`/api/assets/${encodeURIComponent(id)}`);
}

export async function createAsset(payload) {
  const res = await fetch(`${API_BASE}/api/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function updateAsset(id, payload) {
  const res = await fetch(`${API_BASE}/api/assets/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function deleteAsset(id) {
  const res = await fetch(`${API_BASE}/api/assets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (res.status === 204) return true;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return true;
}

async function postJson(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function fetchTransmissionSystems() {
  return getJson("/api/transmission-systems");
}

export function createTransmissionSystem(payload) {
  return postJson("/api/transmission-systems", payload);
}

export function fetchTransmissionLines() {
  return getJson("/api/transmission-lines");
}

export function createTransmissionLine(payload) {
  return postJson("/api/transmission-lines", payload);
}
