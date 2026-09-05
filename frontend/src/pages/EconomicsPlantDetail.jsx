import React, { useEffect, useState } from "react";
import { fetchEconomicsPlantBundle } from "../api/production";
import PlantOverview from "../components/production/PlantOverview";
import PlantFinancialTable from "../components/economics/PlantFinancialTable";
import "./ProductionPlantDetail.css";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "financial", label: "Financial" },
];

export default function EconomicsPlantDetail({
  plantId,
  subTab = "overview",
  onSubTabChange,
  onPlantLoaded,
}) {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setBundle(null);
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

  const plant = bundle?.plant;

  return (
    <div className="ppd">
      <header className="ppd__head">
        <div>
          <h1 className="ppd__name">{plant?.name || plantId}</h1>
          <p className="ppd__meta">{[plant?.asset_type, plant?.region].filter(Boolean).join(" · ")}</p>
        </div>
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
            {subTab === "financial" && <PlantFinancialTable entries={bundle.financialEntries} plantId={plantId} />}
          </div>
        </>
      )}
    </div>
  );
}
