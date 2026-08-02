import React, { useMemo, useState } from "react";
import { CheckCircle2, Send, XCircle, CalendarClock, AlertTriangle } from "lucide-react";
import { groupDemandVerdicts } from "../../lib/simulationRows";
import "./DecisionsPanel.css";

// The three decisions the desktop hands back to the portals, and the single
// action that persists them. Nothing here writes until Publish is pressed —
// pressing Run only produces a draft.

const nf = new Intl.NumberFormat("en-US");
const fmt = (v) => (v == null ? "—" : nf.format(Math.round(v)));

const STATUS = {
  approved: { label: "Approve", tone: "good", Icon: CheckCircle2 },
  adjusted: { label: "Revise", tone: "warn", Icon: AlertTriangle },
  postponed: { label: "Postpone", tone: "warn", Icon: CalendarClock },
  rejected: { label: "Reject", tone: "bad", Icon: XCircle },
  shortfall: { label: "Shortfall", tone: "bad", Icon: XCircle },
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

export default function DecisionsPanel({ plan, onPublish, publishing, publishError, published }) {
  const [expanded, setExpanded] = useState(null);
  const maintenance = plan.maintenanceVerdicts || [];
  const demandByGate = useMemo(() => groupDemandVerdicts(plan.demandVerdicts), [plan.demandVerdicts]);

  const allocationCount = (plan.plantAllocations || []).length;
  const isPublished = published || plan.status === "published";

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
        <button className="dp__publish-btn" onClick={onPublish} disabled={publishing || isPublished}>
          <Send size={14} />
          {isPublished ? "Published" : publishing ? "Publishing…" : "Publish decisions"}
        </button>
      </section>

      {publishError && <div className="metric__notice metric__notice--error"><span>{publishError}</span></div>}

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
                    <td><StatusBadge status={v.status} /></td>
                    <td className="dp__reason">{v.reason}</td>
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
              {demandByGate.map((gate) => (
                <tr key={gate.assetId}>
                  <td>
                    <span className="dp__name">{gate.gateName}</span>
                    <span className="dp__sub mono">{gate.assetId}</span>
                  </td>
                  <td className="num mono">{fmt(gate.requiredM3)}</td>
                  <td className="num mono">{fmt(gate.approvedM3)}</td>
                  <td className="num mono">{gate.revisedDays || "—"}</td>
                  <td><StatusBadge status={gate.status} /></td>
                  <td className="dp__reason">
                    {gate.status === "approved"
                      ? "Requested volume is deliverable on every day."
                      : gate.days.find((d) => d.status !== "approved")?.reason}
                  </td>
                </tr>
              ))}
              {!demandByGate.length && (
                <tr><td colSpan={6} className="dp__empty">No approved demand in this range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
