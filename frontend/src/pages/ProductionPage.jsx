import React, { useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import ProductionPlantList from "./ProductionPlantList";
import ProductionPlantDetail from "./ProductionPlantDetail";
import ProductionTabs from "../production/tabs/ProductionTabs";
import TabStripBoundary from "../tabs/components/TabStripBoundary";
import { useProductionTabStore } from "../production/tabs/productionTabStore";
import { productionTabController } from "../production/tabs/productionTabControllerInstance";

export default function ProductionPage() {
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
  }, [navigate]);

  // The route is deep-link INTENT, read once. Keeping it out of the dependency
  // list is what stops a tab switch — which rewrites the URL — from restarting
  // the session it just mirrored.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    productionTabController.restoreSession(
      plantId ? decodeURIComponent(plantId) : null,
      searchParams.get("tab")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          onPlantLoaded={adoptTitle}
        />
      ) : (
        <ProductionPlantList onOpenPlant={openPlant} />
      )}
    </div>
  );
}
