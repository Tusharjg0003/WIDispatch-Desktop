import React from "react";
import MetricDashboard, { fmtM3 } from "../components/MetricDashboard";
import "./DemandPage.css";

const config = {
  eyebrow: "Dispatch · Demand",
  title: "Demand",
  pageClassName: "demand-page demand-page--boxy",
  groupLabel: "Delivery point",
  valueLabel: "Required m³",
  showUtilization: false,
  showHandover: false,
  emptyText: "No approved demand for this range. Adjust the filters to see more.",
  kpis: [
    { eyebrow: "Total demand", key: "totalM3", format: "m3", unit: "m³",
      sub: () => "Required across range" },
    { eyebrow: "Avg daily demand", key: "avgDailyM3", format: "m3", unit: "m³",
      sub: () => "Per reporting day" },
    { eyebrow: "Peak daily demand", key: "peakM3", format: "m3", unit: "m³",
      sub: () => "Highest single day" },
    { eyebrow: "Points reporting", key: "plantsReporting", format: "int",
      sub: () => "Delivery points" },
    { eyebrow: "Latest data", key: "latestDate", format: "text",
      sub: (k) => (k.isStale ? "Stale — verify before dispatch" : "Current"),
      tone: (k) => (k.isStale ? "warn" : "good") },
  ],
  rollups: [
    { label: "Required", key: "totalM3", format: "m3", unit: "m³" },
    { label: "Avg/day", key: "avgDailyM3", format: "m3", unit: "m³" },
    { label: "Peak", key: "peakM3", format: "m3", unit: "m³" },
    { label: "Days", key: "days", format: "int" },
  ],
};

export default function DemandPage() {
  return <MetricDashboard domain="demand" config={config} />;
}
