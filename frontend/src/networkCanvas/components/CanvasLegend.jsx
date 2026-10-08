import React from "react";
import {
  IconDroplet,
  IconPipe,
  IconPlant,
  IconStorageTank,
  IconTarget,
} from "../../components/IconAssets";

// Right panel → Details, shown while nothing is selected: what the canvas
// symbols, rings and overlays mean.

const LIFECYCLE_LEGEND = [
  { key: "planned", label: "Planned" },
  { key: "operational", label: "Operational" },
  { key: "construction", label: "Under construction" },
  { key: "inactive", label: "Inactive" },
  { key: "capacity-limited", label: "Capacity limited" },
];

const ASSET_LEGEND = [
  { key: "plant", label: "Plant", icon: IconPlant },
  { key: "tank", label: "Tank", icon: IconStorageTank },
  { key: "handover", label: "Handover point", icon: IconTarget },
  { key: "pump", label: "Pump station", icon: IconDroplet },
  { key: "junction", label: "Junction", dot: true },
  { key: "pipe", label: "Pipe", icon: IconPipe },
];

const RUN_OVERLAY_LEGEND = [
  { key: "capacity", label: "Capacity-limited", tone: "capacity" },
  { key: "utilisation", label: "High utilisation", tone: "utilisation" },
  { key: "bottleneck", label: "Bottleneck", tone: "bottleneck" },
  { key: "shortage", label: "Shortage point", tone: "shortage", dashed: true },
];

export default function CanvasLegend() {
  return (
    <div className="ns2-legend" aria-label="Canvas legend">
      <div className="ns2-legend__title">Canvas Legend</div>
      <div className="ns2-legend__hint">
        Fill = asset type · Ring = lifecycle status · Amber dot = capacity limited
      </div>

      <section className="ns2-legend__section">
        <div className="ns2-legend__section-title">Lifecycle</div>
        <div className="ns2-legend__grid">
          {LIFECYCLE_LEGEND.map((item) => (
            <div className="ns2-legend__item" key={item.key} title={item.label}>
              <span aria-hidden="true" className={`ns2-legend__status ns2-legend__status--${item.key}`} />
              <span className="ns2-legend__label">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ns2-legend__section">
        <div className="ns2-legend__section-title">Assets</div>
        <div className="ns2-legend__grid">
          {ASSET_LEGEND.map((item) => {
            const Icon = item.icon;
            return (
              <div className="ns2-legend__item" key={item.key} title={item.label}>
                <span className="ns2-legend__asset" aria-hidden="true">
                  {Icon ? <Icon size={13} /> : <span className="ns2-legend__junction" />}
                </span>
                <span className="ns2-legend__label">{item.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="ns2-legend__section">
        <div className="ns2-legend__section-title">Run overlays</div>
        <div className="ns2-legend__grid">
          {RUN_OVERLAY_LEGEND.map((item) => (
            <div className="ns2-legend__item" key={item.key} title={item.label}>
              <span
                aria-hidden="true"
                className={`ns2-legend__line ns2-legend__line--${item.tone}${item.dashed ? " ns2-legend__line--dashed" : ""}`}
              />
              <span className="ns2-legend__label">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="ns2-legend__hint ns2-legend__hint--footer">
        Click an asset or pipe on the canvas to see its details here.
      </p>
    </div>
  );
}
