const LABELS = {
  under_construction: "Under construction",
  in_maintenance: "In maintenance",
  out_of_service: "Out of service",
  not_started: "Not started",
  shortfall: "Shortfall",
};

export function formatStatus(value, fallback = "Not available") {
  if (value == null || value === "") return fallback;
  const key = String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (LABELS[key]) return LABELS[key];
  return key.split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : "").join(" ");
}

export function statusTone(value) {
  const key = String(value || "").toLowerCase();
  if (["operational", "approved", "published", "reporting", "ready", "healthy", "met"].some((item) => key.includes(item))) return "success";
  if (["critical", "outage", "rejected", "shortfall", "failed", "error", "decommissioned"].some((item) => key.includes(item))) return "critical";
  if (["maintenance", "pending", "warning", "stale", "construction", "draft", "adjusted"].some((item) => key.includes(item))) return "warning";
  return "info";
}

