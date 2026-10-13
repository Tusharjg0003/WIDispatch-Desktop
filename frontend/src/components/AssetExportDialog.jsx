import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, FileSpreadsheet, FileText, FileType, Loader2, Search, X } from "lucide-react";
import {
  ASSET_COLUMNS,
  CATEGORY_PLURALS,
  COLUMN_PRESETS,
  EMPTY_FILTERS,
  columnGroups,
  describeFilters,
  exportAssetsCsv,
  exportAssetsPdf,
  exportAssetsXlsx,
  filterAssets,
  filterOptions,
  sortAssets,
  statusLabel,
} from "../lib/assetExport";
import { alertDialog } from "./dialog/appDialog";
import "./AssetExportDialog.css";

// Export for the asset lists (Asset Registry, Production, Demand, Economics):
// pick which assets (filters, then all of them or hand-picked ones), which
// columns, and a format (Excel, PDF or CSV). Each page passes its own column
// catalogue and presets; the format, columns and layout options are
// remembered per page on this device, and the filters start from the page's.

const STORAGE_PREFIX = "widispatch.assetExport";
const FORMATS = [
  { id: "xlsx", label: "Excel", ext: ".xlsx", icon: FileSpreadsheet },
  { id: "pdf", label: "PDF", ext: ".pdf", icon: FileText },
  { id: "csv", label: "CSV", ext: ".csv", icon: FileType },
];
const PRESET_LABELS = {
  essentials: "Essentials",
  summary: "Summary",
  location: "Location",
  capacity: "Capacity",
  costs: "Costs",
  networks: "Networks",
  assets: "Assets",
  all: "All",
};
const PDF_WIDE = 14;

const NO_TAG_FILTERS = [];

const storageKeyFor = (key) => (key ? `${STORAGE_PREFIX}.${key}` : STORAGE_PREFIX);

const readSaved = (key, catalog) => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(storageKeyFor(key)) || "null");
    if (!raw || typeof raw !== "object") return null;
    const known = new Set(catalog.map((c) => c.id));
    return {
      format: FORMATS.some((f) => f.id === raw.format) ? raw.format : "xlsx",
      columns: Array.isArray(raw.columns) ? raw.columns.filter((id) => known.has(id)) : null,
      split: Boolean(raw.split),
    };
  } catch {
    return null;
  }
};

const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

