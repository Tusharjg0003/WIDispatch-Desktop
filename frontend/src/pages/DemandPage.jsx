import React, { useCallback, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import DemandCityGateList from "./DemandCityGateList";
import DemandCityGateDetail from "./DemandCityGateDetail";
import DemandTabs from "../demand/tabs/DemandTabs";
import TabStripBoundary from "../tabs/components/TabStripBoundary";
import { useDemandTabStore } from "../demand/tabs/demandTabStore";
import { demandTabController } from "../demand/tabs/demandTabControllerInstance";
import { useTabShortcuts } from "../tabs/hooks/useTabShortcuts";
import "./ProductionPage.css";

export default function DemandPage() {
  const navigate = useNavigate();
  const { cityGateId } = useParams();
  const [searchParams] = useSearchParams();

  const activeTabId = useDemandTabStore((state) => state.activeTabId);
  const activeTab = useDemandTabStore((state) =>
    state.activeTabId ? state.tabs[state.activeTabId] ?? null : null
  );

  useEffect(() => {
    demandTabController.registerNavigator({
      replace: (path) => navigate(path, { replace: true }),
    });
    return () => demandTabController.detach();
  }, [navigate]);

  useEffect(() => {
    demandTabController.restoreSessionOnce(
      cityGateId ?? null,
      searchParams.get("tab")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useTabShortcuts(demandTabController);

  const openGate = useCallback((gate) => {
    demandTabController.openGate(gate.id, gate.name || gate.id);
  }, []);

  const changeSubTab = useCallback(
    (next) => {
      if (activeTabId) demandTabController.setSubTab(activeTabId, next);
    },
    [activeTabId]
  );

  const adoptTitle = useCallback(
    (gate) => {
      if (activeTabId && gate?.name) {
        demandTabController.adoptTitle(activeTabId, gate.name);
      }
    },
    [activeTabId]
  );

  return (
    <div className="production-shell">
      <TabStripBoundary>
        <DemandTabs />
      </TabStripBoundary>

      {activeTab?.key ? (
        <DemandCityGateDetail
          key={activeTab.id}
          gateId={activeTab.key}
          subTab={activeTab.state.subTab}
          onSubTabChange={changeSubTab}
          onGateLoaded={adoptTitle}
        />
      ) : (
        <DemandCityGateList onOpenGate={openGate} />
      )}
    </div>
  );
}
