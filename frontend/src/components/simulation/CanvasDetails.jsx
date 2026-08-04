import React from "react";
import { edgeDetail, nodeDetail } from "../../lib/simulationCanvas";
import { causeLabel } from "../../lib/simulationRows";

const nf = new Intl.NumberFormat("en-US");
const fmt = (v) => (v == null ? "—" : nf.format(Math.round(v)));
const pct = (v) => (v == null ? "—" : `${Math.round(v)}%`);
const sar = (v) => (v == null ? "—" : `SAR ${nf.format(Math.round(v))}`);

const OM_SOURCE = {
  economics: "from Economics",
  plant_spec: "from the asset record",
  default: "default rate — none on record",
};

function Row({ label, value, tone = "" }) {
  return (
    <div className="simdetail__row">
      <span className="simdetail__label">{label}</span>
      <span className={`simdetail__value ${tone}`.trim()}>{value}</span>
    </div>
  );
}

function PipeDetail({ detail }) {
  if (!detail.inRun) {
    return <p className="simdetail__empty">This pipe was added after the run and carries no results.</p>;
  }
  return (
    <>
      <Row label="Flow" value={`${fmt(detail.flow)} m³`} />
      <Row label="Capacity" value={detail.unconstrained ? "No capacity on record" : `${fmt(detail.capacity)} m³`} />
      <Row label="Utilisation" value={pct(detail.utilisationPct)}
        tone={detail.utilisationPct >= 90 ? "simdetail__value--bad" : ""} />
      <Row label="Direction" value={detail.bidirectional ? "Bidirectional" : `${detail.source} → ${detail.target}`} />
      {detail.isBottleneck && <Row label="Status" value="Binding constraint today" tone="simdetail__value--bad" />}
      <hr className="simdetail__rule" />
      <Row label="Peak flow (horizon)" value={`${fmt(detail.peakFlow)} m³`} />
      <Row label="Average flow" value={`${fmt(detail.avgFlow)} m³`} />
      <Row label="Peak utilisation" value={pct(detail.peakUtilisationPct)} />
    </>
  );
}

function PlantDetail({ detail }) {
  return (
    <>
      <Row label="Allocated" value={`${fmt(detail.allocated)} m³`} />
      <Row label="Available" value={`${fmt(detail.available)} m³`} />
      <Row label="Contracted" value={`${fmt(detail.base)} m³`} />
      {detail.maintenanceLoss > 0 && <Row label="Maintenance loss" value={`−${fmt(detail.maintenanceLoss)} m³`} />}
      {detail.outageLoss > 0 && <Row label="Outage loss" value={`−${fmt(detail.outageLoss)} m³`} />}
      <hr className="simdetail__rule" />
      <Row label="Variable O&M" value={`SAR ${detail.variableOm}/m³`} />
      <Row label="Source" value={OM_SOURCE[detail.variableOmSource] || "—"}
        tone={detail.variableOmSource === "default" ? "simdetail__value--warn" : ""} />
      <Row label="Cost today" value={sar(detail.costSar)} />
      {detail.noCapacity && (
        <p className="simdetail__note simdetail__note--warn">
          No contracted or design capacity on record, so this plant could not be dispatched.
        </p>
      )}
      {detail.overridden && <p className="simdetail__note">Carries a per-run override.</p>}
    </>
  );
}

