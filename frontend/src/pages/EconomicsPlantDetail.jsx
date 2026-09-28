import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { fetchEconomicsPlantBundle, fetchPlantBundle } from "../api/production";
import { StatusBadge } from "../components/ui/WorkspacePrimitives";
import PlantOverview from "../components/production/PlantOverview";
import ProductionInputTable from "../components/production/ProductionInputTable";
import PlantFinancialTable from "../components/economics/PlantFinancialTable";
import "./ProductionPlantDetail.css";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "production", label: "Production" },
  { key: "financial", label: "Financial" },
];

export default function EconomicsPlantDetail({
  plantId,
  subTab = "overview",
  onSubTabChange,
  onPlantLoaded,
  onBack,
}) {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // The Production tab reuses the production bundle; loaded lazily the first
  // time that tab is opened so the Economics detail stays light by default.
  const [prodBundle, setProdBundle] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setBundle(null);
    setProdBundle(null);
    fetchEconomicsPlantBundle(plantId)
      .then((b) => {
        if (!alive) return;
        setBundle(b);
        setLoading(false);
        if (b?.plant?.name) onPlantLoaded?.(b.plant);
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, [plantId, onPlantLoaded]);

  useEffect(() => {
    if (subTab !== "production" || prodBundle) return;
    let alive = true;
    fetchPlantBundle(plantId).then((b) => { if (alive) setProdBundle(b); }).catch(() => {});
    return () => { alive = false; };
  }, [subTab, plantId, prodBundle]);

  const plant = bundle?.plant;

  return (
    <div className="ppd">
      <header className="ppd__identity">
        {onBack && (
          <button type="button" className="ppd__back" onClick={onBack} title="Back to Plants" aria-label="Back to Plants">
            <ArrowLeft size={16} />
          </button>
        )}
        <h1 className="ppd__name">{plant?.name || plantId}</h1>
        {plant?.status && <StatusBadge status={plant.status} />}
        {plant?.external_id && <span className="ppd__extid mono">{plant.external_id}</span>}
        <span className="ppd__meta">{[plant?.asset_type, plant?.entity, [plant?.region, plant?.city].filter(Boolean).join(" / ")].filter(Boolean).join(" · ")}</span>
      </header>

      {loading && <div className="ppd__state">Loading plant…</div>}
      {error && <div className="ppd__state ppd__state--err">Failed to load plant: {error}</div>}

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
            {subTab === "overview" && <PlantOverview plant={plant} plantId={plantId} bundle={bundle} />}
            {subTab === "production" && (prodBundle
              ? <ProductionInputTable plant={prodBundle.plant} plantId={plantId} bundle={prodBundle} />
              : <div className="ppd__state">Loading production…</div>)}
            {subTab === "financial" && <PlantFinancialTable entries={bundle.financialEntries} plantId={plantId} />}
          </div>
        </>
      )}
    </div>
  );
}
