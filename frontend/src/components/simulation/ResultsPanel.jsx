import React, { useMemo, useState } from "react";
import { bottleneckSeries, causeLabel, summariseGates } from "../../lib/simulationRows";
import SimulationGraphGrid from "./SimulationGraphGrid";
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

  const gates = useMemo(() => summariseGates(plan.days), [plan.days]);
  const shortGates = gates.filter((g) => g.shortageM3 > 0);
  const bottleneckRows = useMemo(() => {
    const byDate = new Map((plan.days || []).map((day) => [day.date, day]));
    return bottleneckSeries(plan.days)
      .map((row) => ({ ...row, constraints: byDate.get(row.date)?.bindingConstraints || [] }))
      .filter((row) => row.shortage > 0 || row.constraints.length > 0);
  }, [plan.days]);

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
        <Kpi eyebrow="Production cost" value={fmt(k.totalVariableOmCost)} sub="SAR over the range" />
        <Kpi
          eyebrow="Variable O&M"
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

      <SimulationGraphGrid plan={plan} />

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

      {bottleneckRows.length > 0 && (
        <section className="sheet">
          <header className="sheet__head sheet__head--simple">
            <h2 className="sheet__name sheet__name--sm">
              Bottleneck Drivers<span className="sheet__count">{bottleneckRows.length}</span>
            </h2>
            <span className="rp__hint">Daily constraint counts from the solver.</span>
          </header>
          <div className="sheet__table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Shortfall</th>
                  <th className="num">Plant</th>
                  <th className="num">Pipe</th>
                  <th className="num">Pump</th>
                  <th className="num">Gate intake</th>
                  <th>Constraints</th>
                </tr>
              </thead>
              <tbody>
                {bottleneckRows.map((row) => (
                  <tr key={row.date}>
                    <td className="mono">{row.date}</td>
                    <td className={`num mono ${row.shortage > 0 ? "rp__bad" : ""}`.trim()}>
                      {row.shortage > 0 ? fmt(row.shortage) : "—"}
                    </td>
                    <td className="num mono">{row.plantSupply || "—"}</td>
                    <td className="num mono">{row.pipe || "—"}</td>
                    <td className="num mono">{row.pump || "—"}</td>
                    <td className="num mono">{row.gateIntake || "—"}</td>
                    <td><BindingList constraints={row.constraints} inline /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
