import React, { useState } from "react";
import { ChevronRight, Cylinder, Droplets, Factory, FlaskConical, MapPinned, RotateCcw, Spline, Waves } from "lucide-react";
import { causeLabel, summariseGates, summarisePlants, summarisePumps, summariseTanks } from "../../lib/simulationRows";
import { ENTITY_TYPE_COLORS } from "../../cytoscape/buildCyStyle";
// Cards, pills, tables and fill bars are shared with the Results / Decisions tabs.
import "./ResultsPanel.css";
import "./SimulationTables.css";

// The config tables. Every number is read from the portals via the last
// run; the rightmost cells of each row are the operator's per-run overrides.
// Overrides live only in the saved configuration and never write back to the
// portals — a run is auditable as "portal data plus these N deviations".

const nf = new Intl.NumberFormat("en-US");
const fmt = (v) => (v == null ? "—" : nf.format(Math.round(v)));
const fmt2 = (v) => (v == null ? "—" : v.toFixed(2));

const PIPE_COLOUR = "#5b7ca3";

const OM_SOURCE = {
  economics: { label: "Economics", tone: "ok" },
  plant_spec: { label: "Asset record", tone: "acc" },
  default: { label: "Default", tone: "warn" },
  override: { label: "Override", tone: "warn" },
};

function Pill({ tone, children, title }) {
  return <span className={`rp-pill${tone ? ` simt-pill--${tone}` : ""}`} title={title}>{children}</span>;
}

