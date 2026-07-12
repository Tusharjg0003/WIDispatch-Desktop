import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { fetchPlantBundle } from "../api/production";
import PlantOverview from "../components/production/PlantOverview";
import ProductionInputTable from "../components/production/ProductionInputTable";
import QualityRecordList from "../components/production/QualityRecordList";
import MaintenanceRecordList from "../components/production/MaintenanceRecordList";
import "./ProductionPlantDetail.css";

export default function ProductionPlantDetail() {
  const { plantId: rawId } = useParams();
  const plantId = decodeURIComponent(rawId);
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "production", label: "Production" },
    { key: "quality", label: "Quality" },
    { key: "maintenance", label: "Maintenance" },
  ];

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setBundle(null);
    fetchPlantBundle(plantId)
      .then((b) => { if (alive) { setBundle(b); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [plantId]);

  const plant = bundle?.plant;

  return (
    <div className="ppd">
      <header className="ppd__head">
        <Link to="/production" className="ppd__back" aria-label="Back to plants"><ArrowLeft size={16} /></Link>
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
                aria-selected={activeTab === t.key}
                className={`ppd__tab ${activeTab === t.key ? "ppd__tab--active" : ""}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="ppd__tabpanel">
            {activeTab === "overview" && <PlantOverview plant={plant} plantId={plantId} bundle={bundle} />}
            {activeTab === "production" && <ProductionInputTable plant={plant} plantId={plantId} bundle={bundle} />}
            {activeTab === "quality" && <QualityRecordList plantId={plantId} bundle={bundle} />}
            {activeTab === "maintenance" && <MaintenanceRecordList plantId={plantId} bundle={bundle} />}
          </div>
        </>
      )}
    </div>
  );
}
