import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { fetchPlantBundle } from "../api/production";
import ProductionInputTable from "../components/production/ProductionInputTable";
import ProductionCapacityChart from "../components/production/ProductionCapacityChart";
import QualityParameterCharts from "../components/production/QualityParameterCharts";
import "./ProductionPlantDetail.css";

export default function ProductionPlantDetail() {
  const { plantId: rawId } = useParams();
  const plantId = decodeURIComponent(rawId);
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
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
        <div className="ppd__sections">
          <section className="ppd__card">
            <div className="ppd__card-head"><h2>Production Inputs</h2><p>Per-day contracted, available and delivered volumes with maintenance/outage losses.</p></div>
            <div className="ppd__card-body"><ProductionInputTable plant={plant} plantId={plantId} bundle={bundle} /></div>
          </section>

          <section className="ppd__card">
            <div className="ppd__card-head"><h2>Production &amp; Capacity</h2><p>Production against contracted, design &amp; maximum capacity, with maintenance, outage and quality factors.</p></div>
            <div className="ppd__card-body"><ProductionCapacityChart plant={plant} plantId={plantId} bundle={bundle} /></div>
          </section>

          <section className="ppd__card">
            <div className="ppd__card-head"><h2>Water Quality Parameters</h2><p>Daily readings per parameter with the plant's acceptable range shaded; out-of-range points flagged.</p></div>
            <div className="ppd__card-body"><QualityParameterCharts plantId={plantId} bundle={bundle} /></div>
          </section>
        </div>
      )}
    </div>
  );
}