/** Per-run override input: placeholder shows the portal value; a set value turns amber with a reset. */
function OverrideCell({ value, placeholder, onChange, suffix, label }) {
  const set = value != null && value !== "";
  return (
    <span className={`simt-ovr${set ? " is-set" : ""}${suffix === "%" ? " simt-ovr--pct" : ""}`}>
      <input
        type="number"
        step="any"
        min="0"
        aria-label={label}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
      {suffix && <span className="simt-ovr__suffix">{suffix}</span>}
      {set && (
        <button type="button" className="simt-ovr__reset" onClick={() => onChange(undefined)}
          aria-label={`Reset ${label}`} title={`Reset to the portal value (${placeholder})`}>
          <RotateCcw size={11} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/** Include / exclude switch. */
function ActiveCell({ active, onChange, name }) {
  const on = active !== false;
  return (
    <label className="simt-switch" title={on ? "Included in the dispatch" : "Excluded from the dispatch"}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked ? undefined : false)}
        aria-label={`Include ${name} in the dispatch`}
      />
      <span aria-hidden="true" />
    </label>
  );
}

function ExpandCell({ expanded, onToggle }) {
  return (
    <button type="button" className={`simt-expand${expanded ? " is-open" : ""}`} onClick={onToggle}
      aria-expanded={expanded} aria-label="Show daily breakdown">
      <ChevronRight size={13} aria-hidden="true" />
    </button>
  );
}

/**
 * Days affected, stated as a count rather than an average. Maintenance is spiky,
 * so a mean across the horizon describes a day that never happened; a count is
 * a fact, and the expanded rows carry the actual per-day numbers.
 */
function AffectedChip({ row }) {
  const parts = [];
  const full = [];
  if (row.maintenanceDays) {
    parts.push(`${row.maintenanceDays}d maint.`);
    full.push(`${row.maintenanceDays} maintenance`);
  }
  if (row.outageDays) {
    parts.push(`${row.outageDays}d outage`);
    full.push(`${row.outageDays} outage`);
  }
  if (!parts.length) return <span className="rp__sub">No derate</span>;
  return <Pill tone="warn" title={`${full.join(" and ")} day(s) of ${row.totalDays}`}>{parts.join(" · ")} / {row.totalDays}</Pill>;
}

/** Utilisation as a short bar; amber from 90%, red when (near) full. */
function UtilBar({ pct }) {
  if (pct == null) return <span className="rp__sub">—</span>;
  const tone = pct >= 99 ? " simt-util--err" : pct >= 90 ? " simt-util--warn" : "";
  return (
    <span className={`rp-fill simt-util${tone}`}>
      <span className="rp-fill__track"><span className="rp-fill__bar" style={{ width: `${Math.min(100, pct)}%` }} /></span>
      <span className="rp-fill__pct mono">{Math.round(pct)}%</span>
    </span>
  );
}

/** Day-by-day capacity for one asset — the numbers the portals actually hold. */
function PerDayBreakdown({ row, showAllocated }) {
  return (
    <div className="simt-breakdown">
      <table className="ledger rp-table simt-days">
        <thead>
          <tr>
            <th>Date</th>
            <th className="num">{showAllocated ? "Contracted" : "Design"}</th>
            <th className="num">Maint. loss</th>
            <th className="num">Outage loss</th>
            <th className="num">Available</th>
            {showAllocated && <th className="num">Allocated</th>}
          </tr>
        </thead>
        <tbody>
          {row.days.map((d) => {
            const derated = d.maintenanceLoss > 0 || d.outageLoss > 0;
            return (
              <tr key={d.date} className={derated ? "simt-day--derated" : undefined}>
                <td className="mono">{d.date}</td>
                <td className="num mono">{fmt(d.contracted)}</td>
                <td className={`num mono${d.maintenanceLoss > 0 ? " rp__bad" : ""}`}>
                  {d.maintenanceLoss > 0 ? fmt(d.maintenanceLoss) : "—"}
                </td>
                <td className={`num mono${d.outageLoss > 0 ? " rp__bad" : ""}`}>
                  {d.outageLoss > 0 ? fmt(d.outageLoss) : "—"}
                </td>
                <td className="num mono">{fmt(d.available)}</td>
                {showAllocated && <td className="num mono">{fmt(d.allocated)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GateDayBreakdown({ row }) {
  return (
    <div className="simt-breakdown">
      <table className="ledger rp-table simt-days">
        <thead>
          <tr>
            <th>Date</th>
            <th className="num">Required</th>
            <th className="num">Delivered</th>
            <th className="num">Shortfall</th>
            <th>Cause</th>
          </tr>
        </thead>
        <tbody>
          {row.days.map((d) => (
            <tr key={d.date} className={d.shortage > 0 ? "simt-day--short" : undefined}>
              <td className="mono">{d.date}</td>
              <td className="num mono">{fmt(d.required)}</td>
              <td className="num mono">{fmt(d.delivered)}</td>
              <td className={`num mono${d.shortage > 0 ? " rp__bad" : ""}`}>
                {d.shortage > 0 ? fmt(d.shortage) : "—"}
              </td>
              <td>{d.shortage > 0 ? <Pill tone="err">{causeLabel(d.cause)}</Pill> : <span className="rp__sub">Served</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TankDayBreakdown({ row }) {
  return (
    <div className="simt-breakdown">
      <table className="ledger rp-table simt-days">
        <thead>
          <tr>
            <th>Date</th><th className="num">Start</th><th className="num">Inflow</th>
            <th className="num">Outflow</th><th className="num">End</th><th className="num">Fill</th>
          </tr>
        </thead>
        <tbody>
          {row.days.map((day) => (
            <tr key={day.date}>
              <td className="mono">{day.date}</td>
              <td className="num mono">{fmt(day.startLevel)}</td>
              <td className="num mono">{fmt(day.inflow)}</td>
              <td className="num mono">{fmt(day.outflow)}</td>
              <td className="num mono">{fmt(day.endLevel)}</td>
              <td className="num mono">{day.fillPct == null ? "—" : `${day.fillPct}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A table card: tinted type icon, uppercase title, count, excluded / override tallies and a hint. */
function Sheet({ title, count, hint, icon: Icon, colour, off = 0, edited = 0, children }) {
  return (
    <section className="rp-card simt-card" aria-label={title} style={{ "--simt-colour": colour }}>
      <header className="rp-card__head">
        {Icon && <span className="simt-card__icon" aria-hidden="true"><Icon size={14} /></span>}
        <h3 className="rp-card__title">{title}</h3>
        {count != null && <span className="rp-card__count">{count}</span>}
        {off > 0 && <Pill tone="off">{off} excluded</Pill>}
        {edited > 0 && <Pill tone="warn">{edited} overridden</Pill>}
        {hint && <span className="rp-card__hint" title={hint}>{hint}</span>}
      </header>
      <div className="sheet__table-wrap">{children}</div>
    </section>
  );
}

/** Excluded / overridden counts for a sheet's rows. */
function tallies(rows, overrides) {
  let off = 0;
  let edited = 0;
  for (const row of rows) {
    const o = overrides[row.nodeId];
    if (!o) continue;
    if (o.active === false) off += 1;
    if (Object.keys(o).some((k) => k !== "active")) edited += 1;
  }
  return { off, edited };
}

const rowClass = (o, open) => [o.active === false ? "simt-row--off" : "", open ? "is-open" : ""].filter(Boolean).join(" ") || undefined;

/**
 * One plant table. Split out so Desalination and Purification render the same
 * columns (matching the SWIIMS config layout), with Design / Maximum / Contracted
 * shown side by side.
 */
function PlantsSheet({ title, hint, icon, colour, rows, overrides, expanded, setExpanded, onOverrideChange }) {
  const set = (id, key) => (value) => onOverrideChange(id, key, value);
  const toggle = (id) => () => setExpanded((cur) => (cur === id ? null : id));
  return (
    <Sheet title={title} count={rows.length} hint={hint} icon={icon} colour={colour} {...tallies(rows, overrides)}>
      <table className="ledger rp-table simt">
        <thead>
          <tr>
            <th className="simt__tick" aria-label="Expand" />
            <th className="simt__tick">On</th>
            <th>Plant</th>
            <th className="num">Design</th>
            <th className="num">Maximum</th>
            <th className="num">Contracted</th>
            <th className="num">Min available</th>
            <th>Derated</th>
            <th className="num">Var O&amp;M</th>
            <th>Cost source</th>
            <th className="num">Allocated</th>
            <th>Utilisation</th>
            <th>Capacity override</th>
            <th>Cost override</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const o = overrides[row.nodeId] || {};
            const open = expanded === row.nodeId;
            const source = OM_SOURCE[row.variableOmSource] || { label: row.variableOmSource, tone: "" };
            return (
              <React.Fragment key={row.nodeId}>
                <tr className={rowClass(o, open)}>
                  <td className="simt__tick"><ExpandCell expanded={open} onToggle={toggle(row.nodeId)} /></td>
                  <td className="simt__tick"><ActiveCell active={o.active} name={row.name} onChange={set(row.nodeId, "active")} /></td>
                  <td>
                    <span className="rp__name">{row.name}</span>
                    <span className="rp__sub mono">{row.assetId}</span>
                  </td>
                  <td className="num mono">{row.design == null ? "—" : fmt(row.design)}</td>
                  <td className="num mono">{row.maximum == null ? "—" : fmt(row.maximum)}</td>
                  <td className="num mono">{row.noCapacity ? "—" : fmt(row.contracted)}</td>
                  <td className="num mono">
                    {row.noCapacity ? <Pill tone="warn">No capacity on record</Pill> : fmt(row.minAvailable)}
                  </td>
                  <td><AffectedChip row={row} /></td>
                  <td className="num mono">{fmt2(row.variableOm)}</td>
                  <td><Pill tone={source.tone}>{source.label}</Pill></td>
                  <td className="num mono">{fmt(row.allocatedM3)}</td>
                  <td><UtilBar pct={row.utilisationPct} /></td>
                  <td>
                    <OverrideCell value={o.available} placeholder={fmt(row.contracted)} suffix="m³/d" label={`${row.name} available capacity override`}
                      onChange={set(row.nodeId, "available")} />
                  </td>
                  <td>
                    <OverrideCell value={o.variableOm} placeholder={fmt2(row.variableOm)} suffix="SAR/m³" label={`${row.name} Variable O&M override`}
                      onChange={set(row.nodeId, "variableOm")} />
                  </td>
                </tr>
                {open && (
                  <tr className="rp__detail-row">
                    <td colSpan={14}><PerDayBreakdown row={row} showAllocated /></td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
          {!rows.length && <tr><td colSpan={14} className="simt-empty">No plants in this group.</td></tr>}
        </tbody>
      </table>
    </Sheet>
  );
}

export default function SimulationTables({ plan, overrides, onOverrideChange }) {
  const [expanded, setExpanded] = useState(null);
  const plants = summarisePlants(plan.days);
  const pumps = summarisePumps(plan.days);
  const tanks = summariseTanks(plan.days);
  const gates = summariseGates(plan.days);
  const pipes = plan.pipes || [];

  const set = (id, key) => (value) => onOverrideChange(id, key, value);
  const toggle = (id) => () => setExpanded((cur) => (cur === id ? null : id));

  // Split by plant kind to match the SWIIMS "Desalination Plants" /
  // "Purification Plants" layout. Anything unclassified falls into a generic
  // Plants sheet so nothing is hidden.
  const desal = plants.filter((p) => p.kind === "desalination");
  const purif = plants.filter((p) => p.kind === "purification");
  const otherPlants = plants.filter((p) => p.kind !== "desalination" && p.kind !== "purification");
  const merit = "Cheapest first — the dispatch merit order.";
  const plantGroups = [
    ["Desalination plants", merit, desal, Waves, ENTITY_TYPE_COLORS.plant],
    ["Purification plants", merit, purif, FlaskConical, ENTITY_TYPE_COLORS.stp],
    ["Plants", "Plants with no recorded technology.", otherPlants, Factory, ENTITY_TYPE_COLORS.plant],
  ].filter(([, , rows]) => rows.length > 0);
  // Fall back to a single Plants sheet when nothing is classified at all.
  if (!plantGroups.length) plantGroups.push(["Plants", merit, plants, Factory, ENTITY_TYPE_COLORS.plant]);

  return (
    <div className="rp simt-tables">
      <div className="rp-group">
        <h2 className="rp-group__title">Production</h2>
        {plantGroups.map(([title, hint, rows, icon, colour]) => (
          <PlantsSheet
            key={title}
            title={title}
            hint={hint}
            icon={icon}
            colour={colour}
            rows={rows}
            overrides={overrides}
            expanded={expanded}
            setExpanded={setExpanded}
            onOverrideChange={onOverrideChange}
          />
        ))}
      </div>

      <div className="rp-group">
        <h2 className="rp-group__title">Storage and transmission</h2>

        <Sheet title="Tanks" count={tanks.length} icon={Cylinder} colour={ENTITY_TYPE_COLORS.tank} {...tallies(tanks, overrides)}
          hint="Levels carry from one day to the next; strategic storage respects the configured reserve.">
          <table className="ledger rp-table simt">
            <thead>
              <tr>
                <th className="simt__tick" aria-label="Expand" /><th className="simt__tick">On</th><th>Tank</th><th>Type</th>
                <th className="num">Capacity</th><th className="num">Start</th><th className="num">End</th>
                <th className="num">Inflow</th><th className="num">Outflow</th>
                <th>Initial %</th><th>Minimum %</th><th>Maximum %</th><th>Reserve rule</th>
              </tr>
            </thead>
            <tbody>
              {tanks.map((row) => {
                const o = overrides[row.nodeId] || {};
                const open = expanded === row.nodeId;
                const rule = o.reserveRule ?? row.reserveRule ?? "preserve";
                return (
                  <React.Fragment key={row.nodeId}>
                    <tr className={rowClass(o, open)}>
                      <td className="simt__tick"><ExpandCell expanded={open} onToggle={toggle(row.nodeId)} /></td>
                      <td className="simt__tick"><ActiveCell active={o.active} name={row.name} onChange={set(row.nodeId, "active")} /></td>
                      <td><span className="rp__name">{row.name}</span><span className="rp__sub mono">{row.assetId}</span></td>
                      <td><Pill tone={row.strategic ? "acc" : ""}>{row.strategic ? "Strategic" : "Operational"}</Pill></td>
                      <td className="num mono">{fmt(row.capacity)}</td>
                      <td className="num mono">{fmt(row.startLevel)}</td>
                      <td className="num mono">{fmt(row.endLevel)}</td>
                      <td className="num mono">{fmt(row.totalInflow)}</td>
                      <td className="num mono">{fmt(row.totalOutflow)}</td>
                      <td><OverrideCell value={o.initialLevelPct} placeholder={String(row.initialPct)} suffix="%" label={`${row.name} initial level override`} onChange={set(row.nodeId, "initialLevelPct")} /></td>
                      <td><OverrideCell value={o.minLevelPct} placeholder={String(row.minPct)} suffix="%" label={`${row.name} minimum level override`} onChange={set(row.nodeId, "minLevelPct")} /></td>
                      <td><OverrideCell value={o.maxLevelPct} placeholder={String(row.maxPct)} suffix="%" label={`${row.name} maximum level override`} onChange={set(row.nodeId, "maxLevelPct")} /></td>
                      <td>
                        <select
                          className={`simt-select${o.reserveRule ? " is-set" : ""}`}
                          aria-label={`${row.name} reserve rule`}
                          value={rule}
                          onChange={(event) => set(row.nodeId, "reserveRule")(event.target.value === "preserve" ? undefined : event.target.value)}
                        >
                          <option value="preserve">Preserve minimum</option>
                          <option value="ignore">Ignore reserve</option>
                          <option value="emergency-drawdown">Emergency drawdown</option>
                        </select>
                      </td>
                    </tr>
                    {open && <tr className="rp__detail-row"><td colSpan={13}><TankDayBreakdown row={row} /></td></tr>}
                  </React.Fragment>
                );
              })}
              {!tanks.length && <tr><td colSpan={13} className="simt-empty">No tanks on this network.</td></tr>}
            </tbody>
          </table>
        </Sheet>

        <Sheet
          title="Pump stations"
          count={pumps.length}
          icon={Droplets}
          colour={ENTITY_TYPE_COLORS.pump}
          {...tallies(pumps, overrides)}
          hint="Throughput limits between inbound and outbound pipes. Loss reflects the pumps down, less any standby cover."
        >
          <table className="ledger rp-table simt">
            <thead>
              <tr>
                <th className="simt__tick" aria-label="Expand" />
                <th className="simt__tick">On</th>
                <th>Station</th>
                <th className="num">Design</th>
                <th className="num">Min available</th>
                <th>Derated</th>
                <th>Throughput override</th>
              </tr>
            </thead>
            <tbody>
              {pumps.map((row) => {
                const o = overrides[row.nodeId] || {};
                const open = expanded === row.nodeId;
                return (
                  <React.Fragment key={row.nodeId}>
                    <tr className={rowClass(o, open)}>
                      <td className="simt__tick"><ExpandCell expanded={open} onToggle={toggle(row.nodeId)} /></td>
                      <td className="simt__tick"><ActiveCell active={o.active} name={row.name} onChange={set(row.nodeId, "active")} /></td>
                      <td>
                        <span className="rp__name">{row.name}</span>
                        <span className="rp__sub mono">{row.assetId}</span>
                      </td>
                      <td className="num mono">{row.unconstrained ? "—" : fmt(row.design)}</td>
                      <td className="num mono">
                        {row.unconstrained ? <Pill tone="warn">No capacity on record</Pill> : fmt(row.minAvailable)}
                      </td>
                      <td><AffectedChip row={row} /></td>
                      <td>
                        <OverrideCell value={o.capacity} placeholder={row.unconstrained ? "Unlimited" : fmt(row.design)} label={`${row.name} capacity override`}
                          suffix="m³/d" onChange={set(row.nodeId, "capacity")} />
                      </td>
                    </tr>
                    {open && (
                      <tr className="rp__detail-row">
                        <td colSpan={7}><PerDayBreakdown row={row} /></td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!pumps.length && <tr><td colSpan={7} className="simt-empty">No pump stations on this network.</td></tr>}
            </tbody>
          </table>
        </Sheet>

        <Sheet title="Pipelines" count={pipes.length} icon={Spline} colour={PIPE_COLOUR}
          hint="Peak utilisation across the range. Pipes with no capacity recorded are treated as unconstrained.">
          <table className="ledger rp-table simt">
            <thead>
              <tr>
                <th>Pipe</th>
                <th>From</th>
                <th>To</th>
                <th>Direction</th>
                <th className="num">Capacity</th>
                <th className="num">Peak flow</th>
                <th>Peak utilisation</th>
              </tr>
            </thead>
            <tbody>
              {pipes.map((pipe) => (
                <tr key={pipe.id} className={pipe.active ? undefined : "simt-row--off"}>
                  <td><span className="rp__name">{pipe.label}</span></td>
                  <td>{pipe.source}</td>
                  <td>{pipe.target}</td>
                  <td><Pill>{pipe.bidirectional ? "Bidirectional" : "One-way"}</Pill></td>
                  <td className="num mono">{pipe.unconstrained ? <Pill tone="warn">Not set</Pill> : fmt(pipe.capacity)}</td>
                  <td className="num mono">{fmt(pipe.peakFlow)}</td>
                  <td>{pipe.unconstrained ? <span className="rp__sub">—</span> : <UtilBar pct={pipe.peakUtilisationPct} />}</td>
                </tr>
              ))}
              {!pipes.length && <tr><td colSpan={7} className="simt-empty">No pipes on this network.</td></tr>}
            </tbody>
          </table>
        </Sheet>
      </div>

      <div className="rp-group">
        <h2 className="rp-group__title">Demand</h2>
        <Sheet title="City gates" count={gates.length} icon={MapPinned} colour={ENTITY_TYPE_COLORS.handover_point} {...tallies(gates, overrides)}
          hint="Required demand is the approved figure from the Demand portal.">
          <table className="ledger rp-table simt">
            <thead>
              <tr>
                <th className="simt__tick" aria-label="Expand" />
                <th className="simt__tick">On</th>
                <th>City gate</th>
                <th className="num">Required (avg/day)</th>
                <th className="num">Required (total)</th>
                <th className="num">Deliverable</th>
                <th className="num">Shortfall</th>
                <th className="num">Short days</th>
                <th>Worst day</th>
                <th>Demand override</th>
              </tr>
            </thead>
            <tbody>
              {gates.map((row) => {
                const o = overrides[row.nodeId] || {};
                const open = expanded === row.nodeId;
                return (
                  <React.Fragment key={row.nodeId}>
                    <tr className={rowClass(o, open)}>
                      <td className="simt__tick"><ExpandCell expanded={open} onToggle={toggle(row.nodeId)} /></td>
                      <td className="simt__tick"><ActiveCell active={o.active} name={row.name} onChange={set(row.nodeId, "active")} /></td>
                      <td>
                        <span className="rp__name">{row.name}</span>
                        <span className="rp__sub mono">{row.assetId}</span>
                      </td>
                      <td className="num mono">{fmt(row.avgRequired)}</td>
                      <td className="num mono">{fmt(row.requiredM3)}</td>
                      <td className="num mono">{fmt(row.deliveredM3)}</td>
                      <td className={`num mono${row.shortageM3 > 0 ? " rp__bad" : ""}`}>
                        {row.shortageM3 > 0 ? fmt(row.shortageM3) : "—"}
                      </td>
                      <td className="num mono">{row.shortDays || "—"}</td>
                      <td className="mono">{row.worstDay ? row.worstDay.date : "—"}</td>
                      <td>
                        <OverrideCell value={o.demand} placeholder={fmt(row.avgRequired)} suffix="m³/d" label={`${row.name} demand override`}
                          onChange={set(row.nodeId, "demand")} />
                      </td>
                    </tr>
                    {open && (
                      <tr className="rp__detail-row">
                        <td colSpan={10}><GateDayBreakdown row={row} /></td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!gates.length && <tr><td colSpan={10} className="simt-empty">No city gates on this network.</td></tr>}
            </tbody>
          </table>
        </Sheet>
      </div>
    </div>
  );
}
