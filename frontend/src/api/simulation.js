const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function request(path, method = "GET", payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    ...(payload === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  });
  if (!res.ok) {
    // The simulation routes return a useful `error` string (unknown network,
    // bad date range, nothing approved to dispatch); surface it rather than a
    // bare status code.
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export function fetchSimulationConfigs() {
  return request("/api/simulation-configs");
}

export function fetchSimulationConfig(id) {
  return request(`/api/simulation-configs/${encodeURIComponent(id)}`);
}

export function createSimulationConfig(body) {
  return request("/api/simulation-configs", "POST", body);
}

export function updateSimulationConfig(id, body) {
  return request(`/api/simulation-configs/${encodeURIComponent(id)}`, "PUT", body);
}

export function deleteSimulationConfig(id) {
  return request(`/api/simulation-configs/${encodeURIComponent(id)}`, "DELETE");
}

export function runSimulation(id, body = {}) {
  return request(`/api/simulation-configs/${encodeURIComponent(id)}/run`, "POST", body);
}

export function fetchDispatchPlan(id) {
  return request(`/api/dispatch-plans/${encodeURIComponent(id)}`);
}

export function publishDispatchPlan(id) {
  return request(`/api/dispatch-plans/${encodeURIComponent(id)}/publish`, "POST", {});
}
