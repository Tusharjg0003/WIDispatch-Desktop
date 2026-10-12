import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Cylinder, Download, Droplets, Factory, MapPinned, Network as NetworkIcon, Route, Search as SearchIcon, Spline } from "lucide-react";
import { fetchAssets, fetchTransmissionLines, fetchTransmissionSystems, deleteTransmissionLine } from "../api/metrics";
import { fetchNetwork, fetchNetworks } from "../api/networks";
import { buildSystemBreakdowns, groupSystemLines, removeLineFromNetworks, segmentStats, systemAssets } from "../lib/transmissionSystems";
import { downloadCsv } from "../lib/exportCsv";
import { recordsToCsv } from "../lib/operatorTables";
import { ENTITY_TYPE_COLORS } from "../cytoscape/buildCyStyle";
import { useStatusItems } from "../components/StatusBar";
import TabStripBoundary from "../tabs/components/TabStripBoundary";
import { useTabShortcuts } from "../tabs/hooks/useTabShortcuts";
import SystemTabs from "../transmission/systemTabs/SystemTabs";
import { useSystemTabStore } from "../transmission/systemTabs/systemTabStore";
import { systemTabController } from "../transmission/systemTabs/systemTabControllerInstance";
import TransmissionSystemDetail from "./TransmissionSystemDetail";
import "./ProductionPlantList.css";
import "./TransmissionSystemDetail.css";

// Transmission → Systems, structured like Production / Demand / Pump stations:
// a permanent "All Systems" tab with the systems table, and a tab per opened
// system showing its detail page. Systems are assembled from the registered
// lines, every saved network's tagged pipes, and the asset registry.

const PIPE_COLOUR = "#5b7ca3";
const fmtKm = (v) => (v ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "—");

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

const EXPORT_COLUMNS = [
  { key: "id", label: "System ID", get: (r) => r.system.id },
  { key: "name", label: "Transmission system", get: (r) => r.system.name || "" },
  { key: "networks", label: "Networks", get: (r) => r.breakdown.networkIds.size },
  { key: "lines", label: "Registered lines", get: (r) => r.breakdown.lineIds.size },
  { key: "segments", label: "Segments", get: (r) => r.stats.count },
  { key: "length", label: "Length (km)", get: (r) => (r.stats.hasLength ? r.stats.length : "") },
  { key: "plants", label: "Plants", get: (r) => r.assets.plant.length },
  { key: "gates", label: "City gates", get: (r) => r.assets.handover_point.length },
  { key: "pumps", label: "Pump stations", get: (r) => r.assets.pump.length },
  { key: "tanks", label: "Tanks", get: (r) => r.assets.tank.length },
];

