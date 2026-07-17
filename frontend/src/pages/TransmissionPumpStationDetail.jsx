import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { fetchTransmissionPumpStationBundle } from "../api/metrics";
import MaintenanceRecordList from "../components/production/MaintenanceRecordList";
import OutageRecordList from "../components/production/OutageRecordList";
import SinglePlantMap from "../components/production/SinglePlantMap";
import PumpStationCapacityChart from "../components/transmission/PumpStationCapacityChart";
import {
  activeFunctionalPumps,
  backupPumps,
  pumpCapacity,
  pumpRoleLabel,
  stationPumps,
  totalDesignCapacity,
} from "../lib/pumpStation";
import "./ProductionPlantDetail.css";
import "./TransmissionPumpStationDetail.css";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "maintenance", label: "Maintenance" },
  { key: "outages", label: "Outages" },
];
const TAB_KEYS = new Set(TABS.map((tab) => tab.key));

const fmtDate = (value) => {
  if (!value || value === "NULL" || value === "") return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "2-digit" });
};

function InfoField({ label, value }) {
  return (
    <div className="tpsd__field">
      <div className="tpsd__label">{label}</div>
      <div className="tpsd__value">{value}</div>
    </div>
  );
}

function PumpStationOverview({ station, bundle }) {
  const pumps = useMemo(() => stationPumps(station?.specifications), [station?.specifications]);
  const functional = useMemo(() => activeFunctionalPumps(station?.specifications), [station?.specifications]);
  const backups = useMemo(() => backupPumps(station?.specifications), [station?.specifications]);
  const designCapacity = totalDesignCapacity(station?.specifications);

  const fields = [
    ["Asset ID", <span className="mono">{station?.external_id || "—"}</span>],
    ["Pump Station Name", station?.name || "—"],
    ["Asset Type", station?.asset_type || "Pump Station"],
    ["Entity", station?.entity || "—"],
    ["Region", station?.region || "—"],
    ["City", station?.city || "—"],
    ["Functional Pumps", functional.length],
    ["Backup Pumps", backups.length],
    ["Design Capacity", `${designCapacity.toLocaleString()} m³/day`],
    ["Commissioning Date", fmtDate(station?.commissioning_date)],
    ["Decommissioning Date", fmtDate(station?.decommissioning_date)],
    ["Status", station?.status || "N/A"],
  ];

  return (
    <div className="tpsd">
      <div className="tpsd__row">
        <section className="tpsd__card">
          <div className="tpsd__card-head">
            <h2>Basic Information</h2>
            <p>Core pump-station details and pump configuration</p>
          </div>
          <div className="tpsd__grid">
            {fields.map(([label, value]) => <InfoField key={label} label={label} value={value} />)}
          </div>
        </section>

        <section className="tpsd__card">
          <div className="tpsd__card-head">
            <h2>Location</h2>
            <p>Satellite view</p>
          </div>
          <div className="tpsd__card-body">
            <SinglePlantMap latitude={station?.latitude} longitude={station?.longitude} name={station?.name} height={260} />
          </div>
        </section>
      </div>

      <section className="tpsd__card">
        <div className="tpsd__card-head">
          <h2>Pump Design Capacities</h2>
          <p>Per-pump roles and configured daily capacity</p>
        </div>
        <div className="tpsd__table-wrap">
          <table className="tpsd__table">
            <thead>
              <tr>
                <th>Pump</th>
                <th>Role</th>
                <th>Status</th>
                <th className="ta-r">Design Capacity (m³/day)</th>
              </tr>
            </thead>
            <tbody>
              {pumps.map((pump, index) => (
                <tr key={pump.id || pump.name || index}>
                  <td>{pump.name || pump.id || `Pump ${index + 1}`}</td>
                  <td><span className="ppl__badge">{pumpRoleLabel(pump)}</span></td>
                  <td>{pump.active === false ? "Inactive" : "Active"}</td>
                  <td className="ta-r mono">{pumpCapacity(pump).toLocaleString()}</td>
                </tr>
              ))}
              {pumps.length === 0 && (
                <tr>
                  <td colSpan={4} className="tpsd__empty">No pumps configured for this station.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tpsd__card">
        <div className="tpsd__card-head">
          <h2>Design vs Effective Capacity</h2>
          <p>Effective capacity reflects the change after maintenance (with standby substitution) and outages.</p>
        </div>
        <div className="tpsd__card-body">
          <PumpStationCapacityChart station={station} bundle={bundle} />
        </div>
      </section>
    </div>
  );
}

export default function TransmissionPumpStationDetail() {
  const { pumpStationId: rawId } = useParams();
  const pumpStationId = decodeURIComponent(rawId);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(TAB_KEYS.has(requestedTab) ? requestedTab : "overview");

  useEffect(() => {
    const nextTab = TAB_KEYS.has(requestedTab) ? requestedTab : "overview";
    setActiveTab((current) => (current === nextTab ? current : nextTab));
  }, [requestedTab]);

  const selectTab = (key) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    if (key === "overview") next.delete("tab");
    else next.set("tab", key);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setBundle(null);
    fetchTransmissionPumpStationBundle(pumpStationId)
      .then((data) => {
        if (alive) {
          setBundle(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, [pumpStationId]);

  const station = bundle?.pumpStation;

  return (
    <div className="ppd transmission-detail">
      <header className="ppd__head">
        <Link to="/transmission" className="ppd__back" aria-label="Back to pump stations"><ArrowLeft size={16} /></Link>
        <div>
          <h1 className="ppd__name">{station?.name || pumpStationId}</h1>
          <p className="ppd__meta">{[station?.asset_type || "Pump Station", station?.region, "View only"].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      {loading && <div className="ppd__state">Loading pump station…</div>}
      {error && <div className="ppd__state ppd__state--err">Failed to load pump station: {error}</div>}

      {!loading && !error && bundle && (
        <>
          <div className="ppd__tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`ppd__tab ${activeTab === tab.key ? "ppd__tab--active" : ""}`}
                onClick={() => selectTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="ppd__tabpanel">
            {activeTab === "overview" && <PumpStationOverview station={station} bundle={bundle} />}
            {activeTab === "maintenance" && <MaintenanceRecordList plantId={pumpStationId} bundle={bundle} tableMode="pumpStation" />}
            {activeTab === "outages" && <OutageRecordList plantId={pumpStationId} bundle={bundle} />}
          </div>
        </>
      )}
    </div>
  );
}
