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
