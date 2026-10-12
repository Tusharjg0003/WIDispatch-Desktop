import React, { useMemo, useState } from "react";
import { FileCheck2, FilePen, Plus, Search, Trash2 } from "lucide-react";
import "./SidebarList.css";

// Left rail for Simulation Config: saved simulations grouped into Drafts and
// Published (a config's status is its latest run's — see the backend's
// withPlanStatus). Search, an All / Drafts / Published filter, New and Delete.
// Styled with the shared left-rail list styles (SidebarList.css). The page
// owns the list; this only renders it.

const FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "published", label: "Published" },
];

const STATUS = {
  draft: { label: "Draft", tag: "sl-tag--warn", colour: "var(--amberTx, #f59e0b)", icon: FilePen },
  published: { label: "Published", tag: "sl-tag--ok", colour: "var(--ok)", icon: FileCheck2 },
};

const shortDate = (iso) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
};
const stamp = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

function tooltip(config) {
  if (config.status === "published") return `Published ${stamp(config.publishedAt) || ""}`.trim();
  if (config.latestRunAt) return `Draft · last run ${stamp(config.latestRunAt)}`;
  return "Draft · not run yet";
}

export default function SimulationConfigSidebar({ configs, networks, activeId, onSelect, onNew, onDelete, creating = false }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");

  const networkName = useMemo(() => new Map(networks.map((n) => [n.id, n.name])), [networks]);

  const groups = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const match = (c) =>
      !term ||
      (c.name || "").toLowerCase().includes(term) ||
      (networkName.get(c.networkId) || "").toLowerCase().includes(term);
    const rows = configs.filter(match);
    return {
      draft: rows.filter((c) => c.status !== "published"),
      published: rows.filter((c) => c.status === "published"),
    };
  }, [configs, searchTerm, networkName]);

  const shown = FILTERS.slice(1).filter((f) => filter === "all" || filter === f.key);
  const searching = Boolean(searchTerm.trim());

  const renderRow = (config) => {
    const status = STATUS[config.status === "published" ? "published" : "draft"];
    const Icon = status.icon;
    const active = config.id === activeId;
    const sub = [
      networkName.get(config.networkId) || "No network",
      config.from && config.to ? `${shortDate(config.from)} → ${shortDate(config.to)}` : null,
    ].filter(Boolean).join(" · ");
    return (
      <div
        key={config.id}
        role="button"
        tabIndex={0}
        className={`sl-row${active ? " is-active" : ""}`}
        style={{ "--sl-colour": status.colour }}
        aria-current={active ? "page" : undefined}
        onClick={() => onSelect(config.id)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          onSelect(config.id);
        }}
        title={`${config.name} · ${tooltip(config)}`}
      >
        <span className="sl-row__icon" aria-hidden="true"><Icon size={15} /></span>
        <span className="sl-row__text">
          <span className="sl-row__name">{config.name || "Untitled simulation"}</span>
          <span className="sl-row__sub">{sub}</span>
        </span>
        <span className="sl-row__aside">
          <span className={`sl-tag ${status.tag}`}>{status.label}</span>
        </span>
      </div>
    );
  };

  return (
    <div className="sl-panel">
      <div className="sl-tools">
        <div className="sl-tools__row">
          <label className="sl-search">
            <Search size={13} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search simulations"
              aria-label="Search simulations by name or network"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
        </div>
        <div className="sl-tools__row">
          <button type="button" className="sl-btn sl-btn--primary" onClick={onNew} disabled={creating} style={{ flex: 1 }}>
            <Plus size={14} aria-hidden="true" /> {creating ? "Creating…" : "New simulation"}
          </button>
          <button
            type="button"
            className="sl-btn sl-btn--icon sl-btn--danger"
            onClick={onDelete}
            disabled={!activeId}
            title="Delete the open simulation"
            aria-label="Delete the open simulation"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="sl-chips" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`sl-chip${filter === f.key ? " is-active" : ""}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.key !== "all" && <span className="sl-chip__dot" style={{ background: STATUS[f.key].colour }} aria-hidden="true" />}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sl-body">
        {configs.length === 0 ? (
          <div className="sl-empty">No saved simulations yet. Create one to dispatch over a saved network.</div>
        ) : (
          shown.map((f) => {
            const list = groups[f.key];
            return (
              <React.Fragment key={f.key}>
                <div className="sl-group">
                  <span className="sl-group__label">{f.label}</span>
                  <span className="sl-group__count">{list.length}</span>
                </div>
                {list.length
                  ? list.map(renderRow)
                  : <div className="sl-empty">{searching ? "No matches." : f.key === "draft" ? "No drafts." : "Nothing published yet."}</div>}
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
}
