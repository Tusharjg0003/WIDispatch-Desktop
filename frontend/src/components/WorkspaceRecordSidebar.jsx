import React, { useCallback, useEffect, useState } from "react";
import { Plus, Search, Trash2, Waypoints } from "lucide-react";
import { applyRangeFilter, applySort } from "./SidebarActionToolbar";
import "./SidebarList.css";

const RANGES = [
  { value: "all", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

/* WorkspaceRecordSidebar
   --------------------------------------------------------------------------
   Generic "saved records" sidebar: search + New, date filter / sort /
   select-to-delete, then the records as rows (icon, name, meta line, last
   update; the open one highlighted), click-to-open. Styled with the shared
   left-rail list styles (SidebarList.css).

   Adapted from a reference implementation built for an app with multi-tab
   page instances, auth/ownership (locked/shared/mine), and a legacy-data
   migration path. WIDispatch has none of those, so this version:
     - self-fetches via the `api` prop instead of a generic REST client keyed
       by a URL base (WIDispatch's api/*.js modules are per-domain functions,
       not a uniform REST resource) — { list(): Promise<Record[]>, remove(id) }.
     - navigates directly (`onSelect`/`onNew`) instead of tracking open tabs.
     - drops the locked/shared/mine status dot and the legacy-records section
       — there's no ownership or legacy-migration concept in this app.
   --------------------------------------------------------------------------
   Props
     recordLabel – Singular noun for messages/labels, e.g. "Network".
     newTitle    – Label for the create button, e.g. "New Network".
     activeId    – id of the record currently open (for row highlighting).
     api         – { list: () => Promise<record[]>, remove: (id) => Promise }
     savedEvent  – window event name to listen for and re-fetch on (dispatch
                   this after a save/update elsewhere so the list stays current).
     onNew       – called when "New" is clicked (page owns reset + navigate).
     onSelect    – called with a record's id when a row is clicked.
     getMeta     – optional (record) => string for the row's secondary line;
                   defaults to a relative "Updated …" time. */
export default function WorkspaceRecordSidebar({
  recordLabel,
  newTitle,
  activeId,
  api,
  savedEvent,
  onNew,
  onSelect,
  getMeta,
}) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRange, setFilterRange] = useState("all");
  const [sortKey, setSortKey] = useState("updated");
  const [sortOrder, setSortOrder] = useState("desc");
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setRecords(await api.list());
    } catch (error) {
      console.error(`[WorkspaceRecordSidebar:${recordLabel}] Error loading records:`, error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [api, recordLabel]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!savedEvent) return undefined;
    const handler = () => load();
    window.addEventListener(savedEvent, handler);
    return () => window.removeEventListener(savedEvent, handler);
  }, [load, savedEvent]);

  const toggleSelection = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || deleting) return;
    const n = selectedIds.size;
    if (!window.confirm(`Delete ${n} selected ${recordLabel.toLowerCase()}${n === 1 ? "" : "s"}?`)) return;
    const ids = Array.from(selectedIds);
    setDeleting(true);
    // allSettled (not all): one id failing (e.g. already gone) must not stop
    // the rest from being removed, and must not hide from the UI that some
    // succeeded.
    const results = await Promise.allSettled(ids.map((id) => api.remove(id).then(() => id)));
    const succeeded = new Set(results.filter((r) => r.status === "fulfilled").map((r) => r.value));
    const failed = results.filter((r) => r.status === "rejected");
    if (succeeded.size > 0) {
      setRecords((prev) => prev.filter((r) => !succeeded.has(r.id)));
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      succeeded.forEach((id) => next.delete(id));
      return next;
    });
    setDeleting(false);
    if (failed.length > 0) {
      failed.forEach((r) => console.error(`[WorkspaceRecordSidebar:${recordLabel}] Delete failed:`, r.reason));
      window.alert(
        `Deleted ${succeeded.size} of ${n} ${recordLabel.toLowerCase()}${n === 1 ? "" : "s"}. ` +
        `${failed.length} failed — it may already be deleted elsewhere. Try refreshing the list.`
      );
    } else {
      setDeleteMode(false);
    }
  };

  const defaultMeta = (r) => {
    const t = r.updated_at || r.updatedAt || r.created_at || r.createdAt;
    return t ? `Updated ${new Date(t).toLocaleDateString()}` : null;
  };
  const metaFor = getMeta || defaultMeta;

  let filtered = records.filter((r) =>
    (r.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.description || "").toLowerCase().includes(searchTerm.toLowerCase())
  );
  filtered = applyRangeFilter(filtered, filterRange);
  filtered = applySort(
    filtered,
    sortKey,
    sortOrder,
    (r) => r.name || "",
    (r) => r.updated_at || r.updatedAt || r.created_at || r.createdAt
  );

  const updatedLabel = (r) => {
    const t = r.updated_at || r.updatedAt || r.created_at || r.createdAt;
    if (!t) return null;
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  const exitDeleteMode = () => {
    setDeleteMode(false);
    setSelectedIds(new Set());
  };
  const plural = `${recordLabel.toLowerCase()}s`;

  return (
    <div className="sl-panel">
      <div className="sl-tools">
        <div className="sl-tools__row">
          <label className="sl-search">
            <Search size={13} aria-hidden="true" />
            <input
              type="search"
              placeholder={`Search ${plural}`}
              aria-label={`Search ${plural}`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
          <button type="button" className="sl-btn sl-btn--primary" onClick={onNew} title={newTitle}>
            <Plus size={14} aria-hidden="true" /> New
          </button>
        </div>
        <div className="sl-tools__row">
          <select
            className="sl-select"
            value={filterRange}
            onChange={(e) => setFilterRange(e.target.value)}
            aria-label="Filter by last update"
          >
            {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select
            className="sl-select"
            value={`${sortKey}:${sortOrder}`}
            onChange={(e) => {
              const [key, order] = e.target.value.split(":");
              setSortKey(key);
              setSortOrder(order);
            }}
            aria-label={`Sort ${plural}`}
          >
            <option value="updated:desc">Newest</option>
            <option value="updated:asc">Oldest</option>
            <option value="name:asc">A–Z</option>
            <option value="name:desc">Z–A</option>
          </select>
          <button
            type="button"
            className={`sl-btn sl-btn--icon${deleteMode ? " is-active" : ""}`}
            onClick={() => (deleteMode ? exitDeleteMode() : setDeleteMode(true))}
            title={deleteMode ? "Cancel selecting" : `Select ${plural} to delete`}
            aria-label={deleteMode ? "Cancel selecting" : `Select ${plural} to delete`}
            aria-pressed={deleteMode}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {deleteMode && (
        <div className="sl-bar sl-bar--danger" role="status">
          <span className="sl-bar__text">
            {selectedIds.size ? `${selectedIds.size} selected` : `Tick the ${plural} to delete`}
          </span>
          <button type="button" className="sl-link" onClick={exitDeleteMode} disabled={deleting}>Cancel</button>
          <button
            type="button"
            className="sl-btn sl-btn--danger sl-btn--sm"
            onClick={handleBulkDelete}
            disabled={!selectedIds.size || deleting}
          >
            <Trash2 size={12} aria-hidden="true" /> {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      )}

      <div className="sl-body">
        {loading ? (
          <div className="sl-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="sl-empty">
            {searchTerm || filterRange !== "all" ? `No ${plural} match these filters.` : `No saved ${plural} yet. Use New to start one.`}
          </div>
        ) : (
          <>
            <div className="sl-group">
              <span className="sl-group__label">Saved {plural}</span>
              <span className="sl-group__count">{filtered.length}</span>
            </div>
            {filtered.map((record) => {
              const marked = selectedIds.has(record.id);
              const active = record.id === activeId;
              const meta = metaFor(record);
              const updated = updatedLabel(record);
              const open = () => (deleteMode ? toggleSelection(record.id) : onSelect(record.id));
              return (
                <div
                  key={record.id}
                  role="button"
                  tabIndex={0}
                  aria-current={active ? "true" : undefined}
                  className={`sl-row${active ? " is-active" : ""}${marked ? " is-marked" : ""}`}
                  onClick={open}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    open();
                  }}
                  title={record.description || record.name}
                >
                  {deleteMode && (
                    <input
                      className="sl-row__check"
                      type="checkbox"
                      checked={marked}
                      onChange={() => toggleSelection(record.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${record.name || recordLabel}`}
                    />
                  )}
                  <span className="sl-row__icon" aria-hidden="true"><Waypoints size={15} /></span>
                  <span className="sl-row__text">
                    <span className="sl-row__name">{record.name || `Unnamed ${recordLabel.toLowerCase()}`}</span>
                    {meta && <span className="sl-row__sub">{meta}</span>}
                  </span>
                  <span className="sl-row__aside">
                    {active ? <span className="sl-tag sl-tag--acc">Open</span> : updated && <span className="sl-row__sub">{updated}</span>}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
