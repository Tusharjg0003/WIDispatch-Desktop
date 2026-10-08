import React, { useEffect, useMemo, useState } from "react";
import { fetchAssets, fetchTransmissionSystemLibrary } from "../api/metrics";
import { filterAllowedAssets } from "../lib/assetTypes";
import { CircleDot, Cylinder, Droplets, Factory, MapPinned, MapPinPlus, Network, Search } from "lucide-react";
import {
  CATEGORY_ORDER,
  ENTITY_TYPE_COLORS,
  ENTITY_TYPE_LABELS,
} from "../cytoscape/buildCyStyle";
import "./SidebarList.css";

function firstPresent(...values) {
  return values.find((value) => value != null && value !== "");
}

function formatCapacity(asset) {
  const spec = asset.specifications || {};
  if (asset.category === "tank") {
    const capacity = Number(firstPresent(spec.total_capacity_m3, spec.capacity, asset.capacity));
    return Number.isFinite(capacity) ? `${capacity.toLocaleString()} m³` : "";
  }
  const value = firstPresent(
    spec.design_capacity,
    spec.maximum_capacity,
    spec.contracted_capacity,
    spec.expansion_capacity,
    spec.capacity
  );
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${numericValue.toLocaleString()} m³/day` : "";
}

const CATEGORY_ICONS = { plant: Factory, pump: Droplets, tank: Cylinder, handover_point: MapPinned };
const CHIP_LABELS = { plant: "Plant", pump: "Pump", tank: "Tank", handover_point: "City gate" };
const statusTone = (status) => {
  const key = String(status || "").toLowerCase();
  if (key === "operational") return "ok";
  if (key === "maintenance") return "warn";
  if (key === "planned" || key === "under_construction") return "acc";
  return "off";
};
const statusLabel = (status) =>
  status ? String(status).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "No status";

// DB-backed asset library rendered into the left sidebar. Clicking a row "arms"
// placement — the page then drops the asset on the next empty-canvas click.
// `placedIds` is the set of asset ids already on the canvas (shown as disabled).
export const LIBRARY_DRAG_TYPE = "application/x-widispatch-assets";
export const TRANSMISSION_SYSTEM_DRAG_TYPE = "application/x-widispatch-transmission-system";
const NETWORK_SAVED_EVENT = "widispatch:network-saved";

export default function NetworkPalette({ onPick, onPickSystem, placedIds, armedId, armedSystemId }) {
  const [assets, setAssets] = useState(null);
  const [systems, setSystems] = useState(null);
  const [error, setError] = useState(null);
  const [systemsError, setSystemsError] = useState(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [region, setRegion] = useState("all");
  const [subtype, setSubtype] = useState("all");
  const [activeTab, setActiveTab] = useState("assets");
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    fetchAssets({ limit: 5000 })
      .then((d) => !cancelled && setAssets(d.assets || []))
      .catch((e) => !cancelled && setError(e.message || "Couldn't load assets"));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      setSystemsError(null);
      fetchTransmissionSystemLibrary()
        .then((d) => !cancelled && setSystems(d.systems || []))
        .catch((e) => !cancelled && setSystemsError(e.message || "Couldn't load transmission systems"));
    };
    refresh();
    window.addEventListener(NETWORK_SAVED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(NETWORK_SAVED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    if (!placedIds?.size) return;
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => !placedIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [placedIds]);

  const regions = useMemo(() => {
    if (!assets) return [];
    return Array.from(new Set(filterAllowedAssets(assets).map((a) => a.region).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [assets]);

  // Subtypes (asset_type) offered for the chosen category (SWIIMS library
  // subtype filter); the list is grouped under subtype headings.
  const subtypes = useMemo(() => {
    if (!assets) return [];
    return Array.from(
      new Set(
        filterAllowedAssets(assets)
          .filter((a) => category === "all" || a.category === category)
          .map((a) => a.asset_type)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [assets, category]);

  const items = useMemo(() => {
    if (!assets) return [];
    const needle = q.trim().toLowerCase();
    const filtered = filterAllowedAssets(assets).filter((a) => {
      if (category !== "all" && a.category !== category) return false;
      if (region !== "all" && a.region !== region) return false;
      if (subtype !== "all" && a.asset_type !== subtype) return false;
      if (!needle) return true;
      return (
        (a.name || "").toLowerCase().includes(needle) ||
        (a.id || "").toLowerCase().includes(needle) ||
        (a.region || "").toLowerCase().includes(needle) ||
        (a.activity || "").toLowerCase().includes(needle) ||
        (a.asset_type || "").toLowerCase().includes(needle) ||
        (a.status || "").toLowerCase().includes(needle)
      );
    });
    return [...filtered].sort((a, b) => {
      const categoryDelta = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
      if (categoryDelta !== 0) return categoryDelta;
      const subtypeDelta = (a.asset_type || "").localeCompare(b.asset_type || "");
      if (subtypeDelta !== 0) return subtypeDelta;
      return (a.name || a.id || "").localeCompare(b.name || b.id || "");
    });
  }, [assets, q, category, region, subtype]);

  const availableItems = useMemo(
    () => items.filter((a) => !placedIds?.has(a.id)),
    [items, placedIds]
  );

  const systemItems = useMemo(() => {
    if (!systems) return [];
    const needle = q.trim().toLowerCase();
    const filtered = systems.filter((system) => {
      if (!needle) return true;
      return [system.name, system.id].filter(Boolean).some((field) => String(field).toLowerCase().includes(needle));
    });
    return [...filtered].sort((a, b) => (a.name || a.id || "").localeCompare(b.name || b.id || ""));
  }, [systems, q]);

  const selectedAssets = useMemo(() => {
    if (!assets) return [];
    return filterAllowedAssets(assets).filter((a) => selectedIds.has(a.id) && !placedIds?.has(a.id));
  }, [assets, selectedIds, placedIds]);

  const selectedCount = selectedAssets.length;

  const toggleSelected = (assetId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const clearSelected = () => setSelectedIds(new Set());

  const selectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      availableItems.forEach((a) => next.add(a.id));
      return next;
    });
  };

  const placeSelected = () => {
    if (!selectedAssets.length) return;
    onPick(selectedAssets);
  };

  const startDrag = (event, asset) => {
    if (placedIds?.has(asset.id)) {
      event.preventDefault();
      return;
    }
    const dragAssets =
      selectedIds.has(asset.id) && selectedAssets.length > 1 ? selectedAssets : [asset];
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(LIBRARY_DRAG_TYPE, JSON.stringify(dragAssets));
    event.dataTransfer.setData("text/plain", dragAssets.map((a) => a.name || a.id).join(", "));
  };

  const startSystemDrag = (event, system) => {
    if (!system?.nodeCount || !system?.pipeCount) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(TRANSMISSION_SYSTEM_DRAG_TYPE, JSON.stringify({ id: system.id }));
    event.dataTransfer.setData("text/plain", system.name || system.id);
  };

  const assetGroups = useMemo(() => {
    const groups = [];
    items.forEach((asset) => {
      const key = `${asset.category}|${asset.asset_type || ""}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(asset);
      else groups.push({ key, category: asset.category, subtype: asset.asset_type, items: [asset] });
    });
    return groups;
  }, [items]);

  const renderAsset = (a) => {
    const placed = placedIds?.has(a.id);
    const selected = selectedIds.has(a.id) && !placed;
    const armed = armedId === a.id || (Array.isArray(armedId) && armedId.includes(a.id));
    const Icon = CATEGORY_ICONS[a.category] || CircleDot;
    const sub = [a.region, formatCapacity(a)].filter(Boolean).join(" · ");
    return (
      <div
        key={`${a.category}-${a.id}`}
        data-asset-id={a.id}
        className={`sl-row${armed || selected ? " is-selected" : ""}${placed ? " is-disabled" : ""}`}
        style={{ "--sl-colour": ENTITY_TYPE_COLORS[a.category] || "#3b82f6" }}
        onClick={() => !placed && onPick(a)}
        draggable={!placed}
        onDragStart={(e) => startDrag(e, a)}
        onKeyDown={(e) => {
          if (!placed && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onPick(a);
          }
        }}
        role="button"
        tabIndex={placed ? -1 : 0}
        title={placed ? `${a.name || a.id} is already on the canvas` : "Click, then click the canvas to place, or drag it onto the canvas"}
        aria-disabled={placed}
      >
        <input
          className="sl-row__check"
          type="checkbox"
          checked={selected}
          disabled={placed}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSelected(a.id)}
          aria-label={`Select ${a.name || a.id}`}
        />
        <span className="sl-row__icon" aria-hidden="true"><Icon size={15} /></span>
        <span className="sl-row__text">
          <span className="sl-row__name">{a.name || a.id}</span>
          {sub && <span className="sl-row__sub">{sub}</span>}
        </span>
        <span className="sl-row__aside">
          {placed ? (
            <span className="sl-tag">On canvas</span>
          ) : (
            <span className={`sl-dot sl-dot--${statusTone(a.status)}`} title={statusLabel(a.status)} aria-label={statusLabel(a.status)} />
          )}
        </span>
      </div>
    );
  };

  return (
    <>
      {/* Second-level tabs (under Networks | Library), styled as underline
          tabs so they read as a sub-choice rather than a peer of those. */}
      <div className="nb-subtabs" role="tablist" aria-label="Library sources">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "assets"}
          className={`nb-subtab${activeTab === "assets" ? " is-active" : ""}`}
          onClick={() => setActiveTab("assets")}
        >
          Assets
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "systems"}
          className={`nb-subtab${activeTab === "systems" ? " is-active" : ""}`}
          onClick={() => setActiveTab("systems")}
        >
          Systems
        </button>
      </div>

      <div className="sl-tools">
        <label className="sl-search">
          <Search size={13} aria-hidden="true" />
          <input
            type="search"
            aria-label={activeTab === "assets" ? "Search network assets" : "Search transmission systems"}
            placeholder={activeTab === "assets" ? "Search assets" : "Search systems"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {activeTab === "assets" && (
          <>
            <div className="sl-chips" role="group" aria-label="Filter by category">
              {["all", ...CATEGORY_ORDER].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`sl-chip${category === cat ? " is-active" : ""}`}
                  aria-pressed={category === cat}
                  onClick={() => {
                    setCategory(cat);
                    setSubtype("all");
                  }}
                >
                  {cat !== "all" && <span className="sl-chip__dot" style={{ background: ENTITY_TYPE_COLORS[cat] }} aria-hidden="true" />}
                  {cat === "all" ? "All" : CHIP_LABELS[cat] || ENTITY_TYPE_LABELS[cat] || cat}
                </button>
              ))}
            </div>
            <div className="sl-tools__grid">
              <select className="sl-select" aria-label="Filter assets by region" value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="all">All regions</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select
                className="sl-select"
                aria-label="Filter assets by subtype"
                value={subtype}
                onChange={(e) => setSubtype(e.target.value)}
                disabled={!subtypes.length}
              >
                <option value="all">All subtypes</option>
                {subtypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {activeTab === "assets" && (
        selectedCount ? (
          <div className="sl-bar sl-bar--active" role="status">
            <span className="sl-bar__text">{selectedCount} selected</span>
            <button type="button" className="sl-link" onClick={clearSelected}>Clear</button>
            <button type="button" className="sl-btn sl-btn--primary sl-btn--sm" onClick={placeSelected}>
              <MapPinPlus size={12} aria-hidden="true" /> Place
            </button>
          </div>
        ) : (
          <div className="sl-bar">
            <span className="sl-bar__text">Click or drag to place · tick to place several</span>
            <button type="button" className="sl-link" onClick={selectAllVisible} disabled={!availableItems.length}>
              Select all
            </button>
          </div>
        )
      )}

      <div className="sl-body">
        {activeTab === "assets" && (
          <>
            {error && <div className="sl-empty">{error}</div>}
            {!assets && !error && <div className="sl-empty">Loading assets…</div>}
            {assets && items.length === 0 && !error && <div className="sl-empty">No assets match these filters.</div>}
            {assetGroups.map((group) => (
              <section key={group.key} aria-label={ENTITY_TYPE_LABELS[group.category] || group.category}>
                <div className="sl-group">
                  <span className="sl-group__label">
                    {ENTITY_TYPE_LABELS[group.category] || group.category}
                    {group.subtype ? ` · ${group.subtype}` : ""}
                  </span>
                  <span className="sl-group__count">{group.items.length}</span>
                </div>
                {group.items.map(renderAsset)}
              </section>
            ))}
          </>
        )}

        {activeTab === "systems" && (
          <>
            {systemsError && <div className="sl-empty">{systemsError}</div>}
            {!systems && !systemsError && <div className="sl-empty">Loading systems…</div>}
            {systems && systemItems.length === 0 && !systemsError && <div className="sl-empty">No matching systems.</div>}
            {systemItems.length > 0 && (
              <div className="sl-group">
                <span className="sl-group__label">Transmission systems</span>
                <span className="sl-group__count">{systemItems.length}</span>
              </div>
            )}
            {systemItems.map((system) => {
              const armed = armedSystemId === system.id;
              const canPlace = !!system.nodeCount && !!system.pipeCount;
              const sub = canPlace
                ? [
                    `${system.nodeCount} node${system.nodeCount === 1 ? "" : "s"}`,
                    `${system.pipeCount} pipe${system.pipeCount === 1 ? "" : "s"}`,
                    `${system.lineCount || 0} line${system.lineCount === 1 ? "" : "s"}`,
                  ].join(" · ")
                : "No saved canvas structure yet";
              return (
                <div
                  key={system.id}
                  className={`sl-row${armed ? " is-selected" : ""}${!canPlace ? " is-disabled" : ""}`}
                  onClick={() => canPlace && onPickSystem?.(system)}
                  draggable={canPlace}
                  onDragStart={(e) => startSystemDrag(e, system)}
                  onKeyDown={(e) => {
                    if (canPlace && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onPickSystem?.(system);
                    }
                  }}
                  role="button"
                  tabIndex={canPlace ? 0 : -1}
                  title={canPlace ? "Click, then click the canvas to place, or drag it onto the canvas" : "Save pipes for this system before placing it on the canvas"}
                  aria-disabled={!canPlace}
                >
                  <span className="sl-row__icon" aria-hidden="true"><Network size={15} /></span>
                  <span className="sl-row__text">
                    <span className="sl-row__name">{system.name || system.id}</span>
                    <span className="sl-row__sub">{sub}</span>
                  </span>
                  {!!system.networkCount && (
                    <span className="sl-row__aside">
                      <span className="sl-tag" title="Saved networks that use this system">{system.networkCount} network{system.networkCount === 1 ? "" : "s"}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
