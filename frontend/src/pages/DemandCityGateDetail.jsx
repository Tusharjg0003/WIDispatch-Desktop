import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { fetchCityGateBundle } from "../api/demand";
import { StatusBadge } from "../components/ui/WorkspacePrimitives";
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

export default function DemandCityGateDetail({
  gateId,
  subTab = "overview",
  onSubTabChange,
  onGateLoaded,
  onBack,
}) {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setBundle(null);
    fetchCityGateBundle(gateId)
      .then((b) => {
        if (!alive) return;
        setBundle(b);
        setLoading(false);
        if (b?.cityGate?.name) onGateLoaded?.(b.cityGate);
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, [gateId, onGateLoaded]);

  const cityGate = bundle?.cityGate;

  return (
    <div className="ppd demand-detail">
      <header className="ppd__identity">
        {onBack && (
          <button type="button" className="ppd__back" onClick={onBack} title="Back to City Gates" aria-label="Back to City Gates">
            <ArrowLeft size={16} />
          </button>
        )}
        <h1 className="ppd__name">{cityGate?.name || gateId}</h1>
        {cityGate?.status && <StatusBadge status={cityGate.status} />}
        {cityGate?.external_id && <span className="ppd__extid mono">{cityGate.external_id}</span>}
        <span className="ppd__meta">{[cityGate?.asset_type, cityGate?.entity, [cityGate?.region, cityGate?.city].filter(Boolean).join(" / ")].filter(Boolean).join(" · ")}</span>
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
                aria-selected={subTab === t.key}
                className={`ppd__tab ${subTab === t.key ? "ppd__tab--active" : ""}`}
                onClick={() => onSubTabChange?.(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="ppd__tabpanel">
            {subTab === "overview" && <DemandOverview cityGate={cityGate} cityGateId={gateId} bundle={bundle} />}
            {subTab === "demand" && <DemandInputTable cityGate={cityGate} cityGateId={gateId} bundle={bundle} />}
            {subTab === "quality" && <QualityRecordList plantId={gateId} bundle={bundle} />}
            {subTab === "maintenance" && <MaintenanceRecordList plantId={gateId} bundle={bundle} readOnly hideDesktopApproval />}
            {subTab === "outages" && <OutageRecordList plantId={gateId} bundle={bundle} />}
          </div>
        </>
      )}
    </div>
  );
}
