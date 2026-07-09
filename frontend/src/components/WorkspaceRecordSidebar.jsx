import React, { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import SidebarActionToolbar, { applyRangeFilter, applySort } from "./SidebarActionToolbar";
import "./WorkspaceRecordSidebar.css";

/* WorkspaceRecordSidebar
   --------------------------------------------------------------------------
   Generic "saved records" sidebar: collapsible section header, a full action
   toolbar (new / search / range filter / sort / delete-mode), and a list of
   records with a per-row #index and a meta line, click-to-open.

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterRange, setFilterRange] = useState("all");
  const [sortKey, setSortKey] = useState("updated");
  const [sortOrder, setSortOrder] = useState("desc");
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(true);

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

  return (
    <div className="sidebar-content">
      <div className="sidebar-content__section">
        <button
          type="button"
          className="sidebar-content__section-header"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <h4 className="sidebar-content__section-title" style={{ margin: 0 }}>
            {recordLabel}s ({records.length})
          </h4>
        </button>

        {expanded && (
          <div className="sidebar-content__section-content">
            <SidebarActionToolbar
              createTitle={newTitle}
              onCreate={onNew}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              searchOpen={searchOpen}
              setSearchOpen={setSearchOpen}
              filterRange={filterRange}
              setFilterRange={setFilterRange}
              sortKey={sortKey}
              sortOrder={sortOrder}
              setSort={(key, order) => { setSortKey(key); setSortOrder(order); }}
              inDeleteMode={deleteMode}
              setInDeleteMode={(next) => { setDeleteMode(next); if (!next) setSelectedIds(new Set()); }}
              selectedCount={selectedIds.size}
              deleting={deleting}
              onConfirmDelete={handleBulkDelete}
            />

            {loading ? (
              <div className="sidebar-content__empty-msg">Loading…</div>
            ) : (
              <div className="sidebar-content__list">
                {filtered.length === 0 ? (
                  <div className="sidebar-content__empty-msg">
                    {searchTerm ? `No ${recordLabel.toLowerCase()}s found` : `No saved ${recordLabel.toLowerCase()}s`}
                  </div>
                ) : (
                  filtered.map((record, index) => {
                    const isSelected = selectedIds.has(record.id);
                    const meta = metaFor(record);
                    return (
                      <div
                        key={record.id}
                        role="button"
                        tabIndex={0}
                        className={`sidebar-content__list-row ${record.id === activeId ? "sidebar-content__list-row--folder" : ""}`}
                        onClick={() => (deleteMode ? toggleSelection(record.id) : onSelect(record.id))}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          deleteMode ? toggleSelection(record.id) : onSelect(record.id);
                        }}
                        title={record.description || record.name}
                        style={{
                          backgroundColor: isSelected ? "#fef2f2" : undefined,
                          gap: deleteMode ? "6px" : undefined,
                        }}
                      >
                        {deleteMode && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(record.id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: 11, height: 11, flexShrink: 0 }}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <span style={{ fontSize: 9, lineHeight: 1, fontFamily: "var(--mono)", color: "#94a3b8", flexShrink: 0 }}>
                              #{index + 1}
                            </span>
                            <span style={{
                              fontWeight: 500, fontSize: 11, lineHeight: 1.15, color: "#0f172a",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {record.name || `Unnamed ${recordLabel}`}
                            </span>
                          </div>
                          {meta && (
                            <div style={{
                              marginTop: 2, paddingLeft: 18, fontSize: 9, lineHeight: 1.1, color: "#64748b",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {meta}
                            </div>
                          )}
                        </div>
                        <ChevronRight size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
