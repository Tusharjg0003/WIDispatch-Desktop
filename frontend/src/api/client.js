export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

/**
 * @typedef {Error & {status?: number, code?: string, details?: unknown}} ApiError
 */

export async function apiRequest(path, options = {}) {
  const { body, headers, ...requestOptions } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    ...requestOptions,
    headers: body === undefined
      ? headers
      : { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.error?.code || "REQUEST_FAILED";
    error.details = data?.error?.details;
    throw error;
  }
  return data;
}

export function withQuery(path, values = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
