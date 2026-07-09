import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Map as MapIcon, List as ListIcon } from "lucide-react";
import { fetchAssets } from "../api/metrics";
import SidebarActionToolbar from "./SidebarActionToolbar";

const CATEGORY_LABEL = { plant: "Plants", pump: "Pump Stations", handover_point: "Handover Points" };
const CATEGORY_ORDER = ["plant", "pump", "handover_point"];

const STATUS_DOT = {
  operational: "#10b981",
  maintenance: "#f59e0b",
  under_construction: "#3b82f6",
  planned: "#3b82f6",
  decommissioned: "#ef4444",
};

// Left-rail browse tree for the Asset Registry: Category > Asset Type >
// individual assets, with its own search + a Map/List view toggle (adapted
// from a reference app's AssetsTaggingSidebar). Fetches its own asset list
// independent of whatever filters are active in the main content, and
// clicking an asset navigates straight to its detail page.
export default function AssetRegistrySidebar({ view, onShowMap, onShowList, onCreate }) {
  const navigate = useNavigate();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({ plant: true, pump: true, handover_point: true });
  const [expandedTypes, setExpandedTypes] = useState({});

  useEffect(() => {
    let cancelled = false;
    fetchAssets({ limit: 5000 })
      .then((d) => !cancelled && setAssets(d.assets || []))
      .catch(() => !cancelled && setAssets([]))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  // category -> asset_type -> assets[]
  const tree = useMemo(() => {
    const byCategory = {};
    for (const a of assets) {
      const cat = byCategory[a.category] || (byCategory[a.category] = {});
      const type = a.asset_type || "Uncategorized";
      (cat[type] || (cat[type] = [])).push(a);
    }
    return byCategory;
  }, [assets]);

  const filteredTree = useMemo(() => {
    if (!searchTerm.trim()) return tree;
    const term = searchTerm.toLowerCase();
    const out = {};
    for (const cat of Object.keys(tree)) {
      const types = {};
      for (const type of Object.keys(tree[cat])) {
        const matches = tree[cat][type].filter(
          (a) => (a.name || "").toLowerCase().includes(term) || (a.id || "").toLowerCase().includes(term)
        );
        if (matches.length) types[type] = matches;
      }
      if (Object.keys(types).length) out[cat] = types;
    }
    return out;
  }, [tree, searchTerm]);

  // Auto-expand everything that matches while actively searching.
  useEffect(() => {
    if (!searchTerm.trim()) return;
    setExpandedCategories((prev) => {
      const next = { ...prev };
      Object.keys(filteredTree).forEach((c) => { next[c] = true; });
      return next;
    });
    setExpandedTypes((prev) => {
      const next = { ...prev };
      Object.entries(filteredTree).forEach(([cat, types]) => {
        Object.keys(types).forEach((t) => { next[`${cat}:${t}`] = true; });
      });
      return next;
    });
  }, [searchTerm, filteredTree]);

  const toggleCategory = (cat) => setExpandedCategories((p) => ({ ...p, [cat]: !p[cat] }));
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
            { title: view === "map" ? "Map View (active)" : "Map View", icon: MapIcon, active: view === "map", onClick: onShowMap },
            { title: view === "list" ? "List View (active)" : "List View", icon: ListIcon, active: view === "list", onClick: onShowList },
          ]}
        />
      </div>

      {loading && <div className="sidebar-content__empty-msg">Loading assets…</div>}

      {!loading && CATEGORY_ORDER.map((cat) => {
        const types = filteredTree[cat] || {};
        const total = Object.values(tree[cat] || {}).reduce((n, list) => n + list.length, 0);
        return (
          <div className="sidebar-content__section" key={cat}>
            <button className="sidebar-content__section-header" onClick={() => toggleCategory(cat)}>
              {expandedCategories[cat] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <h4 className="sidebar-content__section-title">{CATEGORY_LABEL[cat]} ({total})</h4>
            </button>

            {expandedCategories[cat] && (
              <div className="sidebar-content__section-content">
                {Object.keys(types).length === 0 ? (
                  <div className="sidebar-content__empty-msg">
                    {searchTerm ? "No assets found" : "No assets available"}
                  </div>
                ) : (
                  Object.keys(types).sort().map((type) => {
                    const key = `${cat}:${type}`;
                    const isExpanded = expandedTypes[key];
                    const list = types[type];
                    return (
                      <div key={key} style={{ marginBottom: 4 }}>
                        <button
                          className="sidebar-content__section-header"
                          onClick={() => toggleType(key)}
                          style={{ padding: "4px 8px", fontSize: "0.75rem", fontWeight: 500 }}
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          <span>{type} ({list.length})</span>
                        </button>

                        {isExpanded && (
                          <div className="sidebar-content__list" style={{ marginLeft: 12 }}>
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
      })}
    </div>
  );
}
