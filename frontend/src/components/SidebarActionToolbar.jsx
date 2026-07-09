import React from "react";
import { ArrowDownUp, CalendarDays, LayoutList, Plus, Search, Trash2, X } from "lucide-react";

const ICON_ROOT = "/All Icons Zipped";
const ICONS = {
  add: `${ICON_ROOT}/15 UI Utility Icons (System-Level)/Add/SVG/Add_20px.svg`,
  search: `${ICON_ROOT}/01 Core Navigation-System/Search/SVG/Search_20px.svg`,
  overview: `${ICON_ROOT}/01 Core Navigation-System/Overview/SVG/Overview_20px.svg`,
  filter: `${ICON_ROOT}/15 UI Utility Icons (System-Level)/Filter/SVG/Filter_20px.svg`,
  sort: `${ICON_ROOT}/15 UI Utility Icons (System-Level)/Sort/SVG/Sort_20px.svg`,
  delete: `${ICON_ROOT}/15 UI Utility Icons (System-Level)/Delete-Trash/SVG/Delete-Trash_20px.svg`,
  close: `${ICON_ROOT}/15 UI Utility Icons (System-Level)/Collapse/SVG/Collapse_20px.svg`,
};

function ToolbarIcon({ src, fallback: Fallback, size = 12 }) {
  if (src) return <img className="sidebar-action-toolbar__icon" src={src} alt="" aria-hidden="true" />;
  if (Fallback) return <Fallback size={size} />;
  return null;
}

const RANGES = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

const SORTS = [
  { key: "updated", label: "Last updated" },
  { key: "name", label: "Name" },
];

const RANGE_SPAN_MS = { today: 864e5, week: 7 * 864e5, month: 30 * 864e5 };

export function applyRangeFilter(records, range) {
  const span = RANGE_SPAN_MS[range];
  if (!span) return records;
  const now = Date.now();
  return records.filter((r) => {
    const t = Date.parse(r.updated_at || r.updatedAt || r.created_at || r.createdAt || "");
    return Number.isFinite(t) && now - t <= span;
  });
}

export function applySort(records, key, order, nameFn, dateFn) {
  const sorted = [...records].sort((a, b) => {
    if (key === "name") return String(nameFn(a)).localeCompare(String(nameFn(b)));
    return (Date.parse(dateFn(a) || "") || 0) - (Date.parse(dateFn(b) || "") || 0);
  });
  if (order === "desc") sorted.reverse();
  return sorted;
}

// New-record button + search/filter/sort/delete-mode controls for
// WorkspaceRecordSidebar. Swaps to a single confirm/cancel row while a bulk
// delete selection is in progress.
export default function SidebarActionToolbar({
  createTitle,
  onCreate,
  searchTerm,
  setSearchTerm,
  searchOpen,
  setSearchOpen,
  filterRange,
  setFilterRange,
  sortKey,
  sortOrder,
  setSort,
  inDeleteMode,
  setInDeleteMode,
  selectedCount,
  deleting,
  onConfirmDelete,
  showFilter = true,
  showSort = true,
  showDelete = true,
  overviewTitle,
  onOverview,
  extraActions = [],
}) {
  if (inDeleteMode) {
    return (
      <div className="sidebar-action-toolbar">
        <div className="sidebar-action-toolbar__buttons">
          <button
            type="button"
            className="sidebar-content__action-btn sidebar-action-toolbar__delete-btn"
            disabled={selectedCount === 0 || deleting}
            onClick={onConfirmDelete}
          >
            <ToolbarIcon src={ICONS.delete} fallback={Trash2} size={11} /> {deleting ? "Deleting…" : `Delete${selectedCount ? ` (${selectedCount})` : ""}`}
          </button>
          <button
            type="button"
            className="sidebar-action-toolbar__button"
            title="Cancel"
            disabled={deleting}
            onClick={() => setInDeleteMode(false)}
          >
            <ToolbarIcon src={ICONS.close} fallback={X} />
          </button>
        </div>
      </div>
    );
  }

  const buttonCount = 2 + (showFilter ? 1 : 0) + (showSort ? 1 : 0) + (showDelete ? 1 : 0)
    + (onOverview ? 1 : 0) + extraActions.length;

  return (
    <div className="sidebar-action-toolbar">
      <div
        className="sidebar-action-toolbar__buttons sidebar-action-toolbar__buttons--filters"
        style={{ gridTemplateColumns: `repeat(${buttonCount}, minmax(0, 1fr))` }}
      >
        <button
          type="button"
          className="sidebar-action-toolbar__button sidebar-action-toolbar__button--create"
          title={createTitle}
          onClick={onCreate}
        >
          <ToolbarIcon src={ICONS.add} fallback={Plus} />
        </button>
        <button
          type="button"
          className={`sidebar-action-toolbar__button${searchOpen ? " active" : ""}`}
          title="Search"
          onClick={() => setSearchOpen((v) => !v)}
        >
          <ToolbarIcon src={ICONS.search} fallback={Search} />
        </button>
        {onOverview && (
          <button
            type="button"
            className="sidebar-action-toolbar__button"
            title={overviewTitle}
            onClick={onOverview}
          >
            <ToolbarIcon src={ICONS.overview} fallback={LayoutList} />
          </button>
        )}
        {showFilter && (
          <span className="sidebar-action-toolbar__select-icon" title="Filter by date">
            <ToolbarIcon src={ICONS.filter} fallback={CalendarDays} />
            <select
              className="sidebar-content__filter-select sidebar-action-toolbar__select"
              value={filterRange}
              onChange={(e) => setFilterRange(e.target.value)}
              aria-label="Filter by date"
            >
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </span>
        )}
        {showSort && (
          <span className="sidebar-action-toolbar__select-icon" title="Sort records">
            <ToolbarIcon src={ICONS.sort} fallback={ArrowDownUp} />
            <select
              className="sidebar-content__filter-select sidebar-action-toolbar__select"
              value={`${sortKey}:${sortOrder}`}
              onChange={(e) => {
                const [key, order] = e.target.value.split(":");
                setSort(key, order);
              }}
              aria-label="Sort records"
            >
              {SORTS.flatMap((s) => [
                <option key={`${s.key}:desc`} value={`${s.key}:desc`}>{s.label} ↓</option>,
                <option key={`${s.key}:asc`} value={`${s.key}:asc`}>{s.label} ↑</option>,
              ])}
            </select>
          </span>
        )}
        {showDelete && (
          <button
            type="button"
            className="sidebar-action-toolbar__button"
            title="Select & delete"
            onClick={() => setInDeleteMode(true)}
          >
            <ToolbarIcon src={ICONS.delete} fallback={Trash2} />
          </button>
        )}
        {extraActions.map(({ title, icon: Icon, iconSrc, onClick, active }, i) => (
          <button
            key={title || i}
            type="button"
            className={`sidebar-action-toolbar__button${active ? " active" : ""}`}
            title={title}
            onClick={onClick}
          >
            <ToolbarIcon src={iconSrc} fallback={Icon} />
          </button>
        ))}
      </div>

      {searchOpen && (
        <input
          type="search"
          className="sidebar-action-toolbar__search-input"
          placeholder="Search…"
          autoFocus
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      )}
    </div>
  );
}