export default function TransmissionSystemsView() {
  const navigate = useNavigate();
  const { systemId } = useParams();
  const [searchParams] = useSearchParams();

  const activeTabId = useSystemTabStore((state) => state.activeTabId);
  const activeTab = useSystemTabStore((state) => (state.activeTabId ? state.tabs[state.activeTabId] ?? null : null));

  // This strip owns the URL while the systems view is showing.
  useEffect(() => {
    systemTabController.registerNavigator({ replace: (path) => navigate(path, { replace: true }) });
    systemTabController.syncUrl();
    return () => systemTabController.detach();
  }, [navigate]);

  useEffect(() => {
    systemTabController.restoreSessionOnce(systemId ?? null, searchParams.get("tab"));
    // Deep-link intent, read once (as the other strips do).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useTabShortcuts(systemTabController);

  // ── Data ────────────────────────────────────────────────────────────────
  const [systems, setSystems] = useState([]);
  const [lines, setLines] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [registry, setRegistry] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [deletingLineId, setDeletingLineId] = useState(null);
  const [lineDeleteError, setLineDeleteError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchTransmissionSystems(),
      fetchTransmissionLines().catch(() => ({ lines: [] })),
      fetchNetworks().then((data) => Promise.all((data.networks || []).map((n) => fetchNetwork(n.id)))),
      fetchAssets({ limit: 5000 }).catch(() => ({ assets: [] })),
    ])
      .then(([sys, ln, nets, assets]) => {
        if (!alive) return;
        setSystems(sys.systems || []);
        setLines(ln.lines || []);
        setNetworks(nets);
        setRegistry(assets.assets || []);
      })
      .catch((e) => alive && setError(e.message || "Failed to load transmission systems"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const breakdowns = useMemo(() => buildSystemBreakdowns({ systems, lines, networks }), [systems, lines, networks]);
  const registryById = useMemo(() => new Map(registry.map((a) => [a.id, a])), [registry]);
  const networksById = useMemo(() => new Map(networks.map((n) => [n.id, n])), [networks]);

  const rows = useMemo(() => Array.from(breakdowns.values()).map((breakdown) => ({
    system: breakdown.system,
    breakdown,
    stats: segmentStats(breakdown.pipes),
    assets: systemAssets(breakdown, registryById),
  })).sort((a, b) => String(a.system.name || a.system.id).localeCompare(String(b.system.name || b.system.id))), [breakdowns, registryById]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.system.name, r.system.id, ...Array.from(r.breakdown.networkIds).map((id) => networksById.get(id)?.name)]
      .filter(Boolean)
      .some((f) => String(f).toLowerCase().includes(q)));
  }, [rows, query, networksById]);

  const totals = useMemo(() => {
    const networkIds = new Set();
    let lineCount = 0;
    let segments = 0;
    let length = 0;
    rows.forEach((r) => {
      r.breakdown.networkIds.forEach((id) => networkIds.add(id));
      lineCount += r.breakdown.lineIds.size;
      segments += r.stats.count;
      length += r.stats.length;
    });
    return { systems: rows.length, networks: networkIds.size, lines: lineCount, segments, length };
  }, [rows]);

  const footerItems = useMemo(() => (rows.length ? {
    left: [
      { label: "Systems", value: totals.systems, tone: "neutral" },
      { label: "Lines", value: totals.lines, tone: "acc" },
      { label: "Segments", value: totals.segments, tone: "neutral" },
    ],
    right: [{ label: "Total length", value: `${fmtKm(totals.length)} km` }],
  } : null), [rows.length, totals]);
  useStatusItems(footerItems);

  const openSystem = useCallback((row) => {
    systemTabController.openRecord(row.system.id, row.system.name || row.system.id);
  }, []);

  const handleDeleteLine = async (line, label) => {
    if (!line?.id || deletingLineId) return;
    if (!window.confirm(`Delete "${label}"? This removes it from canvas segments too.`)) return;
    setDeletingLineId(line.id);
    setLineDeleteError(null);
    try {
      await deleteTransmissionLine(line.id);
      setLines((prev) => prev
        .filter((item) => item.id !== line.id)
        .map((item) => (item.parentLineId === line.id ? { ...item, parentLineId: null } : item)));
      setNetworks((prev) => removeLineFromNetworks(prev, line.id));
    } catch (err) {
      setLineDeleteError(err.message || "Failed to delete transmission line");
    } finally {
      setDeletingLineId(null);
    }
  };

  const exportRows = () => downloadCsv("widispatch-transmission-systems.csv", recordsToCsv(filtered, EXPORT_COLUMNS));

  // ── Render ──────────────────────────────────────────────────────────────
  const detailBreakdown = activeTab?.key ? breakdowns.get(activeTab.key) : null;

  return (
    <>
      <TabStripBoundary>
        <SystemTabs />
      </TabStripBoundary>

      {activeTab?.key ? (
        <TransmissionSystemDetail
          key={activeTab.id}
          systemId={activeTab.key}
          loading={loading}
          error={error}
          breakdown={detailBreakdown}
          lineGroups={groupSystemLines(detailBreakdown, lines)}
          lines={lines}
          assets={systemAssets(detailBreakdown, registryById)}
          networksById={networksById}
          subTab={activeTab.state.subTab}
          onSubTabChange={(next) => activeTabId && systemTabController.setSubTab(activeTabId, next)}
          onBack={() => activeTabId && systemTabController.closeTab(activeTabId)}
          onTitle={(name) => activeTabId && systemTabController.adoptTitle(activeTabId, name)}
          onDeleteLine={handleDeleteLine}
          deletingLineId={deletingLineId}
          lineDeleteError={lineDeleteError}
        />
      ) : (
        <main className="ppl ppl--compact transmission-systems">
          <div className="ppl-kpis">
            <Kpi icon={NetworkIcon} colour={PIPE_COLOUR} label="Transmission systems" value={totals.systems}
              sub={`${totals.networks} network${totals.networks === 1 ? "" : "s"} reference them`} />
            <Kpi icon={Route} label="Registered lines" value={totals.lines} sub="Lines and branches" />
            <Kpi icon={Spline} colour={PIPE_COLOUR} label="Canvas segments" value={totals.segments} sub="Pipes assigned to a system" />
            <Kpi icon={Route} tone="ok" label="Total length" value={fmtKm(totals.length)} unit="km" sub="Across all systems" />
          </div>

          <div className="ppl__panel">
            <header className="ppl__toolbar-row">
              <label className="ppl__search-wrap">
                <SearchIcon size={14} />
                <input
                  className="ppl__search"
                  aria-label="Search transmission systems"
                  placeholder="Search systems by name, ID or network…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <span className="ppl__result-count">{loading ? "Loading…" : `${filtered.length} of ${rows.length} systems`}</span>
              <button type="button" className="ppl__toolbar-btn" onClick={exportRows} disabled={!filtered.length}>
                <Download size={13} /> Export CSV
              </button>
            </header>

            {error && <div className="ppl__state ppl__state--err">Failed to load transmission systems: {error}</div>}
            {loading && !error && <div className="ppl__state">Loading transmission systems…</div>}

            {!loading && !error && (
              <div className="ppl__table-wrap">
                <table className="ppl__table tsl-table">
                  <thead>
                    <tr>
                      <th>System ID</th>
                      <th>Transmission system</th>
                      <th className="ta-r">Lines</th>
                      <th className="ta-r">Segments</th>
                      <th className="ta-r">Length (km)</th>
                      <th className="ta-r"><span className="tsl-head" style={{ "--tsl-colour": ENTITY_TYPE_COLORS.plant }}><Factory size={12} /> Plants</span></th>
                      <th className="ta-r"><span className="tsl-head" style={{ "--tsl-colour": ENTITY_TYPE_COLORS.handover_point }}><MapPinned size={12} /> City gates</span></th>
                      <th className="ta-r"><span className="tsl-head" style={{ "--tsl-colour": ENTITY_TYPE_COLORS.pump }}><Droplets size={12} /> Pump stations</span></th>
                      <th className="ta-r"><span className="tsl-head" style={{ "--tsl-colour": ENTITY_TYPE_COLORS.tank }}><Cylinder size={12} /> Tanks</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => {
                      const networkNames = Array.from(row.breakdown.networkIds).map((id) => networksById.get(id)?.name || id);
                      return (
                        <tr
                          key={row.system.id}
                          role="link"
                          tabIndex={0}
                          onClick={() => openSystem(row)}
                          onKeyDown={(e) => { if (e.key === "Enter") openSystem(row); }}
                        >
                          <td className="mono muted">{row.system.id}</td>
                          <td className="ppl__identity-cell">
                            <div className="ppl__name">{row.system.name || "Unnamed system"}</div>
                            <div className="ppl__city">{networkNames.length ? networkNames.join(", ") : "Not on any saved network yet"}</div>
                          </td>
                          <td className="ta-r mono">{row.breakdown.lineIds.size}</td>
                          <td className="ta-r mono">{row.stats.count}</td>
                          <td className="ta-r mono">{row.stats.hasLength ? fmtKm(row.stats.length) : "—"}</td>
                          <td className="ta-r mono">{row.assets.plant.length || "—"}</td>
                          <td className="ta-r mono">{row.assets.handover_point.length || "—"}</td>
                          <td className="ta-r mono">{row.assets.pump.length || "—"}</td>
                          <td className="ta-r mono">{row.assets.tank.length || "—"}</td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={9} className="ppl__empty">No transmission systems found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      )}
    </>
  );
}
