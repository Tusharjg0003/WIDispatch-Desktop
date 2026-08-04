import React, { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { allocationGrid, allocationsToCsv, causeLabel, summariseGates } from "../../lib/simulationRows";
import { downloadCsv } from "../../lib/exportCsv";
import "./ResultsPanel.css";

const nf = new Intl.NumberFormat("en-US");
const fmt = (v) => (v == null ? "—" : nf.format(Math.round(v)));

// Thresholds carried over from the WIPlan analytics panel so operators read
// the same colours they are used to.
const satisfactionTone = (pct) => (pct == null ? "" : pct >= 80 ? "kpi--good" : pct >= 50 ? "kpi--warn" : "kpi--bad");
const utilisationTone = (pct) => (pct == null ? "" : pct >= 90 ? "kpi--bad" : pct >= 70 ? "kpi--warn" : "");

function Kpi({ eyebrow, value, sub, tone = "" }) {
  return (
    <div className={`kpi ${tone}`.trim()}>
      <span className="kpi__eyebrow">{eyebrow}</span>
      <span className="kpi__value">{value}</span>
      {sub && <span className="kpi__sub">{sub}</span>}
    </div>
  );
}

export default function ResultsPanel({ plan }) {
  const [expandedGate, setExpandedGate] = useState(null);
  const k = plan.kpis;

  const grid = useMemo(() => allocationGrid(plan), [plan]);
  const gates = useMemo(() => summariseGates(plan.days), [plan.days]);
  const shortGates = gates.filter((g) => g.shortageM3 > 0);

  // Only days that actually bound the answer are worth showing.
  const constrainedDays = plan.days.filter((d) => d.bindingConstraints.length && d.totalShortage > 0);

  return (
    <>
      <section className="status-strip" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
        <Kpi
          eyebrow="Demand satisfaction"
          value={k.satisfactionPct == null ? "—" : `${k.satisfactionPct}%`}
          sub={`${fmt(k.totalDeliveredM3)} of ${fmt(k.totalRequiredM3)} m³`}
          tone={satisfactionTone(k.satisfactionPct)}
        />
        <Kpi
          eyebrow="Shortfall"
          value={fmt(k.totalShortageM3)}
          sub={k.gatesShort ? `${k.gatesShort} gate(s) affected` : "All gates served"}
          tone={k.totalShortageM3 > 0 ? "kpi--warn" : "kpi--good"}
        />
        <Kpi
          eyebrow="Plant utilisation"
          value={k.plantUtilisationPct == null ? "—" : `${k.plantUtilisationPct}%`}
          sub="Of available capacity"
          tone={utilisationTone(k.plantUtilisationPct)}
        />
        <Kpi eyebrow="Variable O&M" value={fmt(k.totalVariableOmCost)} sub="SAR over the range" />
        <Kpi
          eyebrow="Avg cost"
          value={k.avgCostPerM3 == null ? "—" : k.avgCostPerM3.toFixed(2)}
          sub="SAR per m³ delivered"
        />
        <Kpi
          eyebrow="Bottleneck days"
          value={k.bottleneckDays}
          sub={`Of ${k.days} day(s)`}
          tone={k.bottleneckDays > 0 ? "kpi--warn" : ""}
        />
      </section>

      {shortGates.length > 0 && (
        <section className="sheet">
          <header className="sheet__head sheet__head--simple">
            <h2 className="sheet__name sheet__name--sm">
              Shortfalls<span className="sheet__count">{shortGates.length}</span>
            </h2>
            <span className="rp__hint">Select a gate to see what bound it.</span>
          </header>
          <div className="sheet__table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th>City gate</th>
                  <th className="num">Required</th>
                  <th className="num">Deliverable</th>
                  <th className="num">Shortfall</th>
                  <th className="num">Short days</th>
                  <th>Cause</th>
                </tr>
              </thead>
              <tbody>
                {shortGates.map((gate) => (
                  <React.Fragment key={gate.nodeId}>
                    <tr
                      className="rp__row rp__row--click"
                      onClick={() => setExpandedGate(expandedGate === gate.nodeId ? null : gate.nodeId)}
                    >
                      <td>
                        <span className="rp__name">{gate.name}</span>
                        <span className="rp__sub mono">{gate.assetId}</span>
                      </td>
                      <td className="num mono">{fmt(gate.requiredM3)}</td>
                      <td className="num mono">{fmt(gate.deliveredM3)}</td>
                      <td className="num mono rp__bad">{fmt(gate.shortageM3)}</td>
                      <td className="num mono">{gate.shortDays}</td>
                      <td>{causeLabel(gate.worstDay?.cause)}</td>
                    </tr>
                    {expandedGate === gate.nodeId && (
                      <tr className="rp__detail-row">
                        <td colSpan={6}>
                          <div className="rp__detail">
                            <h4>Binding constraints on the worst day ({gate.worstDay?.date})</h4>
                            <BindingList
                              constraints={
                                plan.days.find((d) => d.date === gate.worstDay?.date)?.bindingConstraints || []
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {constrainedDays.length > 0 && (
        <section className="sheet">
          <header className="sheet__head sheet__head--simple">
            <h2 className="sheet__name sheet__name--sm">
              Binding Constraints by Day<span className="sheet__count">{constrainedDays.length}</span>
            </h2>
            <span className="rp__hint">The minimum cut — relieving any of these is what raises delivery.</span>
          </header>
          <div className="sheet__table-wrap">
            <table className="ledger">
              <thead>
                <tr><th>Date</th><th className="num">Shortfall</th><th>Constraints</th></tr>
              </thead>
              <tbody>
                {constrainedDays.map((day) => (
                  <tr key={day.date}>
                    <td className="mono">{day.date}</td>
                    <td className="num mono rp__bad">{fmt(day.totalShortage)}</td>
                    <td><BindingList constraints={day.bindingConstraints} inline /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="sheet">
        <header className="sheet__head sheet__head--simple">
          <h2 className="sheet__name sheet__name--sm">
            Production Allocation<span className="sheet__count">{grid.rows.length}</span>
          </h2>
          <button
            className="rp__export"
            onClick={() => downloadCsv(`dispatch-allocation-${plan.from}-to-${plan.to}.csv`, allocationsToCsv(grid))}
          >
            <Download size={13} /> Export CSV
          </button>
        </header>
        <div className="sheet__table-wrap">
          <table className="ledger rp__grid">
            <thead>
              <tr>
                <th className="rp__sticky">Plant</th>
                {grid.dates.map((date) => <th key={date} className="num">{date.slice(5)}</th>)}
                <th className="num">Total</th>
                <th className="num">Cost (SAR)</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.assetId}>
                  <td className="rp__sticky">
                    <span className="rp__name">{row.name}</span>
                    <span className="rp__sub mono">{row.assetId}</span>
                  </td>
                  {grid.dates.map((date) => (
                    <td key={date} className="num mono">{fmt(row.byDate[date] ?? 0)}</td>
                  ))}
                  <td className="num mono rp__total">{fmt(row.totalM3)}</td>
                  <td className="num mono">{fmt(row.costSar)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="rp__sticky">Total</td>
                {grid.dates.map((date) => (
                  <td key={date} className="num mono">{fmt(grid.totalsByDate[date])}</td>
                ))}
                <td className="num mono">{fmt(k.totalDeliveredM3)}</td>
                <td className="num mono">{fmt(k.totalVariableOmCost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}

function BindingList({ constraints, inline = false }) {
  if (!constraints.length) return <span className="rp__sub">None recorded.</span>;
  return (
    <ul className={`rp__binding ${inline ? "rp__binding--inline" : ""}`.trim()}>
      {constraints.map((c) => (
        <li key={`${c.kind}-${c.id}`}>
          <span className={`rp__chip rp__chip--${c.kind}`}>{KIND_LABEL[c.kind] || c.kind}</span>
          <span>{c.label}</span>
          {c.capacity != null && (
            <span className="rp__sub mono">{fmt(c.flow)} / {fmt(c.capacity)} m³</span>
          )}
        </li>
      ))}
    </ul>
  );
}

const KIND_LABEL = { plant_supply: "Plant", pipe: "Pipe", pump: "Pump station", gate_intake: "Gate intake" };
