import React, { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { fetchCityGateBundle } from "../api/demand";
import DemandOverview from "../components/demand/DemandOverview";
import DemandInputTable from "../components/demand/DemandInputTable";
import QualityRecordList from "../components/production/QualityRecordList";
import MaintenanceRecordList from "../components/production/MaintenanceRecordList";
import OutageRecordList from "../components/production/OutageRecordList";
import "./ProductionPlantDetail.css";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "demand", label: "Demand" },
  { key: "quality", label: "Quality" },
  { key: "maintenance", label: "Maintenance" },
  { key: "outages", label: "Outages" },
];
const TAB_KEYS = new Set(TABS.map((tab) => tab.key));

export default function DemandCityGateDetail() {
  const { cityGateId: rawId } = useParams();
  const cityGateId = decodeURIComponent(rawId);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(TAB_KEYS.has(requestedTab) ? requestedTab : "overview");

  useEffect(() => {
    const nextTab = TAB_KEYS.has(requestedTab) ? requestedTab : "overview";
    setActiveTab((current) => (current === nextTab ? current : nextTab));
  }, [requestedTab]);

  const selectTab = (key) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    if (key === "overview") next.delete("tab");
    else next.set("tab", key);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setBundle(null);
    fetchCityGateBundle(cityGateId)
      .then((b) => { if (alive) { setBundle(b); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [cityGateId]);

  const cityGate = bundle?.cityGate;

  return (
    <div className="ppd demand-detail">
      <header className="ppd__head">
        <Link to="/demand" className="ppd__back" aria-label="Back to city gates"><ArrowLeft size={16} /></Link>
        <div>
          <h1 className="ppd__name">{cityGate?.name || cityGateId}</h1>
          <p className="ppd__meta">{[cityGate?.asset_type, cityGate?.region, "View only"].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      {loading && <div className="ppd__state">Loading city gate…</div>}
      {error && <div className="ppd__state ppd__state--err">Failed to load city gate: {error}</div>}

      {!loading && !error && bundle && (
        <>
          <div className="ppd__tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={activeTab === t.key}
                className={`ppd__tab ${activeTab === t.key ? "ppd__tab--active" : ""}`}
                onClick={() => selectTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="ppd__tabpanel">
            {activeTab === "overview" && <DemandOverview cityGate={cityGate} cityGateId={cityGateId} bundle={bundle} />}
            {activeTab === "demand" && <DemandInputTable cityGate={cityGate} cityGateId={cityGateId} bundle={bundle} />}
            {activeTab === "quality" && <QualityRecordList plantId={cityGateId} bundle={bundle} />}
            {activeTab === "maintenance" && <MaintenanceRecordList plantId={cityGateId} bundle={bundle} readOnly hideDesktopApproval />}
            {activeTab === "outages" && <OutageRecordList plantId={cityGateId} bundle={bundle} />}
          </div>
        </>
      )}
    </div>
  );
}