function ChipGroup({ label, options, selected, onChange, format = (v) => v }) {
  if (!options.length) return null;
  return (
    <fieldset className="ax-chips">
      <legend>
        {label}
        {selected.length > 0 && (
          <button type="button" className="ax-link" onClick={() => onChange([])}>Any</button>
        )}
      </legend>
      <div className="ax-chips__list">
        {options.map((value) => {
          const on = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              className={`ax-chip${on ? " is-on" : ""}`}
              aria-pressed={on}
              onClick={() => onChange(toggle(selected, value))}
            >
              {on && <Check size={11} aria-hidden="true" />}
              {format(value)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * `catalog` / `presets` / `sort`: the page's columns, preset buttons and row
 * order (defaults: the whole registry). `title` names the report and file;
 * `noun` is what the rows are ("plants"); `storageKey` keeps each page's
 * choices apart.
 */
export default function AssetExportDialog({
  assets,
  initialFilters = EMPTY_FILTERS,
  onClose,
  title = "Asset Registry",
  noun = "assets",
  catalog = ASSET_COLUMNS,
  presets = COLUMN_PRESETS,
  sort = sortAssets,
  storageKey = "",
  // The page's own filters: [{ key: "network", label: "Network" }] over each
  // record's `tags`.
  tagFilters = NO_TAG_FILTERS,
  searchPlaceholder = "Search name, ID, city, entity…",
}) {
  const saved = useMemo(() => readSaved(storageKey, catalog), [storageKey, catalog]);
  const [format, setFormat] = useState(saved?.format || "xlsx");
  const [columns, setColumns] = useState(() => (saved?.columns?.length ? saved.columns : presets.essentials || presets[Object.keys(presets)[0]]));
  const [split, setSplit] = useState(saved?.split ?? false);
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, ...initialFilters, tags: { ...(initialFilters.tags || {}) } }));
  const [pickMode, setPickMode] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [pickQuery, setPickQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKeyFor(storageKey), JSON.stringify({ format, columns, split }));
    } catch {
      // Storage unavailable: the choices last for this dialog only.
    }
  }, [format, columns, split, storageKey]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    cardRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, busy]);

  const tagKeys = useMemo(() => tagFilters.map((t) => t.key), [tagFilters]);
  const tagLabels = useMemo(() => Object.fromEntries(tagFilters.map((t) => [t.key, t.label])), [tagFilters]);
  const options = useMemo(() => filterOptions(assets, tagKeys), [assets, tagKeys]);
  const matching = useMemo(() => sort(filterAssets(assets, filters)), [assets, filters, sort]);
  // Hand-picked assets that a filter change has since hidden don't count.
  const pickedMatching = useMemo(() => matching.filter((a) => picked.has(a.id)), [matching, picked]);
  const exporting = pickMode ? pickedMatching : matching;

  const shownToPick = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    if (!q) return matching;
    return matching.filter((a) => [a.name, a.id, a.city, a.region, a.meta_text].some((v) => v && String(v).toLowerCase().includes(q)));
  }, [matching, pickQuery]);

  // Details that none of the exported categories has are listed but marked.
  const categoriesInPlay = useMemo(() => new Set(exporting.map((a) => a.category)), [exporting]);
  const applies = (c) => !c.categories || c.categories.some((cat) => categoriesInPlay.has(cat));

  const chosen = catalog.filter((c) => columns.includes(c.id));
  // One kind of asset (Production, Demand…): no category filter or per-category split.
  const singleCategory = options.categories.length <= 1;
  const chosenUseful = chosen.filter(applies);

  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const setTagFilter = (key) => (value) => setFilters((f) => ({ ...f, tags: { ...f.tags, [key]: value } }));
  const filtersText = describeFilters(filters, tagLabels);
  const filtering = filtersText !== "";

  const startPicking = () => {
    setPickMode(true);
    // Start from everything that matches, so unticking is the quick path.
    if (!picked.size) setPicked(new Set(matching.map((a) => a.id)));
  };

  const run = async () => {
    if (!exporting.length || !chosen.length || busy) return;
    setBusy(true);
    try {
      const ids = chosen.map((c) => c.id);
      const sheetName = noun.charAt(0).toUpperCase() + noun.slice(1);
      const opts = { filters, filtersText, picked: pickMode, title, noun, catalog, sort };
      const perCategory = split && !singleCategory;
      if (format === "xlsx") await exportAssetsXlsx(exporting, ids, { ...opts, sheetName, sheetPerCategory: perCategory });
      else if (format === "pdf") await exportAssetsPdf(exporting, ids, { ...opts, groupSections: perCategory });
      else await exportAssetsCsv(exporting, ids, { title, catalog, sort });
      onClose();
    } catch (error) {
      setBusy(false);
      await alertDialog({ title: "Export failed", message: error?.message || String(error), tone: "danger" });
    }
  };

  const fmt = FORMATS.find((f) => f.id === format);
  const groups = columnGroups(catalog).map((group) => [group, catalog.filter((c) => c.group === group)]);

  return (
    <div className="ax" role="presentation">
      <section
        ref={cardRef}
        className="ax__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ax-title"
        tabIndex={-1}
      >
        <header className="ax__head">
          <span className="ax__icon" aria-hidden="true"><Download size={17} /></span>
          <div>
            <h2 id="ax-title">Export {noun}</h2>
            <p>{title} · choose the {noun} and the columns, then a format.</p>
          </div>
          <button type="button" className="ax__close" onClick={onClose} aria-label="Close" disabled={busy}><X size={16} /></button>
        </header>

        <div className="ax__body">
          {/* ── Which assets ─────────────────────────────────────────── */}
          <div className="ax__col">
            <div className="ax__section-head">
              <h3>1 · {noun}</h3>
              {filtering && <button type="button" className="ax-link" onClick={() => setFilters({ ...EMPTY_FILTERS, tags: {} })}>Clear filters</button>}
            </div>

            <label className="ax-search">
              <Search size={13} aria-hidden="true" />
              <input
                type="search"
                placeholder={searchPlaceholder}
                value={filters.query}
                onChange={(e) => setFilter("query")(e.target.value)}
              />
            </label>

            {!singleCategory && <ChipGroup label="Category" options={options.categories} selected={filters.categories} onChange={setFilter("categories")} format={(c) => CATEGORY_PLURALS[c] || c} />}
            <ChipGroup label="Status" options={options.statuses} selected={filters.statuses} onChange={setFilter("statuses")} format={statusLabel} />
            <ChipGroup label="Region" options={options.regions} selected={filters.regions} onChange={setFilter("regions")} />
            <ChipGroup label="Entity" options={options.entities} selected={filters.entities} onChange={setFilter("entities")} />
            <ChipGroup label="Asset type" options={options.assetTypes} selected={filters.assetTypes} onChange={setFilter("assetTypes")} />
            {tagFilters.map(({ key, label }) => (
              <ChipGroup key={key} label={label} options={options.tags[key] || []} selected={filters.tags[key] || []} onChange={setTagFilter(key)} />
            ))}

            <div className="ax-pick" role="radiogroup" aria-label="Which of the matching assets">
              <label className={`ax-radio${!pickMode ? " is-on" : ""}`}>
                <input type="radio" name="ax-pick" checked={!pickMode} onChange={() => setPickMode(false)} />
                All <strong>{matching.length}</strong> matching {matching.length === 1 ? noun.replace(/s$/, "") : noun}
              </label>
              <label className={`ax-radio${pickMode ? " is-on" : ""}`}>
                <input type="radio" name="ax-pick" checked={pickMode} onChange={startPicking} disabled={!matching.length} />
                Pick {noun}{pickMode && <> · <strong>{pickedMatching.length}</strong> picked</>}
              </label>
            </div>

            {pickMode && (
              <div className="ax-picklist">
                <div className="ax-picklist__bar">
                  <label className="ax-search ax-search--small">
                    <Search size={12} aria-hidden="true" />
                    <input type="search" placeholder="Find in list" value={pickQuery} onChange={(e) => setPickQuery(e.target.value)} />
                  </label>
                  <button type="button" className="ax-link" onClick={() => setPicked((p) => new Set([...p, ...shownToPick.map((a) => a.id)]))}>Select all</button>
                  <button type="button" className="ax-link" onClick={() => setPicked((p) => { const n = new Set(p); shownToPick.forEach((a) => n.delete(a.id)); return n; })}>None</button>
                </div>
                <ul>
                  {shownToPick.map((a) => (
                    <li key={a.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={picked.has(a.id)}
                          onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}
                        />
                        <span className="ax-picklist__name">{a.name || a.id}</span>
                        <span className="ax-picklist__meta">{a.meta_text ?? `${CATEGORY_PLURALS[a.category]?.replace(/s$/, "") || a.category}${a.city ? ` · ${a.city}` : ""}`}</span>
                      </label>
                    </li>
                  ))}
                  {!shownToPick.length && <li className="ax-picklist__empty">Nothing matches.</li>}
                </ul>
              </div>
            )}
          </div>

          {/* ── Columns and format ───────────────────────────────────── */}
          <div className="ax__col">
            <div className="ax__section-head">
              <h3>2 · Columns <span className="ax__count">{chosen.length}</span></h3>
              <div className="ax-presets" role="group" aria-label="Column presets">
                {Object.entries(presets).map(([id, list]) => (
                  <button key={id} type="button" className="ax-preset" onClick={() => setColumns(list)}>{PRESET_LABELS[id] || id}</button>
                ))}
                <button type="button" className="ax-preset" onClick={() => setColumns([])}>None</button>
              </div>
            </div>

            <div className="ax-columns">
              {groups.map(([group, cols]) => {
                const allOn = cols.every((c) => columns.includes(c.id));
                const usable = cols.some(applies);
                return (
                  <fieldset key={group} className={`ax-group${usable ? "" : " is-idle"}`}>
                    <legend>
                      <label>
                        <input
                          type="checkbox"
                          checked={allOn}
                          ref={(el) => { if (el) el.indeterminate = !allOn && cols.some((c) => columns.includes(c.id)); }}
                          onChange={() => setColumns((list) => (allOn ? list.filter((id) => !cols.some((c) => c.id === id)) : [...new Set([...list, ...cols.map((c) => c.id)])]))}
                        />
                        {group}
                      </label>
                      {!usable && <span className="ax-group__note">none of these assets</span>}
                    </legend>
                    {cols.map((c) => (
                      <label key={c.id} className={`ax-col${applies(c) ? "" : " is-idle"}`} title={applies(c) ? undefined : "None of the assets being exported have this detail"}>
                        <input type="checkbox" checked={columns.includes(c.id)} onChange={() => setColumns((list) => toggle(list, c.id))} />
                        {c.label}
                      </label>
                    ))}
                  </fieldset>
                );
              })}
            </div>

            <div className="ax__section-head ax__section-head--format">
              <h3>3 · Format</h3>
            </div>
            <div className="ax-formats" role="radiogroup" aria-label="File format">
              {FORMATS.map(({ id, label, ext, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={format === id}
                  className={`ax-format${format === id ? " is-on" : ""}`}
                  onClick={() => setFormat(id)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{label}</span>
                  <small>{ext}</small>
                </button>
              ))}
            </div>
            {format !== "csv" && !singleCategory && (
              <label className="ax-option">
                <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
                {format === "xlsx" ? "One sheet per category" : "A section per category"}
                <span>— each with only its own details</span>
              </label>
            )}
            {format === "pdf" && chosen.length > PDF_WIDE && (
              <p className="ax-note">{chosen.length} columns print on A3 landscape; long values wrap within their cells.</p>
            )}
            {format === "csv" && <p className="ax-note">One table, opens in any spreadsheet. Arabic names are kept.</p>}
          </div>
        </div>

        <footer className="ax__foot">
          <p className="ax__summary" aria-live="polite">
            {!exporting.length
              ? `No ${noun} to export — loosen the filters or pick some ${noun}.`
              : !chosen.length
              ? "Choose at least one column."
              : <>Exporting <strong>{exporting.length}</strong> {exporting.length === 1 ? noun.replace(/s$/, "") : noun} × <strong>{chosen.length}</strong> column{chosen.length === 1 ? "" : "s"} as {fmt.label}
                {chosenUseful.length < chosen.length && <> ({chosen.length - chosenUseful.length} will be blank)</>}</>}
          </p>
          <button type="button" className="app-dialog__btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="app-dialog__btn app-dialog__btn--primary ax__go"
            onClick={run}
            disabled={busy || !exporting.length || !chosen.length}
          >
            {busy ? <Loader2 size={14} className="ax-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
            {busy ? "Exporting…" : `Export ${fmt.label}`}
          </button>
        </footer>
      </section>
    </div>
  );
}
