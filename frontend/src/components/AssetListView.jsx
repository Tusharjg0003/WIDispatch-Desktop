import React, { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CircleDot, Cylinder, Droplets, Factory, MapPinned, Pencil, Search, X } from "lucide-react";
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
const uniqSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
const CATEGORY_LABELS = { plant: "Plants", pump: "Pump stations", tank: "Tanks", handover_point: "City gates" };

export default function AssetListView({ assets, onView, onEdit, onFiltersChange }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState("");

  const options = useMemo(() => ({
    categories: uniqSorted(assets.map((a) => a.category)),
    regions: uniqSorted(assets.map((a) => clean(a.region))),
    statuses: uniqSorted(assets.map((a) => a.status)),
  }), [assets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (category && a.category !== category) return false;
      if (region && a.region !== region) return false;
      if (status && a.status !== status) return false;
      if (!q) return true;
      return [a.name, a.asset_name_ar, a.id, a.asset_type, a.activity, a.region, a.governorate, a.city]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
  }, [assets, query, category, region, status]);

  // The page's Export starts from whatever the list is filtered to.
  useEffect(() => {
    onFiltersChange?.({
      query,
      categories: category ? [category] : [],
      regions: region ? [region] : [],
      statuses: status ? [status] : [],
    });
  }, [onFiltersChange, query, category, region, status]);

  const filtering = Boolean(query || category || region || status);
  const clearFilters = () => { setQuery(""); setCategory(""); setRegion(""); setStatus(""); };

  if (assets.length === 0) {
    return <div className="al-empty">No assets in the registry yet.</div>;
  }
  return (
    <section className="al" aria-label="Assets">
      <header className="al-head">
        <h3 className="al-head__title">Assets</h3>
        <span className="al-head__count">{filtering ? `${filtered.length} / ${assets.length}` : assets.length}</span>
        <label className="al-search">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search name, ID, type, region…"
            aria-label="Search assets"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select className={`al-filter${category ? " is-set" : ""}`} aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {options.categories.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
        </select>
        <select className={`al-filter${region ? " is-set" : ""}`} aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">All regions</option>
          {options.regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className={`al-filter${status ? " is-set" : ""}`} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {options.statuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
        </select>
        {filtering && (
          <button type="button" className="al-clear" onClick={clearFilters}>
            <X size={12} aria-hidden="true" /> Clear
          </button>
        )}
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
            {filtered.map((item) => {
              const Icon = CATEGORY_ICONS[item.category] || CircleDot;
              const name = item.name || item.asset_name_ar || "Unnamed asset";
              return (
                <tr
                  key={`${item.category}-${item.id}`}
                  tabIndex={0}
                  onClick={() => onView(item)}
                  onKeyDown={(e) => { if (e.key === "Enter") onView(item); }}
                  title="Open details"
                >
                  <td>
                    <div className="al-asset">
                      <span className="al-asset__icon" style={{ "--al-colour": ENTITY_TYPE_COLORS[item.category] || "var(--acc)" }} aria-hidden="true">
                        <Icon size={14} />
                      </span>
                      <span className="al-asset__text">
                        <span className="al-asset__name">{name}</span>
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
                    <div className="al-actions" onClick={(e) => e.stopPropagation()}>
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
            {filtered.length === 0 && (
              <tr className="al-none">
                <td colSpan={7}>
                  No assets match these filters. <button type="button" className="al-link" onClick={clearFilters}>Clear filters</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
