import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Droplets, Gauge, ShieldCheck, Wrench } from "lucide-react";
import RecordKpis from "../components/production/RecordKpis";
import { ENTITY_TYPE_COLORS } from "../cytoscape/buildCyStyle";
import { fetchTransmissionPumpStationBundle } from "../api/metrics";
import { StatusBadge } from "../components/ui/WorkspacePrimitives";
import MaintenanceRecordList from "../components/production/MaintenanceRecordList";
import OutageRecordList from "../components/production/OutageRecordList";
import SinglePlantMap from "../components/production/SinglePlantMap";
import { UpcomingMaintenanceCard } from "../components/production/PlantOverview";
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

  const s = station?.specifications || {};
  const pick = (...vals) => vals.find((v) => v != null && v !== "" && v !== "NULL");
  const coord = () => {
    const a = Number(station?.latitude), b = Number(station?.longitude);
    return Number.isFinite(a) && Number.isFinite(b) ? `${a.toFixed(4)}, ${b.toFixed(4)}` : "N/A";
  };
  const fields = [
    ["Asset ID", <span className="mono">{station?.external_id || "—"}</span>],
    ["Station Type", station?.asset_type || "Pump Station"],
    ["Entity", station?.entity || "—"],
    ["Entity Type", pick(station?.entity_type, station?.entityType, s.entity_type) || "N/A"],
    ["Region", station?.region || "—"],
    ["Governorate", pick(station?.governorate, s.governorate) || "N/A"],
    ["City", station?.city || "—"],
    ["Coordinates", <span className="mono">{coord()}</span>],
    ["Commissioned", fmtDate(station?.commissioning_date)],
    ["Decommissioned", fmtDate(station?.decommissioning_date)],
  ];

  const dutyCapacity = functional.reduce((sum, pump) => sum + (pumpCapacity(pump) || 0), 0);
  const standbyCapacity = backups.reduce((sum, pump) => sum + (pumpCapacity(pump) || 0), 0);
  const upcoming = (bundle?.maintenanceRecords || []).filter((r) => {
    const end = r.end_datetime || r.end || r.start_datetime;
    return end && new Date(end).getTime() >= Date.now();
  }).length;

  return (
    <div className="tpsd">
      <RecordKpis
        items={[
          { label: "Design capacity", value: designCapacity.toLocaleString(), unit: "m³/day", icon: Gauge, tone: "acc", sub: `${pumps.length} pump${pumps.length === 1 ? "" : "s"} configured` },
          {
            label: "Duty pumps",
            value: functional.length,
            icon: Droplets,
            tone: functional.length ? "ok" : "err",
            sub: `${dutyCapacity.toLocaleString()} m³/day on duty`,
            meter: designCapacity ? (dutyCapacity / designCapacity) * 100 : undefined,
          },
          {
            label: "Standby pumps",
            value: backups.length,
            icon: ShieldCheck,
            tone: backups.length ? "acc" : "warn",
            sub: backups.length ? `${standbyCapacity.toLocaleString()} m³/day of cover` : "No standby cover",
          },
          {
            label: "Upcoming maintenance",
            value: upcoming,
            icon: Wrench,
            tone: upcoming ? "warn" : "neutral",
            sub: upcoming ? "Scheduled, not yet ended" : "Nothing scheduled",
          },
        ]}
      />

      <div className="pov__top">
        <section className="tpsd__card">
          <div className="tpsd__card-head">
            <h2>Station Facts</h2>
            <p>Core pump-station details and pump configuration</p>
          </div>
          <div className="tpsd__grid">
            {fields.map(([label, value]) => <InfoField key={label} label={label} value={value} />)}
          </div>
        </section>

        <UpcomingMaintenanceCard bundle={bundle} />

        <section className="tpsd__card">
          <div className="tpsd__card-head">
            <h2>Location</h2>
            <p>Satellite view</p>
          </div>
          <div className="tpsd__card-body">
            <SinglePlantMap latitude={station?.latitude} longitude={station?.longitude} name={station?.name} height={300} />
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
                <th>Share of station</th>
              </tr>
            </thead>
            <tbody>
              {pumps.map((pump, index) => (
                <tr key={pump.id || pump.name || index}>
                  <td>{pump.name || pump.id || `Pump ${index + 1}`}</td>
                  <td><span className={`ppl__badge ${/standby|backup/i.test(pumpRoleLabel(pump)) ? "ppl__badge--type-desalination" : "ppl__badge--data"}`}>{pumpRoleLabel(pump)}</span></td>
                  <td><span className={`ppl__badge${pump.active === false ? " ppl__badge--muted" : " ppl__badge--data"}`}>{pump.active === false ? "Inactive" : "Active"}</span></td>
                  <td className="ta-r mono">{pumpCapacity(pump).toLocaleString()}</td>
                  <td>
                    {(() => {
                      const share = designCapacity ? Math.round((pumpCapacity(pump) / designCapacity) * 1000) / 10 : null;
                      return share == null ? <span className="tpsd__muted">—</span> : (
                        <span className="tpsd-share">
                          <span className="tpsd-share__track"><span className="tpsd-share__bar" style={{ width: `${Math.min(100, share)}%` }} /></span>
                          <span className="mono">{share}%</span>
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              ))}
              {pumps.length === 0 && (
                <tr>
                  <td colSpan={5} className="tpsd__empty">No pumps configured for this station.</td>
                </tr>
              )}
            </tbody>
            {pumps.length > 0 && (
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td colSpan={2} className="tpsd__muted">{functional.length} duty · {backups.length} standby</td>
                  <td className="ta-r mono">{designCapacity.toLocaleString()}</td>
                  <td />
                </tr>
              </tfoot>
            )}
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

export default function TransmissionPumpStationDetail({
  pumpStationId: controlledId,
  subTab,
  onSubTabChange,
  onPumpStationLoaded,
  onBack,
}) {
  const { pumpStationId: rawId } = useParams();
  const routeId = rawId ? decodeURIComponent(rawId) : null;
  const pumpStationId = controlledId ?? routeId;
  const [searchParams, setSearchParams] = useSearchParams();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestedTab = searchParams.get("tab");
  const activeTab = TAB_KEYS.has(subTab) ? subTab : (TAB_KEYS.has(requestedTab) ? requestedTab : "overview");

  const selectTab = (key) => {
    if (typeof onSubTabChange === "function") {
      onSubTabChange(key);
      return;
    }
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

  useEffect(() => {
    if (bundle?.pumpStation && typeof onPumpStationLoaded === "function") {
      onPumpStationLoaded(bundle.pumpStation);
    }
  }, [bundle, onPumpStationLoaded]);

  const station = bundle?.pumpStation;

  return (
    <div className="ppd transmission-detail">
      <header className="ppd__identity" style={{ "--ppd-colour": ENTITY_TYPE_COLORS.pump }}>
        {onBack && (
          <button type="button" className="ppd__back" onClick={onBack} title="Back to Pump Stations" aria-label="Back to Pump Stations">
            <ArrowLeft size={16} />
          </button>
        )}
        <span className="ppd__icon" aria-hidden="true"><Droplets size={18} /></span>
        <h1 className="ppd__name">{station?.name || pumpStationId}</h1>
        {station?.status && <StatusBadge status={station.status} />}
        {station?.external_id && <span className="ppd__extid mono">{station.external_id}</span>}
        <span className="ppd__meta">{[station?.asset_type || "Pump Station", station?.entity, [station?.region, station?.city].filter(Boolean).join(" / ")].filter(Boolean).join(" · ")}</span>
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
