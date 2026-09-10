import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, ChevronDown, ChevronRight, Download, Send, X } from "lucide-react";
import { allocationGrid, allocationsToCsv, groupDemandVerdicts } from "../../lib/simulationRows";
import { downloadCsv } from "../../lib/exportCsv";
import "./DecisionsPanel.css";

// The three decisions the desktop hands back to the portals, and the single
// action that persists them. Nothing here writes until Publish is pressed —
// pressing Run only produces a draft.

const nf = new Intl.NumberFormat("en-US");
const fmt = (v) => (v == null ? "—" : nf.format(Math.round(v)));

const STATUS = {
  approved: { label: "Approve", tone: "good", Icon: Check },
  adjusted: { label: "Revise", tone: "warn", Icon: AlertTriangle },
  postponed: { label: "Postpone", tone: "warn", Icon: CalendarClock },
  rejected: { label: "Reject", tone: "bad", Icon: X },
  shortfall: { label: "Shortfall", tone: "bad", Icon: X },
};

function StatusBadge({ status }) {
  const { label, tone, Icon } = STATUS[status] || { label: status, tone: "", Icon: AlertTriangle };
  return (
    <span className={`dp__badge dp__badge--${tone}`}>
      <Icon size={12} />
      {label}
    </span>
  );
}

function DecisionToggle({ checked, onChange, disabled, label }) {
  return (
    <button type="button" aria-label={label}
      className={`dp__decision-btn ${checked ? "dp__decision-btn--yes" : "dp__decision-btn--no"} is-active`}
      onClick={() => onChange(!checked)} disabled={disabled}
      title={disabled ? label : checked ? "Approved in full — click to change" : "Rejected or revised — click to change"}>
      {checked ? <Check size={16} /> : <X size={16} />}
    </button>
  );
}

function DemandVolumeEditor({ row, disabled, onCommit }) {
  const [value, setValue] = useState(row.approved);
  useEffect(() => setValue(row.approved), [row.approved]);
  return <input className="dp__volume" type="number" min="0" max={row.required} value={value}
    disabled={disabled} onChange={(event) => setValue(event.target.value)}
    onBlur={async () => {
      if (Number(value) === row.approved) return;
      if (!(await onCommit(value))) setValue(row.approved);
    }} />;
}

