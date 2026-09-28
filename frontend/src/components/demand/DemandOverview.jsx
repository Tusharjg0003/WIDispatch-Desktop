import React from "react";
import SinglePlantMap from "../production/SinglePlantMap";
import QualityParameterCharts from "../production/QualityParameterCharts";
import { FactsCard, UpcomingMaintenanceCard } from "../production/PlantOverview";
import DemandCapacityChart from "./DemandCapacityChart";
import "../production/PlantOverview.css";

export default function DemandOverview({ cityGate, cityGateId, bundle }) {
  return (
    <div className="pov">
      <div className="pov__top">
        <FactsCard title="City Gate Facts" asset={cityGate} typeLabel="Gate Type" />
        <UpcomingMaintenanceCard bundle={bundle} />
        <section className="pov__card pov__loc">
          <div className="pov__card-head"><h3>Location</h3><p>Satellite view</p></div>
          <div className="pov__card-body"><SinglePlantMap latitude={cityGate?.latitude} longitude={cityGate?.longitude} name={cityGate?.name} height={300} /></div>
        </section>
      </div>

      <section className="pov__card">
        <div className="pov__card-head"><h3>Demand &amp; Capacity</h3><p>Actual vs contracted · design · maximum</p></div>
        <div className="pov__card-body"><DemandCapacityChart cityGate={cityGate} cityGateId={cityGateId} bundle={bundle} /></div>
      </section>

      <section className="pov__card">
        <div className="pov__card-head"><h3>Water Quality Parameters</h3><p>Acceptable range shaded · out-of-range flagged</p></div>
        <div className="pov__card-body"><QualityParameterCharts plantId={cityGateId} bundle={bundle} /></div>
      </section>
    </div>
  );
}
