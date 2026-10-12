import React, { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowUpRight, Cylinder, Droplets, Factory, GitBranch, MapPinned, Network as NetworkIcon, Route, Spline, Trash2,
} from "lucide-react";
import { ENTITY_TYPE_COLORS } from "../cytoscape/buildCyStyle";
import { lineDisplayName } from "../lib/transmissionLines";
import { segmentStats } from "../lib/transmissionSystems";
import RecordKpis from "../components/production/RecordKpis";
import TransmissionSystemSnapshot from "../components/transmission/TransmissionSystemSnapshot";
import { productionTabController } from "../production/tabs/productionTabControllerInstance";
import { demandTabController } from "../demand/tabs/demandTabControllerInstance";
import { transmissionTabController } from "../transmission/tabs/transmissionTabControllerInstance";
import "./ProductionPlantDetail.css";
import "./TransmissionSystemDetail.css";

// One transmission system, in the same frame as the plant / city-gate /
// pump-station detail pages: identity header, sub-tabs, and the app's cards.
//   Overview          — KPIs, the network drawing, facts, supply → delivery
//   Lines & segments  — each line (and its branches) with its pipe segments
//   Assets            — plants, city gates, pump stations and tanks it connects

const PIPE_COLOUR = "#5b7ca3";
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "lines", label: "Lines & segments" },
  { key: "assets", label: "Assets" },
];

