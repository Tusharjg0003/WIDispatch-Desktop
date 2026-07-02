const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function sendJson(path, method, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Lightweight list for the Load picker: { networks: [{ id, name, nodeCount, ... }] }.
export function fetchNetworks() {
  return getJson("/api/networks");
}

// Full document with nodes + edges for hydrating the canvas.
export function fetchNetwork(id) {
  return getJson(`/api/networks/${id}`);
}

// Create a new saved network → returns the created document (with its id).
export function saveNetwork(payload) {
  return sendJson("/api/networks", "POST", payload);
}

// Update an existing network in place.
export function updateNetwork(id, payload) {
  return sendJson(`/api/networks/${id}`, "PUT", payload);
}
