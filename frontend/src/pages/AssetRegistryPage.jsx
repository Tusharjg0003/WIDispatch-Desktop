import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Archive } from "lucide-react";
import { fetchAssets } from "../api/metrics";
import AssetListView from "../components/AssetListView";
import AssetMapView from "../components/AssetMapView";
import AssetKpiCards from "../components/AssetKpiCards";
import AssetRegistrySidebar from "../components/AssetRegistrySidebar";
import CreateAssetForm from "../components/CreateAssetForm";
import WorkspaceHeader from "../components/WorkspaceHeader";
import "../components/MetricDashboard.css";
import "./AssetRegistryPage.css";

const ASSET_TABS = [
  { key: "plant", label: "Plants" },
  { key: "pump", label: "Pump Stations" },
  { key: "handover_point", label: "Handover Points" },
];
const STATUSES = ["operational", "maintenance", "under_construction", "planned", "decommissioned"];
const statusLabel = (s) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const VALID_TABS = [...ASSET_TABS.map((t) => t.key), "create"];

export default function AssetRegistryPage() {
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();
  const tab = VALID_TABS.includes(tabParam) ? tabParam : "plant";
  const goTab = (t) => navigate(`/asset-registry/${t}`);

  const [view, setView] = useState("map"); // "list" | "map"
  const [filters, setFilters] = useState({ status: "", q: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const isAssetTab = tab !== "create";
  const openAsset = (asset) => navigate(`/asset-registry/view/${encodeURIComponent(asset.id)}`);

  useEffect(() => {
    if (!isAssetTab) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAssets({ category: tab, status: filters.status, q: filters.q, limit: 5000 })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message || "Couldn't load assets"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [tab, filters.status, filters.q, reloadKey, isAssetTab]);

  const k = data?.kpis;

  return (
    <div className="ar-shell">
      <aside className="ar-rail">
        <AssetRegistrySidebar
          view={view}
          onShowMap={() => setView("map")}
          onShowList={() => setView("list")}
          onCreate={() => goTab("create")}
        />
      </aside>

      <div className="metric ar-page page-transition">
        <WorkspaceHeader
          title="Asset Registry"
          subtitle="Dispatch · Registry"
          icon={Archive}
          status={tab === "create" ? "Create" : ASSET_TABS.find((t) => t.key === tab)?.label}
          statusTone={tab === "create" ? "blue" : "green"}
        />

        {/* Sub-tabs */}
        <div className="ar-tabs">
          {ASSET_TABS.map((t) => (
            <button
              key={t.key}
              className={`ar-tab ${tab === t.key ? "is-active" : ""}`}
              onClick={() => goTab(t.key)}
            >
              {t.label}
              {k && <span className="ar-tab__count">{k.byCategory[t.key]}</span>}
            </button>
          ))}
          <button
            className={`ar-tab ar-tab--cta ${tab === "create" ? "is-active" : ""}`}
            onClick={() => goTab("create")}
          >
            + Create Asset
          </button>
        </div>

        {/* Create sub-tab */}
        {tab === "create" && (
          <section className="sheet">
            <header className="sheet__head sheet__head--simple">
              <h2 className="sheet__name sheet__name--sm">New Asset</h2>
            </header>
            <CreateAssetForm onCreated={() => setReloadKey((n) => n + 1)} />
          </section>
        )}

        {/* Asset sub-tabs */}
        {isAssetTab && (
          <>
            <AssetKpiCards kpis={k} />

            <div className="ar-toolbar">
              <div className="metric__filters">
                <label>
                  <span>Status</span>
                  <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                    <option value="">All</option>
                    {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                </label>
                <label>
                  <span>Search</span>
                  <input type="search" value={filters.q} placeholder="Name or ID"
                    onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
                </label>
              </div>
            </div>

            {error && <div className="metric__notice metric__notice--error">{error}</div>}
            {loading && <div className="metric__notice">Loading assets…</div>}

            {!loading && !error && data && (
              <section className="sheet">
                <header className="sheet__head sheet__head--simple">
                  <h2 className="sheet__name sheet__name--sm">
                    {ASSET_TABS.find((t) => t.key === tab)?.label}
                    <span className="sheet__count">
                      {data.assets.length}{data.total > data.assets.length ? ` / ${data.total}` : ""}
                    </span>
                  </h2>
                </header>
                {view === "list"
                  ? <AssetListView assets={data.assets} onSelect={openAsset} />
                  : <AssetMapView assets={data.assets} onSelect={openAsset} />}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
