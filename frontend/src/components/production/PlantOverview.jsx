import React from "react";
import { format } from "date-fns";
import SinglePlantMap from "./SinglePlantMap";
import ProductionCapacityChart from "./ProductionCapacityChart";
import QualityParameterCharts from "./QualityParameterCharts";
import "./PlantOverview.css";

const fmtDate = (v) => {
  if (!v || v === "NULL" || v === "") return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "PPP");
};
const cap = (v) => (v != null ? `${Number(v).toLocaleString()} m³/day` : "N/A");

export default function PlantOverview({ plant, plantId, bundle }) {
  const s = plant?.specifications || {};
  const fields = [
    ["Asset ID", plant?.external_id || "—"],
    ["Plant Name", plant?.name || "—"],
    ["Plant Type", plant?.asset_type || "N/A"],
    ["Entity", plant?.entity || "N/A"],
    ["Contracted Capacity", s.contracted_capacity != null ? cap(s.contracted_capacity) : "Not set"],
    ["Design Capacity", cap(s.design_capacity)],
    ["Maximum Capacity", s.maximum_capacity != null ? cap(s.maximum_capacity) : "N/A"],
    ["Commissioning Date", fmtDate(plant?.commissioning_date)],
    ["Decommissioning Date", fmtDate(plant?.decommissioning_date)],
  ];

  return (
    <div className="pov">
      <div className="pov__row">
        <section className="pov__card pov__info">
          <div className="pov__card-head"><h3>Basic Information</h3><p>Core plant details and specifications</p></div>
          <div className="pov__grid">
            {fields.map(([label, value]) => (
              <div className="pov__field" key={label}>
                <div className="pov__label">{label}</div>
                <div className="pov__value">{value}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="pov__card pov__loc">
          <div className="pov__card-head"><h3>Location</h3><p>Satellite view</p></div>
          <div className="pov__card-body"><SinglePlantMap latitude={plant?.latitude} longitude={plant?.longitude} name={plant?.name} height={220} /></div>
        </section>
      </div>

      <section className="pov__card">
        <div className="pov__card-head"><h3>Production &amp; Capacity</h3><p>Production against contracted, design &amp; maximum capacity, with maintenance, outage and quality factors.</p></div>
        <div className="pov__card-body"><ProductionCapacityChart plant={plant} plantId={plantId} bundle={bundle} /></div>
      </section>

      <section className="pov__card">
        <div className="pov__card-head"><h3>Water Quality Parameters</h3><p>Daily readings per parameter with the plant's acceptable range shaded; out-of-range points flagged.</p></div>
        <div className="pov__card-body"><QualityParameterCharts plantId={plantId} bundle={bundle} /></div>
      </section>
    </div>
  );
}
