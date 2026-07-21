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

export function fetchCityGates() {
  return getJson("/api/demand/city-gates");
}

export function fetchCityGateBundle(id) {
  return getJson(`/api/demand/city-gate/${encodeURIComponent(id)}/bundle`);
}

export function updateDemandDesktopApproval(recordId, status) {
  return sendJson(`/api/demand/${encodeURIComponent(recordId)}/desktop-approval`, "PATCH", { status });
}
