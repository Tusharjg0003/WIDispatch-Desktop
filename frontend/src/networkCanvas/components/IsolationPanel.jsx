import React, { useState } from "react";
import { ChevronDown, ChevronRight, Eye, Focus, GitBranch, Network, Route, Search, Spline } from "lucide-react";
import { lineDisplayName } from "../../lib/transmissionLines";
import "../../components/SidebarList.css";
import "./RightPanels.css";

// Right panel → Isolation: show only one transmission system, line, branch
// or pipe on the canvas. Same build as the Details card / legend: header
// tile, search, then a collapsible tree of colour-coded rows.

const pipeIdsForLine = (line) => (line?.pipes || []).map((pipe) => pipe.id);
const pipeIdsForSystem = (system) => [
  ...(system?.pipes || []).map((pipe) => pipe.id),
  ...(system?.lines || []).flatMap((line) => pipeIdsForLine(line)),
];
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function TreeRow({ kind, name, sub, active, disabled, depth = 0, onClick, toggle }) {
  const Icon = { system: Network, line: Route, branch: GitBranch, pipe: Spline }[kind];
  return (
    <div className={`rp-tree__row${depth > 0 ? " rp-tree__row--nested" : ""}`} style={{ "--depth": depth }}>
      {toggle || <span className="rp-tree__spacer" aria-hidden="true" />}
      <button
        type="button"
        className={`rp-row rp-row--tree${active ? " is-active" : ""}`}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={active}
        title={disabled ? "No pipes on the canvas yet" : active ? "Isolated" : `Show only this ${kind}`}
      >
        <span className={`rp-tile rp-tile--${kind}`} aria-hidden="true"><Icon size={13} /></span>
        <span className="rp-row__text">
          <span className="rp-row__name">{name}</span>
          {sub && <span className="rp-row__sub">{sub}</span>}
        </span>
        {active && <span className="rp-tag">Isolated</span>}
      </button>
    </div>
  );
}

export default function IsolationPanel({
  groups,
  query,
  onQueryChange,
  active,
  activeLabel,
  activeKey,
  onIsolate,
  onClear,
}) {
  // Systems open by default only when they have pipes on this canvas; a
  // click on the chevron overrides that per system. Searching opens all.
  const [openOverride, setOpenOverride] = useState(() => new Map());
  const toggleSystem = (id, currentlyOpen) =>
    setOpenOverride((prev) => new Map(prev).set(id, !currentlyOpen));
  const searching = Boolean(query.trim());

  const pipeRow = (pipe, depth, keyPrefix) => (
    <TreeRow
      key={`${keyPrefix}-${pipe.id}`}
      kind="pipe"
      depth={depth}
      name={pipe.name}
      sub={`${pipe.source} → ${pipe.target}`}
      active={activeKey === `pipe:${pipe.id}`}
      onClick={() => onIsolate([pipe.id], `pipe ${pipe.name}`, `pipe:${pipe.id}`)}
    />
  );
  const lineRows = (line, depth) => {
    const ids = pipeIdsForLine(line);
    const kind = line.isBranch ? "branch" : "line";
    const parent = line.isBranch && (line.parentLineName || line.parentLineId);
    return (
      <React.Fragment key={line.id}>
        <TreeRow
          kind={kind}
          depth={depth}
          name={lineDisplayName(line)}
          sub={`${parent ? `Branch of ${parent} · ` : ""}${plural(line.pipes.length, "segment")}`}
          active={activeKey === `line:${line.id}`}
          disabled={ids.length === 0}
          onClick={() => onIsolate(ids, `${kind} ${lineDisplayName(line)}`, `line:${line.id}`)}
        />
        {line.pipes.map((pipe) => pipeRow(pipe, depth + 1, line.id))}
      </React.Fragment>
    );
  };

  const { systems, standaloneLines, ungroupedPipes } = groups;
  const nothing = systems.length === 0 && standaloneLines.length === 0 && ungroupedPipes.length === 0;

  return (
    <div className="rp">
      <header className="rp-head">
        <span className="rp-head__icon" aria-hidden="true"><Focus size={17} /></span>
        <div className="rp-head__titles">
          <span className="rp-head__eyebrow">Focus the canvas</span>
          <h3 className="rp-head__title">Isolation</h3>
          <span className="rp-head__subtitle">
            {active
              ? <>Showing <strong>{activeLabel || "the isolated part"}</strong> only.</>
              : "Pick a system, line, branch or pipe to show only that part of the network."}
          </span>
        </div>
      </header>
      {active && (
        <div className="rp-actions">
          <button type="button" className="rp-btn rp-btn--primary" onClick={onClear}>
            <Eye size={13} aria-hidden="true" /> Show all
          </button>
        </div>
      )}

      <label className="sl-search">
        <Search size={13} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search systems, lines, pipes"
          aria-label="Search systems, lines and pipes"
        />
      </label>

      {nothing ? (
        <div className="rp-empty">
          <Network size={20} aria-hidden="true" />
          <span>
            {searching
              ? "Nothing matches that search."
              : "No transmission systems or pipes on the canvas yet."}
          </span>
        </div>
      ) : (
        <>
          {systems.length > 0 && (
            <section className="rp-section">
              <div className="rp-section__head">
                <h4 className="rp-section__title">Transmission systems</h4>
                <span className="rp-count">{systems.length}</span>
              </div>
              <div className="rp-tree">
                {systems.map((system) => {
                  const ids = pipeIdsForSystem(system);
                  const open = searching || (openOverride.has(system.id) ? openOverride.get(system.id) : ids.length > 0);
                  const hasChildren = system.lines.length > 0 || system.pipes.length > 0;
                  return (
                    <div className="rp-tree__group" key={system.id}>
                      <TreeRow
                        kind="system"
                        name={system.name}
                        sub={`${plural(system.lines.length, "line")} · ${plural(ids.length, "pipe")}`}
                        active={activeKey === `system:${system.id}`}
                        disabled={ids.length === 0}
                        onClick={() => onIsolate(ids, `system ${system.name || system.id}`, `system:${system.id}`)}
                        toggle={
                          hasChildren ? (
                            <button
                              type="button"
                              className="rp-tree__toggle"
                              onClick={() => toggleSystem(system.id, open)}
                              aria-expanded={open}
                              aria-label={`${open ? "Collapse" : "Expand"} ${system.name}`}
                            >
                              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                          ) : null
                        }
                      />
                      {open && (
                        hasChildren ? (
                          <>
                            {system.pipes.map((pipe) => pipeRow(pipe, 1, system.id))}
                            {system.lines.map((line) => lineRows(line, 1))}
                          </>
                        ) : (
                          <div className="rp-tree__note" style={{ "--depth": 1 }}>No canvas pipes in this system yet.</div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {standaloneLines.length > 0 && (
            <section className="rp-section">
              <div className="rp-section__head">
                <h4 className="rp-section__title">Lines without a system</h4>
                <span className="rp-count">{standaloneLines.length}</span>
              </div>
              <div className="rp-tree">{standaloneLines.map((line) => lineRows(line, 0))}</div>
            </section>
          )}

          {ungroupedPipes.length > 0 && (
            <section className="rp-section">
              <div className="rp-section__head">
                <h4 className="rp-section__title">Pipes without a line</h4>
                <span className="rp-count">{ungroupedPipes.length}</span>
              </div>
              <div className="rp-tree">{ungroupedPipes.map((pipe) => pipeRow(pipe, 0, "ungrouped"))}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
