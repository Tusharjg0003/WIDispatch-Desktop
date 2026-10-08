import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import ProductionPlantList from "./ProductionPlantList";
import ProductionPlantDetail from "./ProductionPlantDetail";
import ProductionTabs from "../production/tabs/ProductionTabs";
import TabStripBoundary from "../tabs/components/TabStripBoundary";
import { useProductionTabStore } from "../production/tabs/productionTabStore";
import { productionTabController } from "../production/tabs/productionTabControllerInstance";
import { useTabShortcuts } from "../tabs/hooks/useTabShortcuts";
import { fetchProductionPlants } from "../api/production";
import { useStatusItems } from "../components/StatusBar";
import "./ProductionPage.css";

const parseDate = (value) => {
  if (!value || value === "NULL") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Status-bar metrics, computed exactly as WIDispatch-Production's
// components/layout/status-bar.tsx: plant counts by status, plus the design
// capacity active today (commissioned on/before today, not decommissioned).
function useProductionStatusItems() {
  const [plants, setPlants] = useState([]);
  useEffect(() => {
    let alive = true;
    fetchProductionPlants()
      .then((data) => { if (alive) setPlants(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const items = useMemo(() => {
    if (!plants.length) return null;
    const count = (status) => plants.filter((plant) => String(plant.status || "").toLowerCase() === status).length;
    const today = new Date();
    const totalCapacity = plants.reduce((sum, plant) => {
      const commissioned = parseDate(plant.commissioning_date);
      const decommissioned = parseDate(plant.decommissioning_date);
      const activeToday = !!commissioned && commissioned <= today && (!decommissioned || decommissioned > today);
      return activeToday ? sum + (plant.specifications?.contracted_capacity || 0) : sum;
    }, 0);
    return {
      left: [
        { label: "Total plants", value: plants.length, tone: "neutral" },
        { label: "Operational", value: count("operational"), tone: "ok" },
        { label: "Maintenance", value: count("maintenance"), tone: "warn" },
        { label: "Offline", value: count("offline"), tone: "err" },
      ],
      right: [{ label: "Total Design Capacity", value: `${(totalCapacity / 1000).toLocaleString()} K m³/day` }],
    };
  }, [plants]);

  useStatusItems(items);
}

export default function ProductionPage() {
  useProductionStatusItems();
  const navigate = useNavigate();
  const { plantId } = useParams();
  const [searchParams] = useSearchParams();

  const activeTabId = useProductionTabStore((state) => state.activeTabId);
  const activeTab = useProductionTabStore((state) =>
    state.activeTabId ? state.tabs[state.activeTabId] ?? null : null
  );

  useEffect(() => {
    productionTabController.registerNavigator({
      replace: (path) => navigate(path, { replace: true }),
    });
    // Without this, detach() is dead code: a navigate bound to an unmounted
    // page would stay registered and fire replace() into a stale history
    // entry after the page is gone.
    return () => productionTabController.detach();
  }, [navigate]);

  // The route is deep-link INTENT, read once. Keeping it out of the dependency
  // list is what stops a tab switch — which rewrites the URL — from restarting
  // the session it just mirrored. restoreSessionOnce (not restoreSession)
  // guards re-hydration itself, at the controller, so the module-scoped
  // controller's tabs survive this page remounting (e.g. navigating away and
  // back) rather than being cleared on every mount.
  useEffect(() => {
    productionTabController.restoreSessionOnce(
      // plantId already comes decoded from react-router; decoding it again
      // throws URIError on an id that legitimately contains a bare "%".
      plantId ?? null,
      searchParams.get("tab")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useTabShortcuts(productionTabController);

  const openPlant = useCallback((plant) => {
    productionTabController.openPlant(plant.id, plant.name || plant.id);
  }, []);

  const changeSubTab = useCallback(
    (next) => {
      if (activeTabId) productionTabController.setSubTab(activeTabId, next);
    },
    [activeTabId]
  );

  const adoptTitle = useCallback(
    (plant) => {
      if (activeTabId && plant?.name) {
        productionTabController.adoptTitle(activeTabId, plant.name);
      }
    },
    [activeTabId]
  );

  return (
    <div className="production-shell">
      <TabStripBoundary>
        <ProductionTabs />
      </TabStripBoundary>

      {/* Only the active tab renders: keeping every plant mounted would hold N
          bundles and issue N fetches to preserve state we deliberately do not
          preserve. */}
      {activeTab?.key ? (
        <ProductionPlantDetail
          key={activeTab.id}
          plantId={activeTab.key}
          subTab={activeTab.state.subTab}
          onSubTabChange={changeSubTab}
          onBack={() => activeTabId && productionTabController.closeTab(activeTabId)}
          onPlantLoaded={adoptTitle}
        />
      ) : (
        <ProductionPlantList onOpenPlant={openPlant} />
      )}
    </div>
  );
}
