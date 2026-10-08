import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Archive, List, Map, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { fetchAssets, fetchAsset } from "../api/metrics";
import { computeCategoryKpis } from "../lib/assetFilters";
import { filterAllowedAssets } from "../lib/assetTypes";
import { assetsToCsv, downloadCsv } from "../lib/exportCsv";
import AssetListView from "../components/AssetListView";
import AssetMapView from "../components/AssetMapView";
import AssetKpiCards from "../components/AssetKpiCards";
import AssetHelpModal from "../components/AssetHelpModal";
import AssetRegistrySidebar from "../components/AssetRegistrySidebar";
import AssetForm from "../components/AssetForm";
import WorkspaceHeader, { WorkspaceHeaderButton } from "../components/WorkspaceHeader";
import "../components/MetricDashboard.css";
import "./AssetRegistryPage.css";
// After the page stylesheet, so the form rules keep their old cascade position.
import "../components/assetFormFields.css";

export default function AssetRegistryPage({ mode = "list" }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const isPhoneViewport = () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  const [view, setView] = useState(() => isPhoneViewport() ? "list" : "map"); // "list" | "map"
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [railOpen, setRailOpen] = useState(() => !isPhoneViewport());

  const [editAsset, setEditAsset] = useState(null);
  const [editError, setEditError] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const phoneQuery = window.matchMedia("(max-width: 640px)");
    const collapseForPhone = (event) => {
      if (event.matches) {
        setRailOpen(false);
        setView("list");
      }
    };
    phoneQuery.addEventListener?.("change", collapseForPhone);
    return () => phoneQuery.removeEventListener?.("change", collapseForPhone);
  }, []);

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
  }, [mode]);

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

  const visibleAssets = useMemo(() => filterAllowedAssets(assets), [assets]);
  const kpis = useMemo(() => computeCategoryKpis(visibleAssets), [visibleAssets]);

  const openView = (a) => navigate(`/asset-registry/view/${encodeURIComponent(a.id)}`);
  const openEdit = (a) => navigate(`/asset-registry/edit/${encodeURIComponent(a.id)}`);
  const exportCsv = () => downloadCsv("asset-registry.csv", assetsToCsv(visibleAssets));

  const statusText = mode === "create" ? "Create" : mode === "edit" ? "Edit" : `${visibleAssets.length} assets`;

  return (
    <div className={`ar-shell ${railOpen ? "" : "ar-shell--rail-collapsed"}`.trim()}>
      {railOpen && <aside className="ar-rail">
        <AssetRegistrySidebar
          view={view}
          onShowMap={() => setView("map")}
          onShowList={() => setView("list")}
          onCreate={() => navigate("/asset-registry/create")}
          onShowHelp={() => setShowHelp(true)}
          onExport={exportCsv}
        />
      </aside>}

      <div className="metric ar-page assets-tagging-page page-transition">
        <WorkspaceHeader
          title="Asset Registry"
          subtitle="Dispatch · Registry"
          icon={Archive}
          status={statusText}
          statusTone={mode === "list" ? "green" : "blue"}
          actions={mode === "list" ? [
            <WorkspaceHeaderButton key="rail" icon={railOpen ? PanelLeftClose : PanelLeftOpen} onClick={() => setRailOpen((value) => !value)}>{railOpen ? "Hide browse" : "Show browse"}</WorkspaceHeaderButton>,
            <WorkspaceHeaderButton key="map" icon={Map} tone={view === "map" ? "primary" : "default"} onClick={() => setView("map")}>Map</WorkspaceHeaderButton>,
            <WorkspaceHeaderButton key="list" icon={List} tone={view === "list" ? "primary" : "default"} onClick={() => setView("list")}>List</WorkspaceHeaderButton>,
          ] : undefined}
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

            {error && <div className="metric__notice metric__notice--error">{error}</div>}
            {loading && <div className="metric__notice">Loading assets…</div>}

            {!loading && !error && (
              view === "list"
                ? <AssetListView assets={visibleAssets} onView={openView} onEdit={openEdit} />
                : <AssetMapView assets={visibleAssets} onView={openView} onEdit={openEdit} />
            )}
          </>
        )}

        {showHelp && <AssetHelpModal onClose={() => setShowHelp(false)} />}
      </div>
    </div>
  );
}