const num = (v) => (v == null ? "—" : Math.round(v).toLocaleString());
const km = (v) => (v == null ? "—" : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }));
const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);
const fmtDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const statusTone = (s) => {
  const k = String(s || "").toLowerCase();
  if (k === "operational" || k === "active") return "ok";
  if (k === "maintenance") return "warn";
  if (k === "planned" || k === "under_construction") return "acc";
  if (k === "decommissioned" || k === "offline") return "err";
  return "";
};
const statusLabel = (s) => (s ? String(s).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");

function Pill({ tone, children, title }) {
  return <span className={`tsd-pill${tone ? ` tsd-pill--${tone}` : ""}`} title={title}>{children}</span>;
}

function Card({ title, icon: Icon, colour, count, hint, aside, children, className = "" }) {
  return (
    <section className={`tsd-card ${className}`.trim()} aria-label={title} style={colour ? { "--tsd-colour": colour } : undefined}>
      <header className="tsd-card__head">
        {Icon && <span className="tsd-card__icon" aria-hidden="true"><Icon size={14} /></span>}
        <h3>{title}</h3>
        {count != null && <span className="tsd-pill">{count}</span>}
        {hint && <span className="tsd-card__hint">{hint}</span>}
        {aside}
      </header>
      {children}
    </section>
  );
}

// ── Segments ────────────────────────────────────────────────────────────────

function SegmentTable({ pipes, networksById }) {
  if (!pipes.length) return <p className="tsd-empty">No canvas segments under this line yet.</p>;
  return (
    <div className="tsd-table-wrap">
      <table className="tsd-table tsd-segments">
        <colgroup>
          <col className="c-seg-name" /><col className="c-route" /><col className="c-net" />
          <col className="c-num" /><col className="c-num" /><col className="c-num" />
          <col className="c-mat" /><col className="c-dir" /><col className="c-status" /><col className="c-date" /><col className="c-date" />
        </colgroup>
        <thead>
          <tr>
            <th>Segment</th><th>From → To</th><th>Network</th>
            <th className="ta-r">Capacity (m³/d)</th><th className="ta-r">Length (km)</th><th className="ta-r">Diameter (mm)</th>
            <th>Material</th><th>Direction</th><th>Status</th><th>Commissioned</th><th>Decommissioned</th>
          </tr>
        </thead>
        <tbody>
          {pipes.map((p) => (
            <tr key={`${p.networkId}:${p.id}`} className={p.active ? undefined : "is-off"}>
              <td className="tsd-strong">{p.name}</td>
              <td className="tsd-route"><span>{p.source}</span><span className="tsd-arrow">{p.bidirectional ? "↔" : "→"}</span><span>{p.target}</span></td>
              <td className="tsd-muted">{networksById.get(p.networkId)?.name || p.networkName}</td>
              <td className="ta-r mono">{p.capacity == null ? <Pill tone="warn">Not set</Pill> : num(p.capacity)}</td>
              <td className="ta-r mono">{km(p.length)}</td>
              <td className="ta-r mono">{num(p.diameter)}</td>
              <td>{p.material || <span className="tsd-muted">—</span>}</td>
              <td><Pill>{p.bidirectional ? "Bidirectional" : "One-way"}</Pill></td>
              <td>{p.active ? <Pill tone={statusTone(p.status || "active")}>{statusLabel(p.status || "active")}</Pill> : <Pill>Inactive</Pill>}</td>
              <td className="mono nowrap">{fmtDate(p.commissioning)}</td>
              <td className="mono nowrap">{fmtDate(p.decommissioning)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineCard({ line, pipes, kind, parentName, branches = [], networksById, onDeleteLine, deletingLineId }) {
  const stats = segmentStats([...pipes, ...branches.flatMap((b) => b.pipes)]);
  const own = segmentStats(pipes);
  const label = lineDisplayName(line);
  const kindTone = kind === "branch" ? "warn" : "acc";
  return (
    <section className={`tsd-line tsd-line--${kind}`} aria-label={label}>
      <header className="tsd-line__head">
        <span className={`tsd-kind tsd-kind--${kind}`}>{kind === "branch" ? <GitBranch size={12} aria-hidden="true" /> : <Route size={12} aria-hidden="true" />}{kind === "branch" ? "Branch" : "Line"}</span>
        <div className="tsd-line__title">
          <strong>{label}</strong>
          <small>
            {parentName ? `Branch of ${parentName} · ` : ""}
            {stats.count} segment{stats.count === 1 ? "" : "s"}
            {kind === "line" && branches.length ? ` · ${branches.length} branch${branches.length === 1 ? "" : "es"}` : ""}
          </small>
        </div>
        <dl className="tsd-line__facts">
          <div><dt>Length</dt><dd className="mono">{stats.hasLength ? `${km(stats.length)} km` : "—"}</dd></div>
          <div><dt>Bottleneck</dt><dd className="mono">{own.minCapacity == null ? "—" : `${num(own.minCapacity)} m³/d`}</dd></div>
          {own.unconstrained > 0 && <div><dt>No capacity</dt><dd><Pill tone="warn">{own.unconstrained}</Pill></dd></div>}
        </dl>
        {line.id && onDeleteLine && (
          <button type="button" className="tsd-icon-btn tsd-icon-btn--danger" onClick={() => onDeleteLine(line, label)}
            disabled={deletingLineId === line.id} title={`Delete ${label}`} aria-label={`Delete ${label}`}>
            <Trash2 size={13} aria-hidden="true" />
          </button>
        )}
        <span className={`tsd-line__accent tsd-line__accent--${kindTone}`} aria-hidden="true" />
      </header>
      <SegmentTable pipes={pipes} networksById={networksById} />
      {branches.length > 0 && (
        <div className="tsd-line__branches">
          {branches.map((b) => (
            <LineCard key={b.line.id} line={b.line} pipes={b.pipes} kind="branch" parentName={label}
              networksById={networksById} onDeleteLine={onDeleteLine} deletingLineId={deletingLineId} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Assets ──────────────────────────────────────────────────────────────────

const ASSET_GROUPS = [
  { key: "plant", title: "Plants supplying the system", icon: Factory, colour: ENTITY_TYPE_COLORS.plant, empty: "No plants connect to this system's segments." },
  { key: "handover_point", title: "City gates served", icon: MapPinned, colour: ENTITY_TYPE_COLORS.handover_point, empty: "No city gates connect to this system's segments." },
  { key: "pump", title: "Pump stations", icon: Droplets, colour: ENTITY_TYPE_COLORS.pump, empty: "No pump stations on this system." },
  { key: "tank", title: "Tanks", icon: Cylinder, colour: ENTITY_TYPE_COLORS.tank, empty: "No tanks on this system." },
];

// Same columns in every asset table (fixed widths), so the stacked cards line up.
const CAPACITY_COLUMNS = {
  default: [["design", "Design (m³/d)"], ["contracted", "Contracted (m³/d)"], ["maximum", "Maximum (m³/d)"]],
  tank: [["storage", "Storage (m³)"], ["design", "Design (m³/d)"], ["maximum", "Maximum (m³/d)"]],
};

function AssetTable({ group, rows, networksById, onOpen }) {
  const capacityColumns = CAPACITY_COLUMNS[group.key] || CAPACITY_COLUMNS.default;
  return (
    <Card title={group.title} icon={group.icon} colour={group.colour} count={rows.length}>
      {rows.length === 0 ? <p className="tsd-empty">{group.empty}</p> : (
        <div className="tsd-table-wrap">
          <table className="tsd-table tsd-assets">
            <colgroup>
              <col className="c-asset" /><col className="c-type" /><col className="c-region" /><col className="c-status" />
              <col className="c-num" /><col className="c-num" /><col className="c-num" />
              <col className="c-date" /><col className="c-date" /><col className="c-seg" /><col className="c-net" /><col className="c-open" />
            </colgroup>
            <thead>
              <tr>
                <th>Asset</th><th>Type</th><th>Region</th><th>Status</th>
                {capacityColumns.map(([key, label]) => <th key={key} className="ta-r">{label}</th>)}
                <th>Commissioned</th><th>Decommissioned</th><th className="ta-r">Segments</th><th>Network</th>
                <th><span className="tsd-sr">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.key}>
                  <td>
                    <span className="tsd-asset" style={{ "--tsd-colour": group.colour }}>
                      <span className="tsd-asset__icon" aria-hidden="true"><group.icon size={13} /></span>
                      <span className="tsd-asset__text">
                        <strong>{a.name}</strong>
                        <small className="mono">{a.id || "—"}{!a.inRegistry && a.recordId ? " · not in registry" : ""}</small>
                      </span>
                    </span>
                  </td>
                  <td>{a.type || <span className="tsd-muted">—</span>}</td>
                  <td>
                    {a.region || <span className="tsd-muted">—</span>}
                    {(a.governorate || a.city) && <small className="tsd-sub">{[a.governorate, a.city].filter(Boolean).join(" · ")}</small>}
                  </td>
                  <td><Pill tone={statusTone(a.status)}>{statusLabel(a.status)}</Pill></td>
                  {capacityColumns.map(([key]) => <td key={key} className="ta-r mono">{num(a[key])}</td>)}
                  <td className="mono nowrap">{fmtDate(a.commissioning)}</td>
                  <td className="mono nowrap">{fmtDate(a.decommissioning)}</td>
                  <td className="ta-r mono">{a.segments}</td>
                  <td className="tsd-muted">{Array.from(a.networkIds).map((id) => networksById.get(id)?.name || id).join(", ")}</td>
                  <td>
                    {a.recordId && (
                      <button type="button" className="tsd-icon-btn" onClick={() => onOpen(group.key, a)} title="Open its detail page" aria-label={`Open ${a.name}`}>
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function TransmissionSystemDetail({
  systemId, loading, error, breakdown, lineGroups, assets, networksById,
  subTab = "overview", onSubTabChange, onBack, onTitle, onDeleteLine, deletingLineId, lineDeleteError,
}) {
  const navigate = useNavigate();
  const system = breakdown?.system;
  const name = system?.name || systemId;
  const stats = useMemo(() => segmentStats(breakdown?.pipes || []), [breakdown]);
  const branchCount = lineGroups.mainLines.reduce((s, l) => s + l.branches.length, 0) + lineGroups.orphanBranches.length;
  const networkNames = breakdown ? Array.from(breakdown.networkIds).map((id) => networksById.get(id)?.name || id) : [];

  useEffect(() => {
    if (system?.name) onTitle?.(system.name);
  }, [system?.name, onTitle]);

  // Open an asset in its own module (as a tab there), then go to it.
  const openAsset = (category, a) => {
    if (category === "plant") { productionTabController.openPlant(a.recordId, a.name); navigate("/production"); return; }
    if (category === "handover_point") { demandTabController.openGate(a.recordId, a.name); navigate("/demand"); return; }
    if (category === "pump") { transmissionTabController.openPumpStation(a.recordId, a.name); navigate("/transmission/pump-stations"); return; }
    navigate(`/asset-registry/view/${encodeURIComponent(a.recordId)}`);
  };

  return (
    <div className="ppd tsd">
      <header className="ppd__identity" style={{ "--ppd-colour": PIPE_COLOUR }}>
        {onBack && (
          <button type="button" className="ppd__back" onClick={onBack} title="Back to Systems" aria-label="Back to Systems">
            <ArrowLeft size={16} />
          </button>
        )}
        <span className="ppd__icon" aria-hidden="true"><NetworkIcon size={18} /></span>
        <h1 className="ppd__name">{name}</h1>
        <span className="ppd__extid mono">{systemId}</span>
        <span className="ppd__meta">
          {breakdown
            ? `Transmission system · ${networkNames.length ? networkNames.join(", ") : "not on any saved network"} · ${breakdown.lineIds.size} line${breakdown.lineIds.size === 1 ? "" : "s"} · ${stats.count} segment${stats.count === 1 ? "" : "s"}`
            : "Transmission system"}
        </span>
      </header>

      {loading && <div className="ppd__state">Loading transmission system…</div>}
      {error && <div className="ppd__state ppd__state--err">Failed to load: {error}</div>}
      {!loading && !error && !breakdown && <div className="ppd__state">This transmission system no longer exists.</div>}

      {!loading && !error && breakdown && (
        <>
          <div className="ppd__tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={subTab === t.key}
                className={`ppd__tab ${subTab === t.key ? "ppd__tab--active" : ""}`} onClick={() => onSubTabChange?.(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {lineDeleteError && <div className="tsd-banner">{lineDeleteError}</div>}

          <div className="ppd__tabpanel">
            {subTab === "overview" && (
              <div className="tsd-stack">
                <RecordKpis
                  items={[
                    { label: "Lines", value: breakdown.lineIds.size, icon: Route, tone: "acc", sub: `${branchCount} branch${branchCount === 1 ? "" : "es"}` },
                    { label: "Segments", value: stats.count, icon: Spline, tone: "neutral", sub: stats.hasLength ? `${km(stats.length)} km of pipe` : "Length not recorded" },
                    { label: "Plants supplying", value: assets.plant.length, icon: Factory, tone: assets.plant.length ? "ok" : "neutral", sub: `${num(sum(assets.plant, "contracted"))} m³/d contracted` },
                    { label: "City gates served", value: assets.handover_point.length, icon: MapPinned, tone: assets.handover_point.length ? "warn" : "neutral", sub: `${num(sum(assets.handover_point, "contracted"))} m³/d contracted` },
                    { label: "Pump stations", value: assets.pump.length, icon: Droplets, tone: "neutral", sub: `${num(sum(assets.pump, "design"))} m³/d design` },
                    { label: "Tanks", value: assets.tank.length, icon: Cylinder, tone: "neutral", sub: `${num(sum(assets.tank, "storage"))} m³ storage` },
                  ]}
                />

                <div className="tsd-grid">
                  <Card title="Network drawing" icon={Spline} colour={PIPE_COLOUR} hint="Saved canvas positions" className="tsd-card--drawing">
                    <div className="tsd-card__body"><TransmissionSystemSnapshot system={breakdown} height={380} /></div>
                  </Card>
                  <Card title="System facts" icon={NetworkIcon} colour={PIPE_COLOUR}>
                    <dl className="tsd-facts">
                      <div><dt>System ID</dt><dd className="mono">{systemId}</dd></div>
                      <div><dt>Name</dt><dd>{name}</dd></div>
                      <div className="tsd-facts__wide"><dt>Networks</dt><dd>{networkNames.length ? networkNames.join(", ") : "—"}</dd></div>
                      <div><dt>Registered lines</dt><dd className="mono">{breakdown.lineIds.size}</dd></div>
                      <div><dt>Branches</dt><dd className="mono">{branchCount}</dd></div>
                      <div><dt>Segments</dt><dd className="mono">{stats.count}</dd></div>
                      <div><dt>Total length</dt><dd className="mono">{stats.hasLength ? `${km(stats.length)} km` : "—"}</dd></div>
                      <div><dt>Bottleneck capacity</dt><dd className="mono">{stats.minCapacity == null ? "—" : `${num(stats.minCapacity)} m³/d`}</dd></div>
                      <div><dt>Segments without capacity</dt><dd>{stats.unconstrained ? <Pill tone="warn">{stats.unconstrained}</Pill> : <span className="mono">0</span>}</dd></div>
                      <div><dt>Unassigned segments</dt><dd className="mono">{lineGroups.systemPipes.length}</dd></div>
                      <div><dt>Junctions</dt><dd className="mono">{assets.junctions}</dd></div>
                    </dl>
                  </Card>
                </div>

                <Card title="Supply and delivery" icon={Route} colour={PIPE_COLOUR} hint="Plants feeding the system and the city gates it delivers to">
                  <div className="tsd-flow">
                    <div className="tsd-flow__col">
                      <h4>Supplied by</h4>
                      {assets.plant.length ? assets.plant.map((a) => (
                        <button type="button" key={a.key} className="tsd-flow__row" onClick={() => a.recordId && openAsset("plant", a)} disabled={!a.recordId}
                          style={{ "--tsd-colour": ENTITY_TYPE_COLORS.plant }}>
                          <span className="tsd-asset__icon" aria-hidden="true"><Factory size={13} /></span>
                          <span className="tsd-asset__text"><strong>{a.name}</strong><small>{a.type || "Plant"} · {a.region || "—"}</small></span>
                          <span className="mono tsd-flow__val">{num(a.contracted)} <small>m³/d</small></span>
                        </button>
                      )) : <p className="tsd-empty">No plants connected.</p>}
                    </div>
                    <div className="tsd-flow__arrow" aria-hidden="true">→</div>
                    <div className="tsd-flow__col">
                      <h4>Delivers to</h4>
                      {assets.handover_point.length ? assets.handover_point.map((a) => (
                        <button type="button" key={a.key} className="tsd-flow__row" onClick={() => a.recordId && openAsset("handover_point", a)} disabled={!a.recordId}
                          style={{ "--tsd-colour": ENTITY_TYPE_COLORS.handover_point }}>
                          <span className="tsd-asset__icon" aria-hidden="true"><MapPinned size={13} /></span>
                          <span className="tsd-asset__text"><strong>{a.name}</strong><small>{a.type || "City gate"} · {a.region || "—"}</small></span>
                          <span className="mono tsd-flow__val">{num(a.contracted)} <small>m³/d</small></span>
                        </button>
                      )) : <p className="tsd-empty">No city gates connected.</p>}
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {subTab === "lines" && (
              <div className="tsd-stack">
                {lineGroups.mainLines.map(({ line, pipes, branches }) => (
                  <LineCard key={line.id} line={line} pipes={pipes} branches={branches} kind="line"
                    networksById={networksById} onDeleteLine={onDeleteLine} deletingLineId={deletingLineId} />
                ))}
                {lineGroups.orphanBranches.map(({ line, pipes }) => (
                  <LineCard key={line.id} line={line} pipes={pipes} kind="branch"
                    parentName={line.parentLineId ? "a line outside this system" : null}
                    networksById={networksById} onDeleteLine={onDeleteLine} deletingLineId={deletingLineId} />
                ))}
                {lineGroups.systemPipes.length > 0 && (
                  <Card title="Segments not on a line" icon={Spline} colour={PIPE_COLOUR} count={lineGroups.systemPipes.length}
                    hint="Tagged with this system but not grouped into a line">
                    <SegmentTable pipes={lineGroups.systemPipes} networksById={networksById} />
                  </Card>
                )}
                {!lineGroups.mainLines.length && !lineGroups.orphanBranches.length && !lineGroups.systemPipes.length && (
                  <div className="tsd-empty tsd-empty--card">No registered lines or canvas segments for this system yet.</div>
                )}
              </div>
            )}

            {subTab === "assets" && (
              <div className="tsd-stack">
                {ASSET_GROUPS.map((group) => (
                  <AssetTable key={group.key} group={group} rows={assets[group.key]} networksById={networksById} onOpen={openAsset} />
                ))}
                {assets.junctions > 0 && (
                  <p className="tsd-note">{assets.junctions} junction node{assets.junctions === 1 ? "" : "s"} also sit on this system's segments.</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
