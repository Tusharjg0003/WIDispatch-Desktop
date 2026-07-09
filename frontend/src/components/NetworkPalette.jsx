import React, { useEffect, useMemo, useState } from "react";
import { fetchAssets } from "../api/metrics";
import {
  CATEGORY_ORDER,
  ENTITY_TYPE_ABBREVIATIONS,
  ENTITY_TYPE_COLORS,
  ENTITY_TYPE_LABELS,
} from "../cytoscape/buildCyStyle";

function firstPresent(...values) {
  return values.find((value) => value != null && value !== "");
}

function formatCapacity(asset) {
  const spec = asset.specifications || {};
  const value = firstPresent(
    spec.design_capacity,
    spec.maximum_capacity,
    spec.contracted_capacity,
    spec.expansion_capacity,
    spec.capacity
  );
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${numericValue.toLocaleString()} m3/day` : "";
}

function chipTone(value) {
  const normalized = String(value || "").toLowerCase().replace(/[_\s-]+/g, "-");
  if (normalized.includes("operational") || normalized === "in-operation") return "operational";
  if (normalized.includes("construction")) return "construction";
  if (normalized.includes("planned")) return "planned";
  if (normalized.includes("water-production")) return "activity";
  return "";
}

// DB-backed asset library rendered into the left sidebar. Clicking a row "arms"
// placement — the page then drops the asset on the next empty-canvas click.
// `placedIds` is the set of asset ids already on the canvas (shown as disabled).
const LIBRARY_DRAG_TYPE = "application/x-widispatch-assets";

export default function NetworkPalette({ onPick, placedIds, armedId }) {
  const [assets, setAssets] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [region, setRegion] = useState("all");
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
    if (!placedIds?.size) return;
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => !placedIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [placedIds]);

  const regions = useMemo(() => {
    if (!assets) return [];
    return Array.from(new Set(assets.map((a) => a.region).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [assets]);

  const items = useMemo(() => {
    if (!assets) return [];
    const needle = q.trim().toLowerCase();
    const filtered = assets.filter((a) => {
      if (category !== "all" && a.category !== category) return false;
      if (region !== "all" && a.region !== region) return false;
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
      return (a.name || a.id || "").localeCompare(b.name || b.id || "");
    });
  }, [assets, q, category, region]);

  const availableItems = useMemo(
    () => items.filter((a) => !placedIds?.has(a.id)),
    [items, placedIds]
  );

  const selectedAssets = useMemo(() => {
    if (!assets) return [];
    return assets.filter((a) => selectedIds.has(a.id) && !placedIds?.has(a.id));
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

  return (
    <>
      <div className="ns2-library-filters">
        <input
          className="ns2-input"
          type="search"
          placeholder="Search assets…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="ns2-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All</option>
          {CATEGORY_ORDER.map((cat) => (
            <option key={cat} value={cat}>
              {ENTITY_TYPE_LABELS[cat] || cat}
            </option>
          ))}
        </select>
        <select
          className="ns2-input"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="all">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="ns2-library-selection">
        <div className="ns2-library-selection-count">
          {selectedCount ? `${selectedCount} selected` : "Select assets to place together"}
        </div>
        <div className="ns2-library-selection-actions">
          <button
            type="button"
            className="ns2-btn ns2-btn--sm"
            onClick={selectAllVisible}
            disabled={!availableItems.length}
          >
            Select all
          </button>
          <button
            type="button"
            className="ns2-btn ns2-btn--sm"
            onClick={clearSelected}
            disabled={!selectedIds.size}
          >
            Clear
          </button>
          <button
            type="button"
            className="ns2-btn ns2-btn--sm"
            onClick={placeSelected}
            disabled={!selectedCount}
          >
            Place selected
          </button>
        </div>
      </div>

      <div className="ns2-library-body">
        {error && <div className="ns2-library-empty">{error}</div>}
        {!assets && !error && <div className="ns2-library-empty">Loading assets…</div>}
        {assets && items.length === 0 && !error && (
          <div className="ns2-library-empty">No matching assets.</div>
        )}

        {items.map((a) => {
          const placed = placedIds?.has(a.id);
          const selected = selectedIds.has(a.id) && !placed;
          const armed = armedId === a.id || (Array.isArray(armedId) && armedId.includes(a.id));
          const typeColor = ENTITY_TYPE_COLORS[a.category] || "#3b82f6";
          const typeTag = ENTITY_TYPE_ABBREVIATIONS[a.category] || "AS";
          const metaItems = [
            a.region,
            a.activity,
            a.asset_type,
            a.status,
          ].filter(Boolean);
          const capacity = formatCapacity(a);
          return (
            <div
              key={`${a.category}-${a.id}`}
              className={`ns2-library-item${armed || selected ? " ns2-library-item--selected" : ""}${placed ? " ns2-library-item--placed" : ""}`}
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
              title={placed ? "Already on canvas" : "Click, then click the canvas to place"}
              aria-disabled={placed}
            >
              <div className="ns2-library-item-header">
                <input
                  className="ns2-library-item-checkbox"
                  type="checkbox"
                  checked={selected}
                  disabled={placed}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelected(a.id)}
                  aria-label={`Select ${a.name || a.id}`}
                />
                <span
                  className="ns2-library-type-badge"
                  style={{ backgroundColor: typeColor, borderColor: typeColor }}
                  title={ENTITY_TYPE_LABELS[a.category] || a.category}
                >
                  {typeTag}
                </span>
                <span className="ns2-library-item-name">{a.name || a.id}</span>
                {placed && <span className="ns2-placed-badge">on canvas</span>}
              </div>
              <div className="ns2-library-item-meta">
                {metaItems.map((meta) => (
                  <span key={meta} data-tone={chipTone(meta) || undefined}>{meta}</span>
                ))}
              </div>
              {capacity && <div className="ns2-library-item-capacity">{capacity}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
