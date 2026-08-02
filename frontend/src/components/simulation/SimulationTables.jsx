import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { summariseGates, summarisePlants, summarisePumps } from "../../lib/simulationRows";
import "./SimulationTables.css";

// The four config tables. Every number is read from the portals via the last
// run; the rightmost cell of each row is the operator's per-run override.
// Overrides live only in the saved configuration and never write back to the
// portals — a run is auditable as "portal data plus these N deviations".

const nf = new Intl.NumberFormat("en-US");
const fmt = (v) => (v == null ? "—" : nf.format(Math.round(v)));
const fmt2 = (v) => (v == null ? "—" : v.toFixed(2));

const OM_SOURCE_LABEL = {
  economics: "Economics",
  plant_spec: "Asset record",
  default: "Default",
  override: "Override",
};

function OverrideCell({ value, placeholder, onChange, suffix }) {
  return (
    <span className="simt__override">
      <input
        type="number"
        step="any"
        min="0"
        className="simt__override-input"
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
      {suffix && <span className="simt__override-suffix">{suffix}</span>}
    </span>
  );
}

function ActiveCell({ active, onChange }) {
  return (
    <input
      type="checkbox"
      className="simt__active"
      checked={active !== false}
      onChange={(e) => onChange(e.target.checked ? undefined : false)}
      aria-label="Include in the dispatch"
    />
  );
}

/**
 * Days affected, stated as a count rather than an average. Maintenance is spiky,
 * so a mean across the horizon describes a day that never happened; a count is
 * a fact, and the expanded rows carry the actual per-day numbers.
 */
function AffectedChip({ row }) {
  const parts = [];
  if (row.maintenanceDays) parts.push(`${row.maintenanceDays} maint.`);
  if (row.outageDays) parts.push(`${row.outageDays} outage`);
  if (!parts.length) return <span className="simt__sub">No derate</span>;
  return (
    <span className="simt__chip simt__chip--warn">
      {parts.join(" · ")} of {row.totalDays} days
    </span>
  );
}

