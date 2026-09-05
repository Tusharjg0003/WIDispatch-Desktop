import React, { useCallback, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import ProductionPlantList from "./ProductionPlantList";
import ProductionPlantDetail from "./ProductionPlantDetail";
import ProductionTabs from "../production/tabs/ProductionTabs";
import TabStripBoundary from "../tabs/components/TabStripBoundary";
import { useProductionTabStore } from "../production/tabs/productionTabStore";
import { productionTabController } from "../production/tabs/productionTabControllerInstance";
import { useTabShortcuts } from "../tabs/hooks/useTabShortcuts";
import "./ProductionPage.css";

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
          onPlantLoaded={adoptTitle}
        />
      ) : (
        <ProductionPlantList onOpenPlant={openPlant} />
      )}
    </div>
  );
}
