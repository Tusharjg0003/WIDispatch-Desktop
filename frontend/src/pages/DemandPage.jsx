import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import DemandCityGateList from "./DemandCityGateList";
import DemandCityGateDetail from "./DemandCityGateDetail";
import DemandTabs from "../demand/tabs/DemandTabs";
import TabStripBoundary from "../tabs/components/TabStripBoundary";
import { useDemandTabStore } from "../demand/tabs/demandTabStore";
import { demandTabController } from "../demand/tabs/demandTabControllerInstance";
import { useTabShortcuts } from "../tabs/hooks/useTabShortcuts";
import { fetchCityGates } from "../api/demand";
import { useStatusItems } from "../components/StatusBar";
import "./ProductionPage.css";

// Status-bar metrics: city gates by lifecycle status and contracted demand of
// the operational ones (the Demand counterpart of Production's footer).
function useDemandStatusItems() {
  const [gates, setGates] = useState([]);
  useEffect(() => {
    let alive = true;
    fetchCityGates()
      .then((data) => { if (alive) setGates(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const items = useMemo(() => {
    if (!gates.length) return null;
    const count = (status) => gates.filter((gate) => String(gate.status || "").toLowerCase() === status).length;
    const contracted = gates
      .filter((gate) => String(gate.status || "").toLowerCase() === "operational")
      .reduce((sum, gate) => sum + (Number(gate.specifications?.contracted_capacity) || 0), 0);
    return {
      left: [
        { label: "City gates", value: gates.length, tone: "neutral" },
        { label: "Operational", value: count("operational"), tone: "ok" },
        { label: "Maintenance", value: count("maintenance"), tone: "warn" },
        { label: "Offline", value: count("offline"), tone: "err" },
      ],
      right: [{ label: "Contracted demand", value: `${(contracted / 1000).toLocaleString()} K m³/day` }],
    };
  }, [gates]);

  useStatusItems(items);
}

export default function DemandPage() {
  useDemandStatusItems();
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
          onBack={() => activeTabId && demandTabController.closeTab(activeTabId)}
          onGateLoaded={adoptTitle}
        />
      ) : (
        <DemandCityGateList onOpenGate={openGate} />
      )}
    </div>
  );
}
