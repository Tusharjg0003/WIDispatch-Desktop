import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Archive } from "lucide-react";
import { fetchAssets, fetchAsset } from "../api/metrics";
import { deriveFilterOptions, applyAssetFilters, computeCategoryKpis } from "../lib/assetFilters";
import { assetsToCsv, downloadCsv } from "../lib/exportCsv";
import AssetListView from "../components/AssetListView";
import AssetMapView from "../components/AssetMapView";
import AssetKpiCards from "../components/AssetKpiCards";
import AssetHelpModal from "../components/AssetHelpModal";
import AssetRegistrySidebar from "../components/AssetRegistrySidebar";
import AssetForm from "../components/AssetForm";
import WorkspaceHeader from "../components/WorkspaceHeader";
import "../components/MetricDashboard.css";
import "./AssetRegistryPage.css";

const EMPTY_FILTERS = { activity: "", assetType: "", region: "", governorate: "", q: "" };

export default function AssetRegistryPage({ mode = "list" }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [view, setView] = useState("map"); // "list" | "map"
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const [editAsset, setEditAsset] = useState(null);
  const [editError, setEditError] = useState(null);

  // Load the full registry (all three categories) once; filtering is client-side.
  useEffect(() => {
    if (mode !== "list") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAssets({ limit: 5000 })
      .then((d) => !cancelled && setAssets(d.assets || []))
      .catch((e) => !cancelled && setError(e.message || "Couldn't load assets"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [mode, reloadKey]);

  // Edit mode: fetch the single asset to seed the form.
  useEffect(() => {
    if (mode !== "edit" || !id) return;
    let cancelled = false;
    setEditAsset(null);
    setEditError(null);
    fetchAsset(id)
      .then((a) => !cancelled && setEditAsset(a))
      .catch((e) => !cancelled && setEditError(e.message || "Couldn't load asset"));
    return () => { cancelled = true; };
  }, [mode, id]);

  // Cascade resets: changing a filter clears everything downstream of it.
  const onActivity = (v) => setFilters((f) => ({ ...f, activity: v, assetType: "", region: "", governorate: "" }));
  const onAssetType = (v) => setFilters((f) => ({ ...f, assetType: v, region: "", governorate: "" }));
  const onRegion = (v) => setFilters((f) => ({ ...f, region: v, governorate: "" }));
  const onGovernorate = (v) => setFilters((f) => ({ ...f, governorate: v }));
  const onSearch = (v) => setFilters((f) => ({ ...f, q: v }));

  const options = useMemo(() => deriveFilterOptions(assets, filters), [assets, filters]);
  const filtered = useMemo(() => applyAssetFilters(assets, filters), [assets, filters]);
  const kpis = useMemo(() => computeCategoryKpis(filtered), [filtered]);

  const openView = (a) => navigate(`/asset-registry/view/${encodeURIComponent(a.id)}`);
  const openEdit = (a) => navigate(`/asset-registry/edit/${encodeURIComponent(a.id)}`);
  const exportCsv = () => downloadCsv("asset-registry-filtered.csv", assetsToCsv(filtered));

  const statusText = mode === "create" ? "Create" : mode === "edit" ? "Edit" : `${filtered.length} assets`;

  return (
    <div className="ar-shell">
      <aside className="ar-rail">
        <AssetRegistrySidebar
          view={view}
          onShowMap={() => setView("map")}
          onShowList={() => setView("list")}
          onCreate={() => navigate("/asset-registry/create")}
          onShowHelp={() => setShowHelp(true)}
          onExport={exportCsv}
        />
      </aside>

      <div className="metric ar-page assets-tagging-page page-transition">
        <WorkspaceHeader
          title="Asset Registry"
          subtitle="Dispatch · Registry"
          icon={Archive}
          status={statusText}
          statusTone={mode === "list" ? "green" : "blue"}
        />

        {mode === "create" && (
          <section className="sheet">
            <header className="sheet__head sheet__head--simple">
              <h2 className="sheet__name sheet__name--sm">New Asset</h2>
            </header>
            <AssetForm mode="create" onSaved={() => navigate("/asset-registry")} />
          </section>
        )}

        {mode === "edit" && (
          <section className="sheet">
            <header className="sheet__head sheet__head--simple">
              <h2 className="sheet__name sheet__name--sm">Edit Asset</h2>
            </header>
            {editError && <div className="metric__notice metric__notice--error">{editError}</div>}
            {!editAsset && !editError && <div className="metric__notice">Loading asset…</div>}
            {editAsset && <AssetForm mode="edit" initialAsset={editAsset} onSaved={() => navigate("/asset-registry")} />}
          </section>
        )}

        {mode === "list" && (
          <>
            <AssetKpiCards kpis={kpis} />

            <div className="ar-toolbar">
              <div className="metric__filters">
                <label>
                  <span>Activity</span>
                  <select value={filters.activity} onChange={(e) => onActivity(e.target.value)}>
                    <option value="">All</option>
                    {options.activities.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <label>
                  <span>Asset Type</span>
                  <select value={filters.assetType} onChange={(e) => onAssetType(e.target.value)}>
                    <option value="">All</option>
                    {options.assetTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label>
                  <span>Region</span>
                  <select value={filters.region} onChange={(e) => onRegion(e.target.value)}>
                    <option value="">All</option>
                    {options.regions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label>
                  <span>Governorate</span>
                  <select value={filters.governorate} onChange={(e) => onGovernorate(e.target.value)} disabled={!filters.region}>
                    <option value="">All</option>
                    {options.governorates.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </label>
                <label>
                  <span>Search</span>
                  <input type="search" value={filters.q} placeholder="Name or ID" onChange={(e) => onSearch(e.target.value)} />
                </label>
              </div>
            </div>

            {error && <div className="metric__notice metric__notice--error">{error}</div>}
            {loading && <div className="metric__notice">Loading assets…</div>}

            {!loading && !error && (
              view === "list"
                ? <AssetListView assets={filtered} onView={openView} onEdit={openEdit} />
                : <AssetMapView assets={filtered} onView={openView} onEdit={openEdit} />
            )}
          </>
        )}

        {showHelp && <AssetHelpModal onClose={() => setShowHelp(false)} />}
      </div>
    </div>
  );
}
