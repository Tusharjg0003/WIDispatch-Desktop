import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { fetchTransmissionPumpStations } from "../api/metrics";
import { activeFunctionalPumps, backupPumps, totalDesignCapacity } from "../lib/pumpStation";
import TransmissionSystemsView from "./TransmissionSystemsView";
import TransmissionTabs from "../transmission/tabs/TransmissionTabs";
import TabStripBoundary from "../tabs/components/TabStripBoundary";
import { useTransmissionTabStore } from "../transmission/tabs/transmissionTabStore";
import { transmissionTabController } from "../transmission/tabs/transmissionTabControllerInstance";
import { useTabShortcuts } from "../tabs/hooks/useTabShortcuts";
import TransmissionPumpStationDetail from "./TransmissionPumpStationDetail";
import { StatusBadge } from "../components/ui/WorkspacePrimitives";
import { useStatusItems } from "../components/StatusBar";
import AssetMapView from "../components/AssetMapView";
import {
  CircleCheck, Download, Droplets, Gauge, List as ListIcon, Map as MapIcon, Search as SearchIcon,
} from "lucide-react";
import { downloadCsv } from "../lib/exportCsv";
import { recordsToCsv } from "../lib/operatorTables";
import { ENTITY_TYPE_COLORS } from "../cytoscape/buildCyStyle";
import "./ProductionPage.css";
import "./ProductionPlantList.css";

/** Publishes footer items while mounted (lets each Transmission view own the footer). */
function FooterItems({ items }) {
  useStatusItems(items);
  return null;
}

