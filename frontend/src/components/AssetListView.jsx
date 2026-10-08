import React from "react";
import { ArrowUpRight, CircleDot, Cylinder, Droplets, Factory, MapPinned, Pencil } from "lucide-react";
import { ENTITY_TYPE_COLORS } from "../cytoscape/buildCyStyle";
import "./AssetListView.css";

// Asset Registry → List: the registry as a table, in the side panels'
// language — uppercase column heads, a colour-coded type tile beside each
// name, lifecycle pills, and icon buttons to view or edit.

const CATEGORY_ICONS = { plant: Factory, pump: Droplets, tank: Cylinder, handover_point: MapPinned };
const statusLabel = (s) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Unknown");
const statusTone = (s) => {
  const key = String(s || "").toLowerCase();
  if (key === "operational") return "ok";
  if (key === "maintenance") return "warn";
  if (key === "planned" || key === "under_construction") return "acc";
  if (key === "decommissioned") return "err";
  return "off";
};
const clean = (v) => (v && v !== "NULL" ? v : null);

export default function AssetListView({ assets, onView, onEdit }) {
  if (assets.length === 0) {
    return <div className="al-empty">No assets match the selected filters.</div>;
  }
  return (
    <section className="al" aria-label="Assets">
      <header className="al-head">
        <h3 className="al-head__title">Assets</h3>
        <span className="al-head__count">{assets.length}</span>
      </header>
      <div className="al-scroll">
        <table className="al-table">
          <thead>
            <tr>
              <th scope="col">Asset</th>
              <th scope="col">Activity</th>
              <th scope="col">Type</th>
              <th scope="col">Region</th>
              <th scope="col">Governorate</th>
              <th scope="col">Status</th>
              <th scope="col"><span className="al-sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {assets.map((item) => {
              const Icon = CATEGORY_ICONS[item.category] || CircleDot;
              const name = item.name || item.asset_name_ar || "Unnamed asset";
              return (
                <tr key={`${item.category}-${item.id}`} onDoubleClick={() => onView(item)}>
                  <td>
                    <div className="al-asset">
                      <span className="al-asset__icon" style={{ "--al-colour": ENTITY_TYPE_COLORS[item.category] || "var(--acc)" }} aria-hidden="true">
                        <Icon size={14} />
                      </span>
                      <span className="al-asset__text">
                        <button type="button" className="al-asset__name" onClick={() => onView(item)} title="View details">
                          {name}
                        </button>
                        <span className="al-asset__id">{item.id || "—"}</span>
                      </span>
                    </div>
                  </td>
                  <td>{clean(item.activity) || <span className="al-muted">—</span>}</td>
                  <td>{clean(item.asset_type) || <span className="al-muted">—</span>}</td>
                  <td>{clean(item.region) || <span className="al-muted">—</span>}</td>
                  <td>{clean(item.governorate) || <span className="al-muted">—</span>}</td>
                  <td><span className={`al-pill al-pill--${statusTone(item.status)}`}>{statusLabel(item.status)}</span></td>
                  <td>
                    <div className="al-actions">
                      <button type="button" className="al-icon-btn" onClick={() => onView(item)} title="View details" aria-label={`View ${name}`}>
                        <ArrowUpRight size={14} />
                      </button>
                      <button type="button" className="al-icon-btn" onClick={() => onEdit(item)} title="Edit" aria-label={`Edit ${name}`}>
                        <Pencil size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
