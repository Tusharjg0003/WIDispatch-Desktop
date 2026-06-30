import React, { useEffect, useState } from "react";
import { fetchQuality } from "../api/metrics";

const nf = new Intl.NumberFormat("en-US");
const fmtNum = (v) => (v == null ? "—" : nf.format(v));
const fmtDT = (iso) => (iso ? iso.slice(0, 16).replace("T", " ") : "—");

function ComplianceFlag({ flag }) {
  if (!flag) return "—";
  const good = flag === "within_spec";
  const label = flag.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return <span className={`q-flag ${good ? "q-flag--ok" : "q-flag--bad"}`}>{label}</span>;
}

// Renders below the production dashboard, sharing its date/plant filters.
export default function QualitySection({ filters }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchQuality(filters)
      .then((d) => !cancelled && setRows(d))
      .catch(() => !cancelled && setError(true));
    return () => { cancelled = true; };
  }, [filters.from, filters.to, filters.plant]);

  return (
    <section className="sheet" style={{ marginTop: 22 }}>
      <header className="sheet__head sheet__head--simple">
        <h2 className="sheet__name sheet__name--sm">
          Quality
          <span className="sheet__count">{rows.length}</span>
        </h2>
      </header>
      <div className="sheet__table-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th>Plant</th>
              <th>Handover Point</th>
              <th>Sampled</th>
              <th className="num">Residual Cl (mg/L)</th>
              <th className="num">Turbidity (NTU)</th>
              <th className="num">Conductivity (µS/cm)</th>
              <th>Compliance</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {error ? (
              <tr><td colSpan={8} className="ledger__empty">Couldn't load quality records.</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="ledger__empty">No approved quality samples for this range.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.plantName}</td>
                  <td>{r.handoverPointName || "—"}</td>
                  <td className="mono">{fmtDT(r.sampledAt)}</td>
                  <td className="num mono">{fmtNum(r.residualChlorine)}</td>
                  <td className="num mono">{fmtNum(r.turbidity)}</td>
                  <td className="num mono">{fmtNum(r.conductivity)}</td>
                  <td><ComplianceFlag flag={r.complianceFlag} /></td>
                  <td className="notes">{r.comments || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
