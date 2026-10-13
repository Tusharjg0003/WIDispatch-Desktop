import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Archive, FilePen, FilePlus2, List, Map, PanelLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { notifyDataChanged, onDataChanged } from "../windows/tabWindows";
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
import { useStatusItems } from "../components/StatusBar";
import TabStripBoundary from "../tabs/components/TabStripBoundary";
import { useTabShortcuts } from "../tabs/hooks/useTabShortcuts";
import AssetRegistryTabs from "../assetRegistry/tabs/AssetRegistryTabs";
import { useAssetTabStore } from "../assetRegistry/tabs/assetTabStore";
import { assetTabController, openNewAssetTab } from "../assetRegistry/tabs/assetTabControllerInstance";
import { isNewAssetKey } from "../assetRegistry/tabs/assetTab.types";
import { AssetDetailView } from "./AssetDetailPage";
import "../components/MetricDashboard.css";
import "./AssetRegistryPage.css";
// After the page stylesheet, so the form rules keep their old cascade position.
import "../components/assetFormFields.css";

// Asset Registry with tabs (Production model): a permanent "All Assets" tab
// (KPIs + map / list), then a tab per opened asset — its view page, or on the
// `edit` sub-tab its form — and "New asset" tabs. Open asset tabs stay mounted
// while hidden, so a half-filled form survives switching tabs.

// Header card above the create / edit form (same build as the side panels'
// header cards: icon tile, eyebrow, title, one-line subtitle).
function FormHeading({ icon: Icon, eyebrow, title, subtitle }) {
  return (
    <header className="ar-form__head">
      <span className="ar-form__icon" aria-hidden="true"><Icon size={18} /></span>
      <div className="ar-form__titles">
        <span className="ar-form__eyebrow">{eyebrow}</span>
        <h2 className="ar-form__title">{title}</h2>
        {subtitle && <span className="ar-form__subtitle">{subtitle}</span>}
      </div>
    </header>
  );
}

/** Edit form for one asset (fetches it to seed the form). */
function AssetEditPane({ assetId, onSaved, onCancel, onDirtyChange, onLoaded }) {
  const [asset, setAsset] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setError(null);
    fetchAsset(assetId)
      .then((a) => {
        if (cancelled) return;
        setAsset(a);
        onLoaded?.(a);
      })
      .catch((e) => !cancelled && setError(e.message || "Couldn't load asset"));
    return () => { cancelled = true; };
  }, [assetId]);
  return (
    <section className="ar-form">
      <FormHeading
        icon={FilePen}
        eyebrow="Asset registry"
        title={asset ? `Edit ${asset.name || asset.id}` : "Edit asset"}
        subtitle={asset ? asset.generated_id || asset.id : "Loading…"}
      />
      {error && <div className="metric__notice metric__notice--error">{error}</div>}
      {!asset && !error && <div className="metric__notice">Loading asset…</div>}
      {asset && (
        <AssetForm mode="edit" initialAsset={asset} onSaved={onSaved} onCancel={onCancel} onDirtyChange={onDirtyChange} />
      )}
    </section>
  );
}