function GateDetail({ detail }) {
  return (
    <>
      <Row label="Required" value={`${fmt(detail.required)} m³`} />
      <Row label="Delivered" value={`${fmt(detail.delivered)} m³`} />
      <Row label="Shortage" value={`${fmt(detail.shortage)} m³`}
        tone={detail.shortage > 0 ? "simdetail__value--bad" : ""} />
      {detail.shortage > 0 && <Row label="Cause" value={causeLabel(detail.cause)} />}
      {detail.intakeLimited && <p className="simdetail__note">The gate's own intake capacity capped this request.</p>}
      {detail.overridden && <p className="simdetail__note">Carries a per-run override.</p>}
    </>
  );
}

function PumpDetail({ detail }) {
  return (
    <>
      <Row label="Design capacity" value={`${fmt(detail.base)} m³`} />
      <Row label="Limit today" value={detail.unconstrained ? "No capacity on record" : `${fmt(detail.limit)} m³`} />
      {detail.maintenanceLoss > 0 && <Row label="Maintenance loss" value={`−${fmt(detail.maintenanceLoss)} m³`} />}
      {detail.outageLoss > 0 && <Row label="Outage loss" value={`−${fmt(detail.outageLoss)} m³`} />}
      {detail.fullOutage && <Row label="Status" value="Offline" tone="simdetail__value--bad" />}
      {detail.isBinding && <Row label="Status" value="Binding constraint today" tone="simdetail__value--bad" />}
    </>
  );
}

function TraceDetail({ traceInfo, onFocus }) {
  return (
    <>
      <Row label="Mode" value={traceInfo.mode === "delivered" ? "Delivered flow" : "Reachable topology"} />
      <Row label="Upstream" value={`${traceInfo.upCount} node(s)`} />
      <Row label="Downstream" value={`${traceInfo.downCount} node(s)`} />
      {traceInfo.requestedMode === "delivered" && !traceInfo.hasFlow && (
        <p className="simdetail__note">No flow on this day — showing reachable topology instead.</p>
      )}
      {["sources", "dests"].map((key) => (
        <div key={key}>
          <h4 className="simdetail__subhead">{key === "sources" ? "Direct sources" : "Direct destinations"}</h4>
          {traceInfo[key].length === 0 && <p className="simdetail__empty">None.</p>}
          {traceInfo[key].map((n) => (
            <button key={n.id} type="button" className="simdetail__link" onClick={() => onFocus(n.id)}>
              {n.name}
              <span>{fmt(n.flow)} m³</span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

function DaySummary({ plan, dayIdx, onFocus }) {
  const day = plan.days[dayIdx];
  const shortGates = (day.gates || []).filter((g) => g.shortage > 0);
  return (
    <>
      <Row label="Required" value={`${fmt(day.totalRequired)} m³`} />
      <Row label="Delivered" value={`${fmt(day.totalDelivered)} m³`} />
      <Row label="Shortage" value={`${fmt(day.totalShortage)} m³`}
        tone={day.totalShortage > 0 ? "simdetail__value--bad" : ""} />
      <Row label="Variable O&M" value={sar(day.variableOmCost)} />

      <h4 className="simdetail__subhead">Binding constraints</h4>
      {day.bindingConstraints.length === 0 && <p className="simdetail__empty">Nothing was binding today.</p>}
      {day.bindingConstraints.map((c) => (
        <button key={`${c.kind}-${c.id}`} type="button" className="simdetail__link" onClick={() => onFocus(c.id)}>
          {c.label}
          <span>{c.capacity == null ? "unlimited" : `${fmt(c.flow)} / ${fmt(c.capacity)}`}</span>
        </button>
      ))}

      <h4 className="simdetail__subhead">Gates short</h4>
      {shortGates.length === 0 && <p className="simdetail__empty">All gates served.</p>}
      {shortGates.map((g) => (
        <button key={g.nodeId} type="button" className="simdetail__link" onClick={() => onFocus(g.nodeId)}>
          {g.name}
          <span>{fmt(g.shortage)} m³ short</span>
        </button>
      ))}
    </>
  );
}

export default function CanvasDetails({ plan, dayIdx, selectedId, selectedKind, traceInfo, onFocus }) {
  if (traceInfo) {
    return (
      <aside className="simdetail">
        <header className="simdetail__head">
          <span className="simdetail__eyebrow">Trace</span>
          <h3>{traceInfo.rootName}</h3>
        </header>
        <TraceDetail traceInfo={traceInfo} onFocus={onFocus} />
      </aside>
    );
  }

  if (!selectedId) {
    return (
      <aside className="simdetail">
        <header className="simdetail__head">
          <span className="simdetail__eyebrow">{plan.days[dayIdx]?.date}</span>
          <h3>Day summary</h3>
        </header>
        <DaySummary plan={plan} dayIdx={dayIdx} onFocus={onFocus} />
      </aside>
    );
  }

  if (selectedKind === "edge") {
    const detail = edgeDetail(plan, dayIdx, selectedId);
    return (
      <aside className="simdetail">
        <header className="simdetail__head">
          <span className="simdetail__eyebrow">Pipe</span>
          <h3>{detail?.label || selectedId}</h3>
        </header>
        {detail && <PipeDetail detail={detail} />}
      </aside>
    );
  }

  const detail = nodeDetail(plan, dayIdx, selectedId);
  if (!detail || !detail.inRun) {
    return (
      <aside className="simdetail">
        <header className="simdetail__head"><h3>Not part of this run</h3></header>
        <p className="simdetail__empty">
          This element carries no results — it is either a junction or was added after the run.
        </p>
      </aside>
    );
  }

  const EYEBROW = { plant: "Plant", pump: "Pump station", gate: "City gate" };
  return (
    <aside className="simdetail">
      <header className="simdetail__head">
        <span className="simdetail__eyebrow">{EYEBROW[detail.kind]}</span>
        <h3>{detail.name}</h3>
      </header>
      {detail.kind === "plant" && <PlantDetail detail={detail} />}
      {detail.kind === "gate" && <GateDetail detail={detail} />}
      {detail.kind === "pump" && <PumpDetail detail={detail} />}
    </aside>
  );
}
