import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAssets } from "../api/metrics";
import SidebarActionToolbar from "./SidebarActionToolbar";
import "./WorkspaceRecordSidebar.css";

const ICON_ROOT = "/All Icons Zipped";
const EXPAND_ICON = `${ICON_ROOT}/15 UI Utility Icons (System-Level)/Expand/SVG/Expand_20px.svg`;
const MAP_ICON = `${ICON_ROOT}/11 Map & Location (GIS)/Map/SVG/Map_20px.svg`;
const LIST_ICON = `${ICON_ROOT}/01 Core Navigation-System/Overview/SVG/Overview_20px.svg`;
const DOCUMENT_ICON = `${ICON_ROOT}/12 File & Document Management/Document/SVG/Document_20px.svg`;
const HELP_ICON = `${ICON_ROOT}/01 Core Navigation-System/Help - Support/SVG/Help - Support_20px.svg`;

const STATUS_DOT = {
  operational: "#10b981",
  maintenance: "#f59e0b",
  under_construction: "#3b82f6",
  planned: "#3b82f6",
  decommissioned: "#ef4444",
};

const formatTypeLabel = (type) =>
  String(type || "Uncategorized")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

// Left-rail browse tree for the Asset Registry: Category > Asset Type >
// individual assets, with its own search + a Map/List view toggle (adapted
// from a reference app's AssetsTaggingSidebar). Fetches its own asset list
// independent of whatever filters are active in the main content, and
// clicking an asset navigates straight to its detail page.
export default function AssetRegistrySidebar({ view, onShowMap, onShowList, onCreate, onShowHelp, onExport }) {
  const navigate = useNavigate();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
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
    for (const a of assets) {
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

  return (
    <div className="sidebar-content">
      <div className="sidebar-content__section-content">
        <SidebarActionToolbar
          createTitle="New Asset"
          onCreate={onCreate}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
          showFilter={false}
          showSort={false}
          showDelete={false}
          extraActions={[
            { title: view === "list" ? "List View (active)" : "List View", iconSrc: LIST_ICON, active: view === "list", onClick: onShowList },
            { title: view === "map" ? "Map View (active)" : "Map View", iconSrc: MAP_ICON, active: view === "map", onClick: onShowMap },
            { title: "Export CSV", iconSrc: DOCUMENT_ICON, onClick: onExport },
            { title: "Help", iconSrc: HELP_ICON, onClick: onShowHelp },
          ]}
        />
      </div>

      {loading && <div className="sidebar-content__empty-msg">Loading assets…</div>}

      {!loading && (
        <div className="sidebar-content__tree-list">
          {Object.keys(filteredAssetsByType).length === 0 ? (
            <div className="sidebar-content__empty-msg">
              {searchTerm ? "No assets found" : "No assets available"}
            </div>
          ) : (
            Object.keys(filteredAssetsByType).sort((a, b) => formatTypeLabel(a).localeCompare(formatTypeLabel(b))).map((type) => {
              const isExpanded = expandedTypes[type];
              const list = filteredAssetsByType[type];
              return (
                <div key={type} className="sidebar-content__tree-group">
                  <button
                    type="button"
                    className={`sidebar-content__tree-type${isExpanded ? " is-expanded" : ""}`}
                    onClick={() => toggleType(type)}
                  >
                    <img src={EXPAND_ICON} alt="" aria-hidden="true" />
                    <span>{formatTypeLabel(type)} ({list.length})</span>
                  </button>

                  {isExpanded && (
                    <div className="sidebar-content__list sidebar-content__list--nested">
                      {list.map((asset, index) => (
                        <div
                          key={asset.id}
                          className="sidebar-content__list-item"
                          onClick={() => navigate(`/asset-registry/view/${encodeURIComponent(asset.id)}`)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <span style={{ fontSize: 9, lineHeight: 1, fontFamily: "var(--mono)", color: "#94a3b8", flexShrink: 0 }}>
                              #{index + 1}
                            </span>
                            <span style={{
                              fontWeight: 500, fontSize: 11, lineHeight: 1.15, color: "#0f172a",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {asset.name || asset.id}
                            </span>
                          </div>
                          <div className="sidebar-content__list-item-meta" style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 18 }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                              background: STATUS_DOT[asset.status] || "#94a3b8",
                            }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              ID: {asset.id}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
