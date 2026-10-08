import React from "react";
import { BookOpen, CircleDot, Cylinder, Droplets, Factory, Fuel, Info, MapPinned, Spline } from "lucide-react";
import { ENTITY_TYPE_COLORS } from "../../cytoscape/buildCyStyle";
import { statusBorderColor } from "../../cytoscape/entitySymbol";
import "./CanvasLegend.css";

// Right panel → Details while nothing is selected: what the canvas symbols,
// rings and result overlays mean. Same look as the selection details card
// (SelectionInspector) and the left-rail lists: header tile, uppercase section
// titles, bordered lists with colour-coded icon tiles.

const PIPE_COLOUR = "#5b7ca3";

// Ring colour = lifecycle status, read from the same table the canvas symbols
// use (entitySymbol.js), so the legend can't drift from the drawing.
// Decommissioned and inactive rings are dashed on the canvas too.
const LIFECYCLE = [
  { key: "operational", label: "Operational", status: "operational" },
  { key: "planned", label: "Planned", status: "planned" },
  { key: "construction", label: "Construction", status: "under_construction", hint: "Under construction or in maintenance" },
  { key: "decommissioned", label: "Decommissioned", status: "decommissioned", dashed: true },
  { key: "inactive", label: "Inactive", status: "inactive", dashed: true },
  { key: "capacity-limited", label: "Capacity limited", dot: true },
];

// Fill colour = asset type.
const ASSETS = [
  { key: "plant", label: "Plant", icon: Factory, colour: ENTITY_TYPE_COLORS.plant },
  { key: "pump", label: "Pump station", icon: Droplets, colour: ENTITY_TYPE_COLORS.pump },
  { key: "tank", label: "Tank", icon: Cylinder, colour: ENTITY_TYPE_COLORS.tank },
  { key: "handover_point", label: "City gate", icon: MapPinned, colour: ENTITY_TYPE_COLORS.handover_point },
  { key: "filling_station", label: "Filling station", icon: Fuel, colour: ENTITY_TYPE_COLORS.filling_station },
  { key: "node", label: "Junction", icon: CircleDot, colour: ENTITY_TYPE_COLORS.node },
  { key: "pipe", label: "Pipe", icon: Spline, colour: PIPE_COLOUR },
];

// Highlights drawn after a simulation run.
const RUN_OVERLAYS = [
  { key: "capacity", label: "Capacity-limited", tone: "capacity" },
  { key: "utilisation", label: "High utilisation", tone: "utilisation" },
  { key: "bottleneck", label: "Bottleneck", tone: "bottleneck" },
  { key: "shortage", label: "Shortage point", tone: "shortage", dashed: true },
];

function Section({ title, note, children }) {
  return (
    <section className="lg__section">
      <div className="lg__section-head">
        <h4 className="lg__section-title">{title}</h4>
        {note && <span className="lg__section-note">{note}</span>}
      </div>
      <ul className="lg__list">{children}</ul>
    </section>
  );
}

export default function CanvasLegend() {
  return (
    <div className="lg" aria-label="Canvas legend">
      <header className="lg__head">
        <span className="lg__head-icon" aria-hidden="true"><BookOpen size={17} /></span>
        <div className="lg__titles">
          <span className="lg__eyebrow">Reference</span>
          <h3 className="lg__title">Canvas legend</h3>
          <span className="lg__subtitle">How assets, statuses and run results are drawn</span>
        </div>
      </header>

      <Section title="Assets" note="Fill colour">
        {ASSETS.map(({ key, label, icon: Icon, colour }) => (
          <li className="lg__item" key={key} title={label}>
            <span className="lg__tile" style={{ "--lg-colour": colour }} aria-hidden="true"><Icon size={13} /></span>
            <span className="lg__label">{label}</span>
          </li>
        ))}
      </Section>

      <Section title="Lifecycle" note="Ring colour">
        {LIFECYCLE.map(({ key, label, status, dashed, dot, hint }) => (
          <li className="lg__item" key={key} title={hint || label}>
            <span className="lg__swatch" aria-hidden="true">
              {dot ? (
                <span className="lg__dot" />
              ) : (
                <span className="lg__ring" style={{ borderColor: statusBorderColor(status), borderStyle: dashed ? "dashed" : "solid" }} />
              )}
            </span>
            <span className="lg__label">{label}</span>
          </li>
        ))}
      </Section>

      <Section title="Run results" note="After a simulation">
        {RUN_OVERLAYS.map(({ key, label, tone, dashed }) => (
          <li className="lg__item" key={key} title={label}>
            <span className="lg__swatch" aria-hidden="true">
              <span className={`lg__line lg__line--${tone}${dashed ? " lg__line--dashed" : ""}`} />
            </span>
            <span className="lg__label">{label}</span>
          </li>
        ))}
      </Section>

      <p className="lg__hint">
        <Info size={13} aria-hidden="true" />
        Click an asset or pipe on the canvas to see its details here.
      </p>
    </div>
  );
}
