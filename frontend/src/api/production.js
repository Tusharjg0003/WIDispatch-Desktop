const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export function fetchProductionPlants() {
  return getJson("/api/production/plants");
}

export function fetchPlantBundle(id) {
  return getJson(`/api/production/plant/${encodeURIComponent(id)}/bundle`);
}
