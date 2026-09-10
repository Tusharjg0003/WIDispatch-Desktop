import { apiRequest, withQuery } from "./client";

/**
 * @typedef {Object} SearchResult
 * @property {"module"|"asset"|"network"|"simulation"} type
 * @property {string} id
 * @property {string} title
 * @property {string} subtitle
 * @property {string|null} [status]
 * @property {string} path
 */

/**
 * @typedef {Object} OperationsOverview
 * @property {string} generatedAt
 * @property {{actualM3:number,availableM3:number,headroomM3:number,utilizationPct:number|null}} supply
 * @property {{requiredM3:number,deliveredM3:number,shortageM3:number}} demand
 * @property {{total:number,maintenance:number,demand:number,draftPlans:number}} pending
 * @property {Array<Object>} exceptions
 * @property {Array<Object>} recentRuns
 */

export function fetchOperationsOverview({ date, signal } = {}) {
  return apiRequest(withQuery("/api/operations/overview", { date }), { signal });
}

export function fetchWorkspaceSearch({ query, types, limit = 24, signal } = {}) {
  return apiRequest(withQuery("/api/search", {
    q: query,
    types: Array.isArray(types) ? types.join(",") : types,
    limit,
  }), { signal });
}