/** One asset tab's content: view page, edit form, or the new-asset form. */
function AssetTabPane({ tab, onListChanged }) {
  const [reloadKey, setReloadKey] = useState(0);
  const isNew = isNewAssetKey(tab.key);
  const setDirty = useCallback((dirty) => {
    const current = assetTabController.findByKey(tab.key);
    if (current && Boolean(current.state.dirty) !== dirty) assetTabController.setTabState(current.id, { dirty });
  }, [tab.key]);

  if (isNew) {
    return (
      <div className="metric ar-page ar-record">
        <section className="ar-form">
          <FormHeading
            icon={FilePlus2}
            eyebrow="Asset registry"
            title="New asset"
            subtitle="Pick the category, activity and type, then place it on the map."
          />
          <AssetForm
            mode="create"
            onDirtyChange={setDirty}
            onSaved={(created) => {
              // The tab becomes the new asset's tab, on its view page.
              assetTabController.rekeyTab(tab.id, created.id, created.name || created.id, { subTab: "view", dirty: false });
              onListChanged();
            }}
            onCancel={() => assetTabController.closeTab(tab.id, { force: true })}
          />
        </section>
      </div>
    );
  }

  if (tab.state.subTab === "edit") {
    return (
      <div className="metric ar-page ar-record">
        <AssetEditPane
          assetId={tab.key}
          onDirtyChange={setDirty}
          onLoaded={(a) => assetTabController.adoptTitle(tab.id, a.name || a.id)}
          onSaved={() => {
            assetTabController.setTabState(tab.id, { subTab: "view", dirty: false });
            setReloadKey((k) => k + 1);
            onListChanged();
          }}
          onCancel={() => {
            const current = assetTabController.findByKey(tab.key);
            if (current?.state.dirty && !window.confirm(`Discard unsaved changes to "${tab.title}"?`)) return;
            assetTabController.setTabState(tab.id, { subTab: "view", dirty: false });
          }}
        />
      </div>
    );
  }

  return (
    <div className="ar-record ar-record--view">
      <AssetDetailView
        assetId={tab.key}
        reloadKey={reloadKey}
        onLoaded={(asset) => asset?.name && assetTabController.adoptTitle(tab.id, asset.name)}
        onBack={() => assetTabController.closeTab(tab.id)}
        onEdit={() => assetTabController.setSubTab(tab.id, "edit")}
        onDeleted={() => {
          assetTabController.closeByKey(tab.key);
          onListChanged();
        }}
      />
    </div>
  );
}

