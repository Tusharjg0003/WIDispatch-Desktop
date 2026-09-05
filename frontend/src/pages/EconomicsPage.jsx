import React, { useCallback, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import ProductionPlantList from "./ProductionPlantList";
import EconomicsPlantDetail from "./EconomicsPlantDetail";
import EconomicsTabs from "../economics/tabs/EconomicsTabs";
import TabStripBoundary from "../tabs/components/TabStripBoundary";
import { useEconomicsTabStore } from "../economics/tabs/economicsTabStore";
import { economicsTabController } from "../economics/tabs/economicsTabControllerInstance";
import { useTabShortcuts } from "../tabs/hooks/useTabShortcuts";
import "./ProductionPage.css";

export default function EconomicsPage() {
  const navigate = useNavigate();
  const { plantId } = useParams();
  const [searchParams] = useSearchParams();

  const activeTabId = useEconomicsTabStore((state) => state.activeTabId);
  const activeTab = useEconomicsTabStore((state) =>
    state.activeTabId ? state.tabs[state.activeTabId] ?? null : null
  );

  useEffect(() => {
    economicsTabController.registerNavigator({
      replace: (path) => navigate(path, { replace: true }),
    });
    return () => economicsTabController.detach();
  }, [navigate]);

  useEffect(() => {
    economicsTabController.restoreSessionOnce(
      plantId ?? null,
      searchParams.get("tab")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useTabShortcuts(economicsTabController);

  const openPlant = useCallback((plant) => {
    economicsTabController.openPlant(plant.id, plant.name || plant.id);
  }, []);

  const changeSubTab = useCallback(
    (next) => {
      if (activeTabId) economicsTabController.setSubTab(activeTabId, next);
    },
    [activeTabId]
  );

  const adoptTitle = useCallback(
    (plant) => {
      if (activeTabId && plant?.name) {
        economicsTabController.adoptTitle(activeTabId, plant.name);
      }
    },
    [activeTabId]
  );

  return (
    <div className="production-shell">
      <TabStripBoundary>
        <EconomicsTabs />
      </TabStripBoundary>

      {activeTab?.key ? (
        <EconomicsPlantDetail
          key={activeTab.id}
          plantId={activeTab.key}
          subTab={activeTab.state.subTab}
          onSubTabChange={changeSubTab}
          onPlantLoaded={adoptTitle}
        />
      ) : (
        <ProductionPlantList basePath="/economics" onOpenPlant={openPlant} />
      )}
    </div>
  );
}
