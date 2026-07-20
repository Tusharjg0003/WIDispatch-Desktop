import React from "react";
import { format } from "date-fns";
import SinglePlantMap from "../production/SinglePlantMap";
import QualityParameterCharts from "../production/QualityParameterCharts";
import DemandCapacityChart from "./DemandCapacityChart";
import "../production/PlantOverview.css";

const fmtDate = (v) => {
  if (!v || v === "NULL" || v === "") return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "PPP");
};
const cap = (v) => (v != null ? `${Number(v).toLocaleString()} m³/day` : "N/A");

export default function DemandOverview({ cityGate, cityGateId, bundle }) {
  const s = cityGate?.specifications || {};
  const fields = [
    ["Asset ID", cityGate?.external_id || "—"],
    ["City Gate Name", cityGate?.name || "—"],
    ["Gate Type", cityGate?.asset_type || "N/A"],
    ["Entity", cityGate?.entity || "N/A"],
    ["Contracted Capacity", s.contracted_capacity != null ? cap(s.contracted_capacity) : "Not set"],
    ["Design Capacity", cap(s.design_capacity)],
    ["Maximum Capacity", s.maximum_capacity != null ? cap(s.maximum_capacity) : "N/A"],
    ["Commissioning Date", fmtDate(cityGate?.commissioning_date)],
    ["Decommissioning Date", fmtDate(cityGate?.decommissioning_date)],
  ];

  return (
    <div className="pov">
      <div className="pov__row">
        <section className="pov__card pov__info">
          <div className="pov__card-head"><h3>Basic Information</h3><p>Core city gate details and specifications</p></div>
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
          <div className="pov__card-body"><SinglePlantMap latitude={cityGate?.latitude} longitude={cityGate?.longitude} name={cityGate?.name} height={220} /></div>
        </section>
      </div>

      <section className="pov__card">
        <div className="pov__card-head"><h3>Demand &amp; Capacity</h3><p>Required demand against contracted, design &amp; maximum capacity, with maintenance, outage and quality factors.</p></div>
        <div className="pov__card-body"><DemandCapacityChart cityGate={cityGate} cityGateId={cityGateId} bundle={bundle} /></div>
      </section>

      <section className="pov__card">
        <div className="pov__card-head"><h3>Water Quality Parameters</h3><p>Daily readings per parameter with the gate's acceptable range shaded; out-of-range points flagged.</p></div>
        <div className="pov__card-body"><QualityParameterCharts plantId={cityGateId} bundle={bundle} /></div>
      </section>
    </div>
  );
}