export default function AssetRegistryPage({ mode = "list" }) {
  const { id: routeId } = useParams();
  const navigate = useNavigate();

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const order = useAssetTabStore((state) => state.order);
  const tabs = useAssetTabStore((state) => state.tabs);
  const activeTabId = useAssetTabStore((state) => state.activeTabId);
  const activeTab = activeTabId ? tabs[activeTabId] ?? null : null;
  const onListTab = !activeTab || activeTab.permanent;

  useEffect(() => {
    assetTabController.registerNavigator({ replace: (path) => navigate(path, { replace: true }) });
    assetTabController.syncUrl();
    return () => assetTabController.detach();
  }, [navigate]);

  useEffect(() => {
    // Deep link: /view/:id, /edit/:id or /create (read once, like the other strips).
    const sub = mode === "edit" ? "edit" : mode === "view" ? "view" : null;
    assetTabController.restoreSessionOnce(routeId && sub ? routeId : null, sub);
    // Links from other pages open their asset even after an earlier restore.
    if (routeId && sub) {
      const existing = assetTabController.findByKey(routeId);
      if (!existing || assetTabController.getActiveTab()?.key !== routeId || existing.state.subTab !== sub) {
        assetTabController.openRecord(routeId, routeId, { subTab: sub });
      }
    } else if (mode === "create" && !isNewAssetKey(assetTabController.getActiveTab()?.key)) {
      openNewAssetTab();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useTabShortcuts(assetTabController);

  // ── Registry data ─────────────────────────────────────────────────────────
  const isPhoneViewport = () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches;
  const [view, setView] = useState(() => isPhoneViewport() ? "list" : "map"); // "list" | "map"
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [railOpen, setRailOpen] = useState(() => !isPhoneViewport());
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshList = useCallback(() => setRefreshKey((k) => k + 1), []);
  // Saved here: refresh, and tell any other window (an asset taken out into
  // its own window, or the main one) to refresh too.
  const listChanged = useCallback(() => {
    refreshList();
    notifyDataChanged("asset-registry");
  }, [refreshList]);
  useEffect(() => onDataChanged("asset-registry", refreshList), [refreshList]);

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

  // The full registry (all categories); filtering is client-side. Reloads after a save / create / delete.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAssets({ limit: 5000 })
      .then((d) => !cancelled && setAssets(d.assets || []))
      .catch((e) => !cancelled && setError(e.message || "Couldn't load assets"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [refreshKey]);

  const visibleAssets = useMemo(() => filterAllowedAssets(assets), [assets]);
  const kpis = useMemo(() => computeCategoryKpis(visibleAssets), [visibleAssets]);

  const openView = (a) => assetTabController.openRecord(a.id, a.name || a.id, { subTab: "view" });
  const openEdit = (a) => assetTabController.openRecord(a.id, a.name || a.id, { subTab: "edit" });
  const exportCsv = () => downloadCsv("asset-registry.csv", assetsToCsv(visibleAssets));

  // Footer: registry counts by lifecycle, plus the browse-list toggle.
  const statusItems = useMemo(() => {
    const count = (s) => visibleAssets.filter((a) => String(a.status || "").toLowerCase() === s).length;
    return {
      left: visibleAssets.length ? [
        { label: "Assets", value: visibleAssets.length, tone: "neutral" },
        { label: "Operational", value: count("operational"), tone: "ok" },
        { label: "Maintenance", value: count("maintenance"), tone: "warn" },
        { label: "Planned / building", value: count("planned") + count("under_construction"), tone: "acc" },
      ] : [],
      trailing: [{
        id: "ar-rail",
        label: "Asset list",
        title: railOpen ? "Hide the asset list" : "Show the asset list",
        icon: PanelLeft,
        pressed: railOpen,
        onClick: () => setRailOpen((v) => !v),
      }],
    };
  }, [visibleAssets, railOpen]);
  useStatusItems(statusItems);

  const recordTabs = order.map((id) => tabs[id]).filter((t) => t && !t.permanent && t.key);

  return (
    <div className="ar-root">
      <TabStripBoundary>
        <AssetRegistryTabs />
      </TabStripBoundary>

      <div className={`ar-shell ${railOpen ? "" : "ar-shell--rail-collapsed"}`.trim()}>
        {railOpen && <aside className="ar-rail">
          <AssetRegistrySidebar
            view={view}
            onShowMap={() => { setView("map"); assetTabController.activateTab(order[0]); }}
            onShowList={() => { setView("list"); assetTabController.activateTab(order[0]); }}
            onCreate={() => openNewAssetTab()}
            onShowHelp={() => setShowHelp(true)}
            onExport={exportCsv}
            onOpenAsset={openView}
            refreshKey={refreshKey}
          />
        </aside>}

        {onListTab && (
          <div className="metric ar-page assets-tagging-page page-transition">
            <WorkspaceHeader
              title="Asset Registry"
              subtitle="Dispatch · Registry"
              icon={Archive}
              status={`${visibleAssets.length} assets`}
              statusTone="green"
              actions={[
                <WorkspaceHeaderButton key="rail" icon={railOpen ? PanelLeftClose : PanelLeftOpen} onClick={() => setRailOpen((value) => !value)}>{railOpen ? "Hide list" : "Show list"}</WorkspaceHeaderButton>,
                <div key="view" className="ar-viewtoggle" role="group" aria-label="View mode">
                  <button type="button" className={view === "map" ? "is-active" : ""} aria-pressed={view === "map"} onClick={() => setView("map")}><Map size={13} aria-hidden="true" /> Map</button>
                  <button type="button" className={view === "list" ? "is-active" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}><List size={13} aria-hidden="true" /> List</button>
                </div>,
              ]}
            />

            <AssetKpiCards kpis={kpis} />

            {error && <div className="metric__notice metric__notice--error">{error}</div>}
            {loading && <div className="metric__notice">Loading assets…</div>}

            {!loading && !error && (
              view === "list"
                ? <AssetListView assets={visibleAssets} onView={openView} onEdit={openEdit} />
                : <AssetMapView assets={visibleAssets} onView={openView} onEdit={openEdit} />
            )}
          </div>
        )}

        {/* Every open asset tab stays mounted; only the active one shows. */}
        {recordTabs.map((tab) => (
          <div key={tab.id} className="ar-tabpane" hidden={tab.id !== activeTabId}>
            <AssetTabPane tab={tab} onListChanged={listChanged} />
          </div>
        ))}

        {showHelp && <AssetHelpModal onClose={() => setShowHelp(false)} />}
      </div>
    </div>
  );
}
