import React, { useMemo, useState } from "react";
import {
  Activity, Banknote, ChevronRight, CircleCheck, Coins, Cylinder, Factory, FlaskConical, Gauge, Info, MapPinned,
  Target, TriangleAlert, Waves,
} from "lucide-react";
import {
  bottleneckSeries, causeLabel, summariseGates, summarisePlants, summariseTanks,
} from "../../lib/simulationRows";
import { ENTITY_TYPE_COLORS } from "../../cytoscape/buildCyStyle";
import SimulationGraphGrid from "./SimulationGraphGrid";
import "./ResultsPanel.css";

// Results of one stored run, in the app's card language: outcome KPI cards
// (tinted icon tile, uppercase label, large value, meter where it is a share),
// a network summary card, grouped charts, then the tank / shortfall /
// bottleneck tables as cards with an uppercase header row.

const nf = new Intl.NumberFormat("en-US");
const fmt = (v) => (v == null ? "—" : nf.format(Math.round(v)));
const pct1 = (v) => (v == null ? "—" : String(Math.round(v * 10) / 10));
const compact = (v) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`;
  if (abs >= 1e4) return `${(v / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`;
  return nf.format(Math.round(v));
};

// Thresholds carried over from the WIPlan analytics panel so operators read
// the same colours they are used to.
const satisfactionTone = (pct) => (pct == null ? "neutral" : pct >= 80 ? "ok" : pct >= 50 ? "warn" : "err");
const utilisationTone = (pct) => (pct == null ? "neutral" : pct >= 90 ? "err" : pct >= 70 ? "warn" : "acc");

const KIND_LABEL = { plant_supply: "Plant", pipe: "Pipe", pump: "Pump station", gate_intake: "Gate intake" };

function Kpi({ label, value, unit, sub, icon: Icon, tone = "acc", meter }) {
  return (
    <section className={`rp-kpi rp-tone--${tone}`} aria-label={label}>
      <header className="rp-kpi__head">
        <span className="rp-kpi__icon" aria-hidden="true"><Icon size={15} /></span>
        <span className="rp-kpi__label">{label}</span>
      </header>
      <div className="rp-kpi__value">
        {value}
        {unit && <span className="rp-kpi__unit">{unit}</span>}
      </div>
      {meter != null && (
        <div className="rp-kpi__meter" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        </div>
      )}
      {sub && <span className="rp-kpi__sub">{sub}</span>}
    </section>
  );
}

function Card({ title, count, hint, aside, children, className = "" }) {
  return (
    <section className={`rp-card ${className}`.trim()} aria-label={title}>
      <header className="rp-card__head">
        <h3 className="rp-card__title">{title}</h3>
        {count != null && <span className="rp-card__count">{count}</span>}
        {hint && <span className="rp-card__hint">{hint}</span>}
        {aside && <span className="rp-card__aside">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

export function ResultsGroup({ title, children }) {
  return (
    <div className="rp-group">
      <h2 className="rp-group__title">{title}</h2>
      {children}
    </div>
  );
}

function BindingList({ constraints, inline = false }) {
  if (!constraints.length) return <span className="rp__sub">None recorded.</span>;
  return (
    <ul className={`rp__binding${inline ? " rp__binding--inline" : ""}`}>
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

function FillBar({ pct, minPct }) {
  if (pct == null) return <span className="rp__sub">—</span>;
  const low = minPct != null && pct < minPct;
  return (
    <span className={`rp-fill${low ? " rp-fill--low" : ""}`} title={minPct != null ? `Reserve ${minPct}%` : undefined}>
      <span className="rp-fill__track">
        <span className="rp-fill__bar" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        {minPct != null && <span className="rp-fill__min" style={{ left: `${Math.min(100, minPct)}%` }} />}
      </span>
      <span className="rp-fill__pct mono">{pct}%</span>
    </span>
  );
}

export default function ResultsPanel({ plan }) {
  const [expandedGate, setExpandedGate] = useState(null);
  const k = plan.kpis;

  const gates = useMemo(() => summariseGates(plan.days), [plan.days]);
  const tanks = useMemo(() => summariseTanks(plan.days), [plan.days]);
  const plants = useMemo(() => summarisePlants(plan.days), [plan.days]);
  const network = useMemo(() => {
    const desal = plants.filter((p) => p.kind === "desalination");
    const purif = plants.filter((p) => p.kind === "purification");
    const capOf = (rows) => rows.reduce((s, p) => s + (p.contracted || 0), 0);
    return {
      plants: plants.length,
      capacity: capOf(plants),
      desal: desal.length,
      desalCapacity: capOf(desal),
      purif: purif.length,
      purifCapacity: capOf(purif),
      tanks: tanks.length,
      tankCapacity: tanks.reduce((s, t) => s + (t.capacity || 0), 0),
      gates: gates.length,
    };
  }, [plants, tanks, gates]);
  const shortGates = gates.filter((g) => g.shortageM3 > 0);
  const bottleneckDays = (plan.days || []).filter((day) => day.totalShortage > 0 &&
    (day.bindingConstraints || []).some((constraint) => constraint.kind !== "plant_supply")).length;
  const bottleneckRows = useMemo(() => {
    const byDate = new Map((plan.days || []).map((day) => [day.date, day]));
    return bottleneckSeries(plan.days)
      .map((row) => ({ ...row, constraints: byDate.get(row.date)?.bindingConstraints || [] }))
      .filter((row) => row.shortage > 0);
  }, [plan.days]);

  const networkStats = [
    { label: "Plants", value: network.plants, sub: `${compact(network.capacity)} m³/d`, icon: Factory, colour: ENTITY_TYPE_COLORS.plant },
    { label: "Desalination", value: network.desal, sub: `${compact(network.desalCapacity)} m³/d`, icon: Waves, colour: ENTITY_TYPE_COLORS.plant },
    { label: "Purification", value: network.purif, sub: `${compact(network.purifCapacity)} m³/d`, icon: FlaskConical, colour: ENTITY_TYPE_COLORS.stp },
    { label: "Tanks", value: network.tanks, sub: `${compact(network.tankCapacity)} m³`, icon: Cylinder, colour: ENTITY_TYPE_COLORS.tank },
    { label: "City gates", value: network.gates, sub: "delivery points", icon: MapPinned, colour: ENTITY_TYPE_COLORS.handover_point },
    { label: "Avg daily demand", value: k.days ? compact(k.totalRequiredM3 / k.days) : "—", sub: "m³/d required", icon: Target, colour: "var(--acc)" },
  ];

  return (
    <div className="rp">
      <ResultsGroup title="Outcome">
        <div className="rp-kpis">
          <Kpi
            label="Demand satisfaction"
            icon={CircleCheck}
            value={pct1(k.satisfactionPct)}
            unit={k.satisfactionPct == null ? null : "%"}
            meter={k.satisfactionPct}
            sub={`${fmt(k.totalDeliveredM3)} of ${fmt(k.totalRequiredM3)} m³`}
            tone={satisfactionTone(k.satisfactionPct)}
          />
          <Kpi
            label="Shortfall"
            icon={TriangleAlert}
            value={compact(k.totalShortageM3)}
            unit="m³"
            sub={k.gatesShort ? `${k.gatesShort} gate${k.gatesShort === 1 ? "" : "s"} affected` : "All gates served"}
            tone={k.totalShortageM3 > 0 ? "err" : "ok"}
          />
          <Kpi
            label="Plant utilisation"
            icon={Gauge}
            value={pct1(k.plantUtilisationPct)}
            unit={k.plantUtilisationPct == null ? null : "%"}
            meter={k.plantUtilisationPct}
            sub="Of available capacity"
            tone={utilisationTone(k.plantUtilisationPct)}
          />
          <Kpi label="Production cost" icon={Banknote} value={compact(k.totalVariableOmCost)} unit="SAR" sub="Over the range" tone="acc" />
          <Kpi
            label="Variable O&M"
            icon={Coins}
            value={k.avgCostPerM3 == null ? "—" : k.avgCostPerM3.toFixed(2)}
            unit={k.avgCostPerM3 == null ? null : "SAR/m³"}
            sub="Per m³ delivered"
            tone="acc"
          />
          <Kpi
            label="Bottleneck days"
            icon={Activity}
            value={bottleneckDays}
            unit={`/ ${k.days}`}
            sub={bottleneckDays ? "Network-limited days" : "No network limits hit"}
            tone={bottleneckDays > 0 ? "warn" : "ok"}
          />
        </div>

        <Card title="Network" hint={`${plan.network?.name || "Network"} · ${plan.from} → ${plan.to}`}>
          <dl className="rp-net">
            {networkStats.map(({ label, value, sub, icon: Icon, colour }) => (
              <div key={label} className="rp-net__item" style={{ "--rp-tone": colour }}>
                <span className="rp-net__icon" aria-hidden="true"><Icon size={14} /></span>
                <div className="rp-net__text">
                  <dt>{label}</dt>
                  <dd><strong>{value}</strong><span>{sub}</span></dd>
                </div>
              </div>
            ))}
          </dl>
        </Card>
      </ResultsGroup>

      <SimulationGraphGrid plan={plan} />

      <ResultsGroup title="Details">
        {shortGates.length > 0 ? (
          <Card title="Shortfalls" count={shortGates.length} hint="Select a gate to see what bound it on its worst day.">
            <div className="sheet__table-wrap">
              <table className="ledger rp-table">
                <thead>
                  <tr>
                    <th className="rp-table__chev" aria-label="Expand" />
                    <th>City gate</th>
                    <th className="num">Required</th>
                    <th className="num">Deliverable</th>
                    <th className="num">Shortfall</th>
                    <th className="num">Short days</th>
                    <th>Cause</th>
                  </tr>
                </thead>
                <tbody>
                  {shortGates.map((gate) => {
                    const open = expandedGate === gate.nodeId;
                    return (
                      <React.Fragment key={gate.nodeId}>
                        <tr
                          className={`rp__row--click${open ? " is-open" : ""}`}
                          onClick={() => setExpandedGate(open ? null : gate.nodeId)}
                          aria-expanded={open}
                        >
                          <td className="rp-table__chev"><ChevronRight size={13} aria-hidden="true" /></td>
                          <td>
                            <span className="rp__name">{gate.name}</span>
                            <span className="rp__sub mono">{gate.assetId}</span>
                          </td>
                          <td className="num mono">{fmt(gate.requiredM3)}</td>
                          <td className="num mono">{fmt(gate.deliveredM3)}</td>
                          <td className="num mono rp__bad">{fmt(gate.shortageM3)}</td>
                          <td className="num mono">{gate.shortDays}</td>
                          <td><span className="rp-pill rp-pill--err">{causeLabel(gate.worstDay?.cause)}</span></td>
                        </tr>
                        {open && (
                          <tr className="rp__detail-row">
                            <td colSpan={7}>
                              <div className="rp__detail">
                                <h4>Binding constraints on the worst day ({gate.worstDay?.date})</h4>
                                <BindingList
                                  constraints={plan.days.find((d) => d.date === gate.worstDay?.date)?.bindingConstraints || []}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <div className="rp-allclear">
            <span className="rp-allclear__icon" aria-hidden="true"><CircleCheck size={16} /></span>
            <div>
              <strong>Every city gate is fully served</strong>
              <span>No shortfall on any day between {plan.from} and {plan.to}.</span>
            </div>
          </div>
        )}

        {bottleneckRows.length > 0 && (
          <Card title="Bottleneck drivers" count={bottleneckRows.length} hint="Short days and the constraints the solver hit on each.">
            <div className="sheet__table-wrap">
              <table className="ledger rp-table">
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
                      <td className={`num mono${row.shortage > 0 ? " rp__bad" : ""}`}>
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
          </Card>
        )}

        {tanks.length > 0 && (
          <Card title="Tank storage" count={tanks.length} hint="Inventory at the end of the horizon; the tick marks the reserve.">
            <div className="sheet__table-wrap">
              <table className="ledger rp-table">
                <thead>
                  <tr>
                    <th>Tank</th>
                    <th className="num">Capacity</th>
                    <th className="num">Start</th>
                    <th className="num">End</th>
                    <th>Fill at end</th>
                    <th className="num">Total inflow</th>
                    <th className="num">Total outflow</th>
                    <th>Reserve</th>
                  </tr>
                </thead>
                <tbody>
                  {tanks.map((tank) => (
                    <tr key={tank.nodeId}>
                      <td>
                        <span className="rp__name">{tank.name}</span>
                        <span className="rp__sub mono">{tank.assetId}</span>
                      </td>
                      <td className="num mono">{fmt(tank.capacity)}</td>
                      <td className="num mono">{fmt(tank.startLevel)}</td>
                      <td className="num mono">{fmt(tank.endLevel)}</td>
                      <td><FillBar pct={tank.fillPct} minPct={tank.minPct} /></td>
                      <td className="num mono">{fmt(tank.totalInflow)}</td>
                      <td className="num mono">{fmt(tank.totalOutflow)}</td>
                      <td>
                        <span className="rp-pill">{tank.minPct}% min</span>
                        {tank.strategic && <span className="rp-pill rp-pill--acc">Strategic</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </ResultsGroup>

      <p className="rp__note">
        <Info size={13} aria-hidden="true" />
        <span>
          Sectoral demand, per-point delivery cost and regional supply-by-source charts are not shown: the
          desktop dispatch works from approved records over a daily horizon and doesn&apos;t produce the demand
          scenarios or source-attribution series those charts need.
        </span>
      </p>
    </div>
  );
}
