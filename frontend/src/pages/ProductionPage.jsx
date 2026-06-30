import React from "react";
import MetricDashboard, { fmtM3 } from "../components/MetricDashboard";

const config = {
  eyebrow: "Dispatch · Supply",
  title: "Production",
  groupLabel: "Plant",
  valueLabel: "Actual m³",
  showUtilization: true,
  showHandover: true,
  emptyText: "No approved production for this range. Adjust the filters to see more.",
  kpis: [
    { eyebrow: "Produced", key: "totalM3", format: "m3", unit: "m³",
      sub: (k) => `Avg ${fmtM3(k.avgDailyM3)} m³/day` },
    { eyebrow: "Peak day", key: "peakM3", format: "m3", unit: "m³",
      sub: () => "Highest single day" },
    { eyebrow: "Capacity utilization", key: "utilizationPct", format: "pct",
      sub: () => "Actual ÷ design" },
    { eyebrow: "Dispatchable headroom", key: "headroomM3", format: "m3", unit: "m³",
      sub: () => "Spare against capacity" },
    { eyebrow: "Plants reporting", key: "plantsReporting", format: "int",
      sub: (k) => `of ${k.plantsOperationalTotal} operational` },
    { eyebrow: "Latest data", key: "latestDate", format: "text",
      sub: (k) => (k.isStale ? "Stale — verify before dispatch" : "Current"),
      tone: (k) => (k.isStale ? "warn" : "good") },
  ],
  rollups: [
    { label: "Produced", key: "totalM3", format: "m3", unit: "m³" },
    { label: "Utilization", key: "utilizationPct", format: "pct" },
    { label: "Headroom", key: "headroomM3", format: "m3", unit: "m³" },
    { label: "Days", key: "days", format: "int" },
  ],
};

export default function ProductionPage() {
  return <MetricDashboard domain="production" config={config} />;
}