/** Day-by-day capacity for one asset — the numbers the portals actually hold. */
function PerDayBreakdown({ row, showAllocated }) {
  return (
    <div className="simt__breakdown">
      <table className="simt__days">
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
              <tr key={d.date} className={derated ? "simt__day--derated" : undefined}>
                <td className="mono">{d.date}</td>
                <td className="num mono">{fmt(d.contracted)}</td>
                <td className={`num mono ${d.maintenanceLoss > 0 ? "simt__short" : ""}`}>
                  {d.maintenanceLoss > 0 ? fmt(d.maintenanceLoss) : "—"}
                </td>
                <td className={`num mono ${d.outageLoss > 0 ? "simt__short" : ""}`}>
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

function ExpandCell({ expanded, onToggle }) {
  return (
    <button className="simt__expand" onClick={onToggle} aria-expanded={expanded} aria-label="Show daily breakdown">
      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    </button>
  );
}

function Sheet({ title, count, hint, children }) {
  return (
    <section className="sheet">
      <header className="sheet__head sheet__head--simple">
        <h2 className="sheet__name sheet__name--sm">
          {title}
          {count != null && <span className="sheet__count">{count}</span>}
        </h2>
        {hint && <span className="simt__hint">{hint}</span>}
      </header>
      <div className="sheet__table-wrap">{children}</div>
    </section>
  );
}

export default function SimulationTables({ plan, overrides, onOverrideChange }) {
  const [expanded, setExpanded] = useState(null);
  const plants = summarisePlants(plan.days);
  const pumps = summarisePumps(plan.days);
  const gates = summariseGates(plan.days);
  const pipes = plan.pipes || [];

  const set = (id, key) => (value) => onOverrideChange(id, key, value);
  const toggle = (id) => () => setExpanded((cur) => (cur === id ? null : id));

  return (
    <>
      <Sheet
        title="Plants"
        count={plants.length}
        hint="Cheapest first — the dispatch merit order. Expand a row for its day-by-day capacity."
      >
        <table className="ledger simt">
          <thead>
            <tr>
              <th className="simt__tick" />
              <th className="simt__tick">On</th>
              <th>Plant</th>
              <th className="num">Contracted</th>
              <th className="num">Min available</th>
              <th>Derated</th>
              <th className="num">Var O&amp;M</th>
              <th>Cost source</th>
              <th className="num">Allocated</th>
              <th className="num">Util.</th>
              <th>Capacity override</th>
              <th>Cost override</th>
            </tr>
          </thead>
          <tbody>
            {plants.map((row) => {
              const o = overrides[row.nodeId] || {};
              const open = expanded === row.nodeId;
              return (
                <React.Fragment key={row.nodeId}>
                  <tr className={o.active === false ? "simt__row--off" : undefined}>
                    <td className="simt__tick"><ExpandCell expanded={open} onToggle={toggle(row.nodeId)} /></td>
                    <td className="simt__tick"><ActiveCell active={o.active} onChange={set(row.nodeId, "active")} /></td>
                    <td>
                      <span className="simt__name">{row.name}</span>
                      <span className="simt__sub mono">{row.assetId}</span>
                    </td>
                    <td className="num mono">{row.noCapacity ? "—" : fmt(row.contracted)}</td>
                    <td className="num mono">
                      {row.noCapacity
                        ? <span className="simt__badge simt__badge--warn">No capacity on record</span>
                        : fmt(row.minAvailable)}
                    </td>
                    <td><AffectedChip row={row} /></td>
                    <td className="num mono">{fmt2(row.variableOm)}</td>
                    <td>
                      <span className={`simt__badge simt__badge--${row.variableOmSource}`}>
                        {OM_SOURCE_LABEL[row.variableOmSource] || row.variableOmSource}
                      </span>
                    </td>
                    <td className="num mono">{fmt(row.allocatedM3)}</td>
                    <td className="num mono">{row.utilisationPct == null ? "—" : `${row.utilisationPct}%`}</td>
                    <td>
                      <OverrideCell value={o.available} placeholder={fmt(row.contracted)} suffix="m³/d"
                        onChange={set(row.nodeId, "available")} />
                    </td>
                    <td>
                      <OverrideCell value={o.variableOm} placeholder={fmt2(row.variableOm)} suffix="SAR/m³"
                        onChange={set(row.nodeId, "variableOm")} />
                    </td>
                  </tr>
                  {open && (
                    <tr className="simt__detail-row">
                      <td colSpan={12}><PerDayBreakdown row={row} showAllocated /></td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {!plants.length && <tr><td colSpan={12} className="simt__empty">No plants on this network.</td></tr>}
          </tbody>
        </table>
      </Sheet>

      <Sheet
        title="Pump Stations"
        count={pumps.length}
        hint="Throughput limits applied between inbound and outbound pipes. Loss reflects the pumps down, less any standby cover."
      >
        <table className="ledger simt">
          <thead>
            <tr>
              <th className="simt__tick" />
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
                  <tr className={o.active === false ? "simt__row--off" : undefined}>
                    <td className="simt__tick"><ExpandCell expanded={open} onToggle={toggle(row.nodeId)} /></td>
                    <td className="simt__tick"><ActiveCell active={o.active} onChange={set(row.nodeId, "active")} /></td>
                    <td>
                      <span className="simt__name">{row.name}</span>
                      <span className="simt__sub mono">{row.assetId}</span>
                    </td>
                    <td className="num mono">{row.unconstrained ? "—" : fmt(row.design)}</td>
                    <td className="num mono">
                      {row.unconstrained
                        ? <span className="simt__badge simt__badge--warn">No capacity on record</span>
                        : fmt(row.minAvailable)}
                    </td>
                    <td><AffectedChip row={row} /></td>
                    <td>
                      <OverrideCell value={o.capacity} placeholder={row.unconstrained ? "Unlimited" : fmt(row.design)}
                        suffix="m³/d" onChange={set(row.nodeId, "capacity")} />
                    </td>
                  </tr>
                  {open && (
                    <tr className="simt__detail-row">
                      <td colSpan={7}><PerDayBreakdown row={row} /></td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {!pumps.length && <tr><td colSpan={7} className="simt__empty">No pump stations on this network.</td></tr>}
          </tbody>
        </table>
      </Sheet>

      <Sheet title="City Gates" count={gates.length} hint="Required demand is the approved figure from the Demand portal.">
        <table className="ledger simt">
          <thead>
            <tr>
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
              return (
                <tr key={row.nodeId} className={o.active === false ? "simt__row--off" : undefined}>
                  <td className="simt__tick"><ActiveCell active={o.active} onChange={set(row.nodeId, "active")} /></td>
                  <td>
                    <span className="simt__name">{row.name}</span>
                    <span className="simt__sub mono">{row.assetId}</span>
                  </td>
                  <td className="num mono">{fmt(row.avgRequired)}</td>
                  <td className="num mono">{fmt(row.requiredM3)}</td>
                  <td className="num mono">{fmt(row.deliveredM3)}</td>
                  <td className={`num mono ${row.shortageM3 > 0 ? "simt__short" : ""}`}>
                    {row.shortageM3 > 0 ? fmt(row.shortageM3) : "—"}
                  </td>
                  <td className="num mono">{row.shortDays || "—"}</td>
                  <td className="mono">{row.worstDay ? row.worstDay.date : "—"}</td>
                  <td>
                    <OverrideCell value={o.demand} placeholder={fmt(row.avgRequired)} suffix="m³/d"
                      onChange={set(row.nodeId, "demand")} />
                  </td>
                </tr>
              );
            })}
            {!gates.length && <tr><td colSpan={9} className="simt__empty">No city gates on this network.</td></tr>}
          </tbody>
        </table>
      </Sheet>

      <Sheet title="Pipelines" count={pipes.length} hint="Peak utilisation across the range. Pipes with no capacity recorded are treated as unconstrained.">
        <table className="ledger simt">
          <thead>
            <tr>
              <th>Pipe</th>
              <th>From</th>
              <th>To</th>
              <th>Direction</th>
              <th className="num">Capacity</th>
              <th className="num">Peak flow</th>
              <th className="num">Peak util.</th>
            </tr>
          </thead>
          <tbody>
            {pipes.map((pipe) => (
              <tr key={pipe.id} className={pipe.active ? undefined : "simt__row--off"}>
                <td><span className="simt__name">{pipe.label}</span></td>
                <td>{pipe.source}</td>
                <td>{pipe.target}</td>
                <td>{pipe.bidirectional ? "Bidirectional" : "One-way"}</td>
                <td className="num mono">
                  {pipe.unconstrained
                    ? <span className="simt__badge simt__badge--warn">Not set</span>
                    : fmt(pipe.capacity)}
                </td>
                <td className="num mono">{fmt(pipe.peakFlow)}</td>
                <td className={`num mono ${pipe.peakUtilisationPct >= 99 ? "simt__short" : ""}`}>
                  {pipe.peakUtilisationPct == null ? "—" : `${Math.round(pipe.peakUtilisationPct)}%`}
                </td>
              </tr>
            ))}
            {!pipes.length && <tr><td colSpan={7} className="simt__empty">No pipes on this network.</td></tr>}
          </tbody>
        </table>
      </Sheet>
    </>
  );
}
