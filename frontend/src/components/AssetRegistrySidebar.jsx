import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, ChevronRight, CircleHelp, Cylinder, Download, Droplets, Factory, MapPinned, Plus, Search } from "lucide-react";
import { fetchAssets } from "../api/metrics";
import { filterAllowedAssets } from "../lib/assetTypes";
import { ENTITY_TYPE_COLORS } from "../cytoscape/buildCyStyle";
import "./SidebarList.css";

// Same icon and colour per category as the Network Builder's library, the
// canvas and the legend.
const CATEGORY_ICONS = { plant: Factory, pump: Droplets, tank: Cylinder, handover_point: MapPinned };
const CATEGORY_LABELS = { plant: "Plant", pump: "Pump station", tank: "Tank", handover_point: "City gate" };

const statusTone = (status) => {
  const key = String(status || "").toLowerCase();
  if (key === "operational") return "ok";
  if (key === "maintenance") return "warn";
  if (key === "planned" || key === "under_construction") return "acc";
  return "off";
};
const statusLabel = (status) =>
  status ? String(status).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "No status";

const formatTypeLabel = (type) =>
  String(type || "Uncategorized")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

// Left-rail browse list for the Asset Registry: asset types (collapsible,
// colour-coded by category) > individual assets, with search, New asset,
// Export CSV and Help. Styled with the shared left-rail list styles
// (SidebarList.css). Fetches its own asset list independent of the main
// content's filters; clicking an asset opens its detail page. Map / List live
// in the page header.
export default function AssetRegistrySidebar({ view, onShowMap, onShowList, onCreate, onShowHelp, onExport }) {
  const navigate = useNavigate();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedTypes, setExpandedTypes] = useState({});

  useEffect(() => {
    let cancelled = false;
    fetchAssets({ limit: 5000 })
      .then((d) => !cancelled && setAssets(d.assets || []))
      .catch(() => !cancelled && setAssets([]))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const assetsByType = useMemo(() => {
    const grouped = {};
    for (const a of filterAllowedAssets(assets)) {
      const type = a.asset_type || "Uncategorized";
      (grouped[type] || (grouped[type] = [])).push(a);
    }
    return grouped;
  }, [assets]);

  const filteredAssetsByType = useMemo(() => {
    if (!searchTerm.trim()) return assetsByType;
    const term = searchTerm.toLowerCase();
    const out = {};
    for (const type of Object.keys(assetsByType)) {
      const labelMatches = formatTypeLabel(type).toLowerCase().includes(term);
      const matches = labelMatches
        ? assetsByType[type]
        : assetsByType[type].filter(
          (a) => (a.name || "").toLowerCase().includes(term) || (a.id || "").toLowerCase().includes(term)
        );
      if (matches.length) out[type] = matches;
    }
    return out;
  }, [assetsByType, searchTerm]);

  // Auto-expand everything that matches while actively searching.
  useEffect(() => {
    if (!searchTerm.trim()) return;
    setExpandedTypes((prev) => {
      const next = { ...prev };
      Object.keys(filteredAssetsByType).forEach((type) => { next[type] = true; });
      return next;
    });
  }, [searchTerm, filteredAssetsByType]);

  const toggleType = (key) => setExpandedTypes((p) => ({ ...p, [key]: !p[key] }));
  const searching = Boolean(searchTerm.trim());
  const types = Object.keys(filteredAssetsByType).sort((a, b) => formatTypeLabel(a).localeCompare(formatTypeLabel(b)));
  const total = types.reduce((sum, type) => sum + filteredAssetsByType[type].length, 0);

  return (
    <div className="sl-panel">
      <div className="sl-tools">
        <div className="sl-tools__row">
          <label className="sl-search">
            <Search size={13} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search assets"
              aria-label="Search assets by name, ID or type"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
        </div>
        <div className="sl-tools__row">
          <button type="button" className="sl-btn sl-btn--primary" onClick={onCreate} style={{ flex: 1 }}>
            <Plus size={14} aria-hidden="true" /> New asset
          </button>
          <button type="button" className="sl-btn sl-btn--icon" onClick={onExport} title="Export CSV" aria-label="Export CSV">
            <Download size={14} aria-hidden="true" />
          </button>
          <button type="button" className="sl-btn sl-btn--icon" onClick={onShowHelp} title="Help" aria-label="Help">
            <CircleHelp size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="sl-body">
        {loading ? (
          <div className="sl-empty">Loading assets…</div>
        ) : types.length === 0 ? (
          <div className="sl-empty">{searching ? "No assets match that search." : "No assets available."}</div>
        ) : (
          <>
            <div className="sl-group">
              <span className="sl-group__label">Asset types</span>
              <span className="sl-group__count">{total}</span>
            </div>
            {types.map((type) => {
              const list = filteredAssetsByType[type];
              const isExpanded = Boolean(expandedTypes[type]);
              const category = list[0]?.category;
              const Icon = CATEGORY_ICONS[category] || Boxes;
              return (
                <div key={type} className="ar-browse__group">
                  <button
                    type="button"
                    className={`sl-row ar-browse__type${isExpanded ? " is-expanded" : ""}`}
                    style={{ "--sl-colour": ENTITY_TYPE_COLORS[category] || "var(--acc)" }}
                    onClick={() => toggleType(type)}
                    aria-expanded={isExpanded}
                  >
                    <ChevronRight size={13} className="ar-browse__chevron" aria-hidden="true" />
                    <span className="sl-row__icon" aria-hidden="true"><Icon size={15} /></span>
                    <span className="sl-row__text">
                      <span className="sl-row__name">{formatTypeLabel(type)}</span>
                      <span className="sl-row__sub">{CATEGORY_LABELS[category] || "Asset"}</span>
                    </span>
                    <span className="sl-row__aside"><span className="sl-tag">{list.length}</span></span>
                  </button>

                  {isExpanded && (
                    <div className="ar-browse__children">
                      {list.map((asset) => (
                        <div
                          key={asset.id}
                          role="button"
                          tabIndex={0}
                          className="sl-row ar-browse__asset"
                          onClick={() => navigate(`/asset-registry/view/${encodeURIComponent(asset.id)}`)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            navigate(`/asset-registry/view/${encodeURIComponent(asset.id)}`);
                          }}
                          title={`${asset.name || asset.id} · open details`}
                        >
                          <span className="sl-row__text">
                            <span className="sl-row__name">{asset.name || asset.id}</span>
                            <span className="sl-row__sub">{[asset.id, asset.region].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className="sl-row__aside">
                            <span className={`sl-dot sl-dot--${statusTone(asset.status)}`} title={statusLabel(asset.status)} aria-label={statusLabel(asset.status)} />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
