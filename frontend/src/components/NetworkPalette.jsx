import React, { useEffect, useMemo, useState } from "react";
import { fetchAssets } from "../api/metrics";
import { CATEGORY_ORDER, ENTITY_TYPE_LABELS } from "../cytoscape/buildCyStyle";

// DB-backed asset library rendered into the left sidebar. Clicking a row "arms"
// placement — the page then drops the asset on the next empty-canvas click.
// `placedIds` is the set of asset ids already on the canvas (shown as disabled).
export default function NetworkPalette({ onPick, placedIds, armedId }) {
  const [assets, setAssets] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    let cancelled = false;
    fetchAssets({ limit: 5000 })
      .then((d) => !cancelled && setAssets(d.assets || []))
      .catch((e) => !cancelled && setError(e.message || "Couldn't load assets"));
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    if (!assets) return [];
    const needle = q.trim().toLowerCase();
    const filtered = assets.filter((a) => {
      if (category !== "all" && a.category !== category) return false;
      if (!needle) return true;
      return (
        (a.name || "").toLowerCase().includes(needle) ||
        (a.id || "").toLowerCase().includes(needle)
      );
    });
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      label: ENTITY_TYPE_LABELS[cat] || cat,
      items: filtered.filter((a) => a.category === cat),
    })).filter((g) => g.items.length > 0);
  }, [assets, q, category]);

  return (
    <div className="np">
      <input
        className="np__search"
        type="search"
        placeholder="Search assets…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <select
        className="np__select"
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

      {error && <div className="np__notice np__notice--error">{error}</div>}
      {!assets && !error && <div className="np__notice">Loading assets…</div>}
      {assets && groups.length === 0 && !error && (
        <div className="np__notice">No matching assets.</div>
      )}

      <div className="np__groups">
        {groups.map((g) => (
          <section key={g.cat} className="np__group">
            <header className="np__group-head">
              <span className={`np__dot np__dot--${g.cat}`} />
              {g.label}
              <span className="np__group-count">{g.items.length}</span>
            </header>
            <ul className="np__list">
              {g.items.map((a) => {
                const placed = placedIds?.has(a.id);
                const armed = armedId === a.id;
                const isPipeline = a.category === "pipeline";
                const metaText = placed
                  ? "on canvas"
                  : isPipeline
                  ? "lay between two nodes"
                  : a.region || a.asset_type || a.status || "";
                return (
                  <li key={`${a.category}-${a.id}`}>
                    <button
                      className={`np__item ${armed ? "is-armed" : ""} ${placed ? "is-placed" : ""}`}
                      onClick={() => !placed && onPick(a)}
                      disabled={placed}
                      title={
                        placed
                          ? "Already on canvas"
                          : isPipeline
                          ? "Click, then click two nodes to lay the pipeline"
                          : "Click, then click the canvas to place"
                      }
                    >
                      <span className="np__item-name">{a.name || a.id}</span>
                      <span className="np__item-meta">{metaText}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