function Tally({ verdicts, keyOf = (v) => v.status }) {
  const counts = verdicts.reduce((acc, v) => {
    const k = keyOf(v);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const order = ["approved", "adjusted", "postponed", "rejected", "shortfall"];
  return (
    <span className="dp__tally">
      {order.filter((s) => counts[s]).map((s) => (
        <span key={s} className={`dp__tally-item dp__tally-item--${STATUS[s].tone}`}>
          {counts[s]} {STATUS[s].label.toLowerCase()}
        </span>
      ))}
    </span>
  );
}

export default function DecisionsPanel({ plan, onPublish, publishing, publishError, published, onDecisionSave }) {
  const [expanded, setExpanded] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const [editError, setEditError] = useState(null);
  const maintenance = plan.maintenanceVerdicts || [];
  const demandByGate = useMemo(() => groupDemandVerdicts(plan.demandVerdicts), [plan.demandVerdicts]);
  const grid = useMemo(() => allocationGrid(plan), [plan]);

  const allocationCount = (plan.plantAllocations || []).length;
  const isPublished = published || plan.status === "published";

  const save = async (key, payload) => {
    setSavingKey(key);
    setEditError(null);
    try { await onDecisionSave(payload); return true; }
    catch (error) { setEditError(error.message); return false; }
    finally { setSavingKey(null); }
  };

  const changeMaintenance = (row, decision) => {
    let operatorComment = decision ? "" : row.operatorComment;
    if (!decision) {
      operatorComment = window.prompt("Add a required comment for this maintenance rejection:", operatorComment || "");
      if (operatorComment == null) return;
    }
    save(`m:${row.recordId}`, { maintenanceVerdicts: [{ recordId: row.recordId, decision, operatorComment }] });
  };

  const changeDemand = async (row, approved) => {
    const value = Math.max(0, Math.min(row.required, Number(approved)));
    let operatorComment = value >= row.required ? "" : row.operatorComment;
    if (value < row.required) {
      operatorComment = window.prompt("Add a required comment for this demand revision:", operatorComment || "");
      if (operatorComment == null) return false;
    }
    return save(`d:${row.assetId}:${row.date}`, {
      demandVerdicts: [{ assetId: row.assetId, date: row.date, approved: value, operatorComment }],
    });
  };

  return (
    <>
      <section className={`dp__publish ${isPublished ? "dp__publish--done" : ""}`.trim()}>
        <div className="dp__publish-copy">
          <h2>{isPublished ? "Published to the portals" : "Publish these decisions"}</h2>
          <p>
            {isPublished
              ? "Production, Demand and Maintenance records carry this plan's id."
              : `Writes ${allocationCount} production allocation(s), ${plan.demandVerdicts.length} demand decision(s) and ${maintenance.length} maintenance decision(s). Nothing has been written yet.`}
          </p>
        </div>
        <button className="dp__publish-btn" onClick={onPublish} disabled={publishing || isPublished || !!savingKey}>
          <Send size={14} />
          {isPublished ? "Published" : publishing ? "Publishing…" : "Publish decisions"}
        </button>
      </section>

      {publishError && <div className="metric__notice metric__notice--error"><span>{publishError}</span></div>}
      {editError && <div className="metric__notice metric__notice--error"><span>{editError}</span></div>}

      <section className="sheet">
        <header className="sheet__head sheet__head--simple">
          <h2 className="sheet__name sheet__name--sm">
            Maintenance Requests<span className="sheet__count">{maintenance.length}</span>
          </h2>
          <Tally verdicts={maintenance} />
        </header>
        <div className="sheet__table-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Type</th>
                <th>Window</th>
                <th className="num">Shortage caused</th>
                <th>Decision</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {maintenance.map((v) => (
                <React.Fragment key={v.recordId}>
                  <tr
                    className={v.affectedGates.length ? "dp__row--click" : undefined}
                    onClick={() => v.affectedGates.length && setExpanded(expanded === v.recordId ? null : v.recordId)}
                  >
                    <td>
                      <span className="dp__name">{v.assetName}</span>
                      <span className="dp__sub mono">{v.assetId}</span>
                    </td>
                    <td>{v.maintenanceType || "—"}</td>
                    <td className="mono">
                      {v.windowDays[0]}
                      {v.windowDays.length > 1 && ` → ${v.windowDays[v.windowDays.length - 1]}`}
                    </td>
                    <td className={`num mono ${v.shortageCaused > 0 ? "dp__bad" : ""}`}>
                      {v.shortageCaused > 0 ? fmt(v.shortageCaused) : "—"}
                    </td>
                    <td>
                      <DecisionToggle checked={v.decision ?? v.status === "approved"}
                        disabled={isPublished || savingKey === `m:${v.recordId}`}
                        onChange={(decision) => changeMaintenance(v, decision)} label={`Decision for ${v.assetName}`} />
                    </td>
                    <td className="dp__reason">
                      {v.reason}
                      {!(v.decision ?? v.status === "approved") && (
                        <button type="button" className={`dp__comment ${v.operatorComment ? "" : "dp__comment--required"}`}
                          disabled={isPublished} onClick={() => changeMaintenance(v, false)}>
                          {v.operatorComment ? `Operator: ${v.operatorComment}` : "Add required comment before publishing"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === v.recordId && (
                    <tr className="dp__detail-row">
                      <td colSpan={6}>
                        <div className="dp__detail">
                          <h4>City gates this work would cut</h4>
                          <ul className="dp__gates">
                            {v.affectedGates.map((g) => (
                              <li key={g.assetId}>
                                <span className="dp__name">{g.name}</span>
                                <span className="dp__bad mono">−{fmt(g.m3)} m³</span>
                              </li>
                            ))}
                          </ul>
                          {v.suggestedWindow && (
                            <p className="dp__suggest">
                              <CalendarClock size={13} />
                              Clear alternative window: <strong>{v.suggestedWindow.from}</strong>
                              {v.suggestedWindow.to !== v.suggestedWindow.from && <> → <strong>{v.suggestedWindow.to}</strong></>}
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {!maintenance.length && (
                <tr>
                  <td colSpan={6} className="dp__empty">
                    No maintenance requests awaiting a desktop decision in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sheet">
        <header className="sheet__head sheet__head--simple">
          <h2 className="sheet__name sheet__name--sm">
            City Gate Demand<span className="sheet__count">{demandByGate.length}</span>
          </h2>
          <Tally verdicts={demandByGate} />
        </header>
        <div className="sheet__table-wrap">
          <table className="ledger">
            <thead>
              <tr>
                <th>City gate</th>
                <th className="num">Requested</th>
                <th className="num">Approved</th>
                <th className="num">Days revised</th>
                <th>Decision</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {demandByGate.map((gate) => {
                const open = expanded === `gate:${gate.assetId}`;
                const fullyApproved = gate.days.every((day) => day.approved >= day.required);
                return (
                  <React.Fragment key={gate.assetId}>
                    <tr className="dp__row--click" onClick={() => setExpanded(open ? null : `gate:${gate.assetId}`)}>
                      <td>
                        <span className="dp__name">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {gate.gateName}</span>
                        <span className="dp__sub mono">{gate.assetId}</span>
                      </td>
                      <td className="num mono">{fmt(gate.requiredM3)}</td>
                      <td className="num mono">{fmt(gate.approvedM3)}</td>
                      <td className="num mono">{gate.revisedDays || "—"}</td>
                      <td><DecisionToggle checked={fullyApproved} disabled label={`Summary decision for ${gate.gateName}`} onChange={() => {}} /></td>
                      <td className="dp__reason">{fullyApproved ? "Every day is approved in full." : "Expand to edit daily revisions."}</td>
                    </tr>
                    {open && (
                      <tr className="dp__detail-row">
                        <td colSpan={6}>
                          <table className="dp__days">
                            <thead><tr><th>Date</th><th className="num">Requested</th><th className="num">Approved</th><th>Decision</th><th>Comment</th></tr></thead>
                            <tbody>{gate.days.map((day) => {
                              const key = `d:${day.assetId}:${day.date}`;
                              const full = day.approved >= day.required;
                              return (
                                <tr key={day.date}>
                                  <td className="mono">{day.date}</td>
                                  <td className="num mono">{fmt(day.required)}</td>
                                  <td className="num"><DemandVolumeEditor row={day} disabled={isPublished || savingKey === key}
                                    onCommit={(value) => changeDemand(day, value)} /></td>
                                  <td><DecisionToggle checked={full} disabled={isPublished || savingKey === key}
                                    label={`Decision for ${gate.gateName} on ${day.date}`}
                                    onChange={(checked) => changeDemand(day, checked ? day.required : 0)} /></td>
                                  <td className="dp__reason">{full ? "—" : <button type="button"
                                    className={`dp__comment ${day.operatorComment ? "" : "dp__comment--required"}`}
                                    disabled={isPublished} onClick={() => changeDemand(day, day.approved)}>
                                    {day.operatorComment || "Add required comment before publishing"}
                                  </button>}</td>
                                </tr>
                              );
                            })}</tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!demandByGate.length && (
                <tr><td colSpan={6} className="dp__empty">No approved demand in this range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sheet">
        <header className="sheet__head sheet__head--simple">
          <h2 className="sheet__name sheet__name--sm">
            Production Allocation<span className="sheet__count">{grid.rows.length}</span>
          </h2>
          <button
            className="dp__export"
            onClick={() => downloadCsv(`dispatch-allocation-${plan.from}-to-${plan.to}.csv`, allocationsToCsv(grid))}
          >
            <Download size={13} /> Export CSV
          </button>
        </header>
        <div className="sheet__table-wrap">
          <table className="ledger dp__allocation-grid">
            <thead>
              <tr>
                <th className="dp__sticky">Plant</th>
                {grid.dates.map((date) => <th key={date} className="num">{date.slice(5)}</th>)}
                <th className="num">Total</th>
                <th className="num">Cost (SAR)</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.assetId}>
                  <td className="dp__sticky">
                    <span className="dp__name">{row.name}</span>
                    <span className="dp__sub mono">{row.assetId}</span>
                  </td>
                  {grid.dates.map((date) => (
                    <td key={date} className="num mono">{fmt(row.byDate[date] ?? 0)}</td>
                  ))}
                  <td className="num mono dp__total">{fmt(row.totalM3)}</td>
                  <td className="num mono">{fmt(row.costSar)}</td>
                </tr>
              ))}
              {!grid.rows.length && (
                <tr><td colSpan={grid.dates.length + 3} className="dp__empty">No production allocation in this run.</td></tr>
              )}
            </tbody>
            {grid.rows.length > 0 && (
              <tfoot>
                <tr>
                  <td className="dp__sticky">Total</td>
                  {grid.dates.map((date) => (
                    <td key={date} className="num mono">{fmt(grid.totalsByDate[date])}</td>
                  ))}
                  <td className="num mono">{fmt(plan.kpis.totalDeliveredM3)}</td>
                  <td className="num mono">{fmt(plan.kpis.totalVariableOmCost)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </>
  );
}