const compactNum = (v) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(v / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`;
  return Math.round(v).toLocaleString();
};

const STATION_EXPORT_COLUMNS = [
  { key: "id", label: "Asset ID", get: (s) => s.external_id || "" },
  { key: "name", label: "Pump station", get: (s) => s.name || "" },
  { key: "entity", label: "Entity", get: (s) => s.entity || "" },
  { key: "region", label: "Region", get: (s) => s.region || "" },
  { key: "status", label: "Status", get: (s) => s.status || "" },
  { key: "commissioning", label: "Commissioning", get: (s) => s.commissioning_date || "" },
  { key: "decommissioning", label: "Decommissioning", get: (s) => s.decommissioning_date || "" },
  { key: "active", label: "Active pumps", get: (s) => activeFunctionalPumps(s.specifications).length },
  { key: "standby", label: "Standby pumps", get: (s) => backupPumps(s.specifications).length },
  { key: "capacity", label: "Design capacity (m3/day)", get: (s) => totalDesignCapacity(s.specifications) },
];

function Kpi({ icon: Icon, tone = "", colour, label, value, unit, sub }) {
  return (
    <section className={`ppl-kpi${tone ? ` ppl-kpi--${tone}` : ""}`} style={colour ? { "--ppl-tone": colour } : undefined} aria-label={label}>
      <span className="ppl-kpi__icon" aria-hidden="true"><Icon size={16} /></span>
      <span className="ppl-kpi__text">
        <span className="ppl-kpi__label">{label}</span>
        <span className="ppl-kpi__value">{value}{unit && <small>{unit}</small>}</span>
        {sub && <span className="ppl-kpi__sub">{sub}</span>}
      </span>
    </section>
  );
}

const uniqSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

const fmtDate = (value) => {
  if (!value || value === "NULL") return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};



export default function TransmissionPage({ mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { pumpStationId } = useParams();
  const [searchParams] = useSearchParams();
  const systemsView = mode === "systems" || location.pathname.startsWith("/transmission/systems");

  const activeTabId = useTransmissionTabStore((state) => state.activeTabId);
  const activeTab = useTransmissionTabStore((state) =>
    state.activeTabId ? state.tabs[state.activeTabId] ?? null : null
  );

  // The tab strip only owns the URL in the pump-stations view. Transmission
  // Systems shares this page, so while it is showing the controller must not
  // mirror the active tab into the URL — restoring the tab session on a
  // /transmission/systems deep link used to redirect to the pump-stations list.
  useEffect(() => {
    if (systemsView) return undefined;
    transmissionTabController.registerNavigator({
      replace: (path) => navigate(path, { replace: true }),
    });
    transmissionTabController.syncUrl();
    return () => transmissionTabController.detach();
  }, [navigate, systemsView]);

  useEffect(() => {
    transmissionTabController.restoreSessionOnce(
      pumpStationId ?? null,
      searchParams.get("tab")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useTabShortcuts(transmissionTabController, !systemsView);

  const openPumpStation = useCallback((station) => {
    transmissionTabController.openPumpStation(station.id, station.name || station.id);
  }, []);

  const changeSubTab = useCallback(
    (next) => {
      if (activeTabId) transmissionTabController.setSubTab(activeTabId, next);
    },
    [activeTabId]
  );

  const adoptTitle = useCallback(
    (station) => {
      if (activeTabId && station?.name) {
        transmissionTabController.adoptTitle(activeTabId, station.name);
      }
    },
    [activeTabId]
  );

  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [entity, setEntity] = useState("");
  const [region, setRegion] = useState("");
  const [view, setView] = useState("list");
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchTransmissionPumpStations()
      .then((data) => {
        if (alive) {
          setStations(data);
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
  }, []);

  const operationalStations = useMemo(
    () => stations.filter((station) => String(station.status || "").toLowerCase() === "operational"),
    [stations]
  );
  const filterOptions = useMemo(() => ({
    entities: uniqSorted(operationalStations.map((station) => station.entity)),
    regions: uniqSorted(operationalStations.map((station) => station.region)),
  }), [operationalStations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return operationalStations.filter((station) => {
      if (entity && station.entity !== entity) return false;
      if (region && station.region !== region) return false;
      if (!q) return true;
      return [station.name, station.external_id, station.city, station.region, station.entity, station.asset_type]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q));
    });
  }, [operationalStations, query, entity, region]);

  const stationKpis = useMemo(() => {
    if (!stations.length) return null;
    let duty = 0;
    let standby = 0;
    let capacity = 0;
    operationalStations.forEach((station) => {
      duty += activeFunctionalPumps(station.specifications).length;
      standby += backupPumps(station.specifications).length;
      capacity += totalDesignCapacity(station.specifications) || 0;
    });
    return { total: stations.length, operational: operationalStations.length, duty, standby, capacity };
  }, [stations, operationalStations]);

  const footerItems = useMemo(() => {
    if (!stations.length) return null;
    const count = (status) => stations.filter((s) => String(s.status || "").toLowerCase() === status).length;
    return {
      left: [
        { label: "Pump stations", value: stations.length, tone: "neutral" },
        { label: "Operational", value: count("operational"), tone: "ok" },
        { label: "Maintenance", value: count("maintenance"), tone: "warn" },
        { label: "Offline", value: count("offline"), tone: "err" },
      ],
      right: [{ label: "Design capacity", value: `${((stationKpis?.capacity || 0) / 1000).toLocaleString()} K m³/day` }],
    };
  }, [stations, stationKpis]);

  const exportStations = () => downloadCsv("widispatch-pump-stations.csv", recordsToCsv(filtered, STATION_EXPORT_COLUMNS));

  return (
    <div className="production-shell transmission-shell">
      {systemsView ? (
        <TransmissionSystemsView />
      ) : (
        <>
          <FooterItems items={footerItems} />
          <TabStripBoundary>
            <TransmissionTabs />
          </TabStripBoundary>

          {activeTab?.key ? (
            <TransmissionPumpStationDetail
              key={activeTab.id}
              pumpStationId={activeTab.key}
              subTab={activeTab.state.subTab}
              onSubTabChange={changeSubTab}
              onBack={() => activeTabId && transmissionTabController.closeTab(activeTabId)}
              onPumpStationLoaded={adoptTitle}
            />
          ) : (
            <main className="ppl ppl--compact transmission-stations">
            {stationKpis && (
              <div className="ppl-kpis">
                <Kpi icon={CircleCheck} tone="ok" label="Operational stations" value={stationKpis.operational} unit={`/ ${stationKpis.total}`}
                  sub={stationKpis.total - stationKpis.operational ? `${stationKpis.total - stationKpis.operational} not operational` : "Every station operational"} />
                <Kpi icon={Gauge} colour={ENTITY_TYPE_COLORS.pump} label="Design capacity" value={compactNum(stationKpis.capacity)} unit="m³/day" sub="Operational stations" />
                <Kpi icon={Droplets} colour={ENTITY_TYPE_COLORS.pump} label="Duty pumps" value={stationKpis.duty} sub="Active and functional" />
                <Kpi icon={Droplets} label="Standby pumps" value={stationKpis.standby} sub="Backup cover" />
              </div>
            )}
            <div className="ppl__panel">
              <header className="ppl__toolbar-row">
                <label className="ppl__search-wrap">
                  <SearchIcon size={14} />
                  <input
                    className="ppl__search"
                    aria-label="Search pump stations"
                    placeholder="Search location, asset ID, name, entity…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <span className="ppl__result-count">{filtered.length} of {operationalStations.length} operational stations</span>
                <div className="ppl__viewtoggle" role="group" aria-label="View mode">
                  <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}><ListIcon size={13} /> List</button>
                  <button type="button" className={view === "map" ? "is-active" : ""} onClick={() => setView("map")}><MapIcon size={13} /> Map</button>
                </div>
                <button type="button" className="ppl__toolbar-btn" onClick={exportStations}><Download size={13} /> Export CSV</button>
              </header>

              {loading && <div className="ppl__state">Loading pump stations…</div>}
              {error && <div className="ppl__state ppl__state--err">Failed to load pump stations: {error}</div>}

              {!loading && !error && view === "map" && (
                <div className="ppl__map"><AssetMapView assets={filtered} onView={openPumpStation} onEdit={openPumpStation} /></div>
              )}

              {!loading && !error && view === "list" && (
                <div className="ppl__table-wrap">
                  <table className="ppl__table">
                    <thead>
                      <tr>
                        <th>Asset ID</th>
                        <th>Pump Station Name</th>
                        <th><select className={`ppl__head-select${entity ? " is-set" : ""}`} aria-label="Entity" value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">Entity: All</option>{filterOptions.entities.map((item) => <option key={item} value={item}>{item}</option>)}</select></th>
                        <th><select className={`ppl__head-select${region ? " is-set" : ""}`} aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}><option value="">Region: All</option>{filterOptions.regions.map((item) => <option key={item} value={item}>{item}</option>)}</select></th>
                        <th>Status</th>
                        <th>Commissioning</th>
                        <th>Decommissioning</th>
                        <th className="ta-r">Active Pumps</th>
                        <th className="ta-r">Standby Pumps</th>
                        <th className="ta-r">Design Capacity (m³/day)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((station) => (
                        <tr key={station.id} role="link" tabIndex={0} onClick={() => openPumpStation(station)}
                          onKeyDown={(event) => { if (event.key === "Enter") openPumpStation(station); }}>
                          <td className="mono muted">{station.external_id}</td>
                          <td className="ppl__identity-cell">
                            <div className="ppl__name">{station.name}</div>
                            <div className="ppl__city">{station.city || "—"}</div>
                          </td>
                          <td className="muted">{station.entity || "—"}</td>
                          <td className="muted">{station.region || "—"}</td>
                          <td><StatusBadge status={station.status} /></td>
                          <td className="muted">{fmtDate(station.commissioning_date)}</td>
                          <td className="muted">{fmtDate(station.decommissioning_date)}</td>
                          <td className="ta-r mono">{activeFunctionalPumps(station.specifications).length}</td>
                          <td className="ta-r mono">{backupPumps(station.specifications).length}</td>
                          <td className="ta-r mono">{totalDesignCapacity(station.specifications).toLocaleString()}</td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={10} className="ppl__empty">No pump stations found matching your criteria.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </main>
          )}
        </>
      )}
    </div>
  );
}
