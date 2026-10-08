import React, { useMemo, useState } from "react";
import { KpiStrip, SegmentedToggle } from "../../components/ui/ControlRoom";
import { ASSET_CATEGORY_LABELS, buildAssetRows, buildPipeRows, summariseByCategory, yearOptions } from "../lib/canvasTable";
import { exportSheetsToXlsx, downloadBlob } from "../../lib/xlsxWriter";

const STATUSES = ["", "operational", "maintenance", "under_construction", "planned", "decommissioned", "inactive"];
const fmt = (v) => (v == null || v === "" ? "—" : Number(v).toLocaleString());
const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function EditableCell({ value, type = "text", readOnly, onCommit, align }) {
  const [draft, setDraft] = useState(null);
  if (readOnly) return <span>{type === "number" ? fmt(value) : value || "—"}</span>;
  const shown = draft ?? (value ?? "");
  return (
    <input
      className={`cr-input nb-table-input${align === "right" ? " nb-table-input--num" : ""}`}
      type={type}
      step={type === "number" ? "any" : undefined}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft != null && String(draft) !== String(value ?? "")) onCommit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

// View → Table (SWIIMS table view): editable Assets / Pipes grids, a type
// filter, a year filter driving the "In service" column and the KPIs, and
// Excel / CSV / PDF export.
export default function CanvasTableView({ cyRef, version, readOnly, networkName, onEditAsset, onEditPipe, onFocus }) {
  const [tab, setTab] = useState("assets");
  const [typeFilter, setTypeFilter] = useState("all");
  const [year, setYear] = useState(new Date().getFullYear());
  const [query, setQuery] = useState("");

  const { assets, pipes } = useMemo(() => {
    const cy = cyRef.current;
    if (!cy) return { assets: [], pipes: [] };
    const nodes = cy.nodes().map((n) => n.data());
    const labelById = Object.fromEntries(nodes.map((d) => [d.id, d.label || d.id]));
    return {
      assets: buildAssetRows(nodes, year),
      pipes: buildPipeRows(cy.edges().map((e) => e.data()), labelById, year),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cyRef, version, year]);

  const years = useMemo(() => yearOptions([...assets, ...pipes]), [assets, pipes]);
  const summary = useMemo(() => summariseByCategory(assets), [assets]);
  const types = useMemo(() => [...new Set(assets.map((a) => a.type))].sort(), [assets]);
  const q = query.trim().toLowerCase();
  const assetRows = assets.filter((a) => (typeFilter === "all" || a.type === typeFilter) && (!q || `${a.name} ${a.type} ${a.region}`.toLowerCase().includes(q)));
  const pipeRows = pipes.filter((p) => !q || `${p.name} ${p.from} ${p.to} ${p.material}`.toLowerCase().includes(q));

  const kpis = [
    { label: `Assets in service ${year}`, value: assets.filter((a) => a.type !== "node" && a.inService && a.active).length, note: `${assets.filter((a) => a.type !== "node").length} on canvas` },
    { label: `Pipes in service ${year}`, value: pipes.filter((p) => p.inService && p.active).length, note: `${pipes.length} on canvas` },
    ...summary.slice(0, 4).map((s) => ({ label: s.label, value: fmt(s.capacity), unit: "m³/d", note: `${s.inService}/${s.count} in service` })),
  ];

  const sheets = () => ({
    Assets: assets.map((a) => ({ Name: a.name, Type: ASSET_CATEGORY_LABELS[a.type] || a.type, Status: a.status, Region: a.region, "Capacity (m³/d)": a.capacity ?? "", Commissioning: a.commissioning, Decommissioning: a.decommissioning, [`In service ${year}`]: a.inService ? "Yes" : "No" })),
    Pipes: pipes.map((p) => ({ Name: p.name, From: p.from, To: p.to, "Capacity (m³/d)": p.capacity ?? "", "Length (km)": p.length ?? "", "Diameter (mm)": p.diameter ?? "", Material: p.material, Active: p.active ? "Yes" : "No", [`In service ${year}`]: p.inService ? "Yes" : "No" })),
    Summary: summary.map((s) => ({ Category: s.label, Count: s.count, [`In service ${year}`]: s.inService, "In-service capacity (m³/d)": s.capacity })),
  });
  const base = `${(networkName || "network").replace(/\s+/g, "_")}_tables_${year}`;

  const exportCsv = () => {
    const rows = sheets()[tab === "assets" ? "Assets" : "Pipes"];
    const cols = rows.length ? Object.keys(rows[0]) : [];
    const text = [cols.map(csvCell).join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
    downloadBlob(new Blob([text], { type: "text/csv" }), `${base}_${tab}.csv`);
  };
  const exportPdf = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const rows = sheets()[tab === "assets" ? "Assets" : "Pipes"];
    const cols = rows.length ? Object.keys(rows[0]) : [];
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const colW = (pageW - 60) / Math.max(1, cols.length);
    let y = 44;
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(0, 48, 87).text(`${networkName || "Network"} — ${tab === "assets" ? "Assets" : "Pipes"} (${year})`, 30, y);
    y += 22;
    const header = () => {
      doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(93, 127, 150);
      cols.forEach((c, i) => doc.text(String(c).slice(0, 22), 30 + i * colW, y));
      y += 12;
    };
    header();
    doc.setFont("helvetica", "normal").setTextColor(38, 81, 110);
    rows.forEach((r) => {
      if (y > pageH - 30) {
        doc.addPage();
        y = 40;
        header();
        doc.setFont("helvetica", "normal").setTextColor(38, 81, 110);
      }
      cols.forEach((c, i) => doc.text(String(r[c] ?? "").slice(0, 28), 30 + i * colW, y));
      y += 11;
    });
    doc.save(`${base}_${tab}.pdf`);
  };

  return (
    <div className="nb-table-view" onMouseDown={(e) => e.stopPropagation()}>
      <KpiStrip items={kpis} />
      <div className="cr-card cr-card--fill">
        <div className="cr-card-toolbar">
          <SegmentedToggle
            ariaLabel="Table"
            value={tab}
            onChange={setTab}
            options={[
              { value: "assets", label: `Assets (${assets.length})` },
              { value: "pipes", label: `Pipes (${pipes.length})` },
            ]}
          />
          <div className="cr-search" style={{ maxWidth: 240 }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter rows…" aria-label="Filter rows" onKeyDown={(e) => e.stopPropagation()} />
          </div>
          {tab === "assets" && (
            <select className="cr-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Asset type">
              <option value="all">All types</option>
              {types.map((t) => <option key={t} value={t}>{ASSET_CATEGORY_LABELS[t] || t}</option>)}
            </select>
          )}
          <select className="cr-select" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="In-service year">
            {years.map((y) => <option key={y} value={y}>In service {y}</option>)}
          </select>
          <span className="cr-spacer" />
          <button type="button" className="cr-btn cr-btn--sm" onClick={() => exportSheetsToXlsx(sheets(), base)}>Excel</button>
          <button type="button" className="cr-btn cr-btn--sm" onClick={exportCsv}>CSV</button>
          <button type="button" className="cr-btn cr-btn--sm" onClick={() => void exportPdf()}>PDF</button>
        </div>
        <div className="cr-card__body">
          {tab === "assets" ? (
            <table className="cr-table">
              <thead>
                <tr>
                  <th>Name</th><th>Type</th><th>Status</th><th>Region</th><th className="num">Capacity (m³/d)</th>
                  <th>Commissioning</th><th>Decommissioning</th><th>In service {year}</th><th />
                </tr>
              </thead>
              <tbody>
                {assetRows.map((a) => (
                  <tr key={a.id}>
                    <td><EditableCell value={a.name} readOnly={readOnly} onCommit={(v) => onEditAsset(a.id, { label: v })} /></td>
                    <td className="cr-td--muted">{ASSET_CATEGORY_LABELS[a.type] || a.type}</td>
                    <td>
                      {readOnly ? a.status || "—" : (
                        <select className="cr-select" value={a.status} onChange={(e) => onEditAsset(a.id, { status: e.target.value })} aria-label={`${a.name} status`}>
                          {STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace(/_/g, " ") : "auto"}</option>)}
                        </select>
                      )}
                    </td>
                    <td><EditableCell value={a.region} readOnly={readOnly} onCommit={(v) => onEditAsset(a.id, { region: v })} /></td>
                    <td className="num"><EditableCell type="number" align="right" value={a.capacity} readOnly={readOnly} onCommit={(v) => onEditAsset(a.id, { capacity: v })} /></td>
                    <td className="cr-td--mono">{a.commissioning || "—"}</td>
                    <td className="cr-td--mono">{a.decommissioning || "—"}</td>
                    <td><span className={`cr-pill cr-pill--${a.inService ? "ok" : "chip"}`}>{a.inService ? "Yes" : "No"}</span></td>
                    <td><button type="button" className="cr-link" onClick={() => onFocus(a.id)}>Show</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="cr-table">
              <thead>
                <tr>
                  <th>Name</th><th>From</th><th>To</th><th className="num">Capacity (m³/d)</th><th className="num">Length (km)</th>
                  <th className="num">Diameter (mm)</th><th>Material</th><th>Active</th><th>In service {year}</th><th />
                </tr>
              </thead>
              <tbody>
                {pipeRows.map((p) => (
                  <tr key={p.id}>
                    <td><EditableCell value={p.name} readOnly={readOnly} onCommit={(v) => onEditPipe(p.id, { label: v })} /></td>
                    <td className="cr-td--muted">{p.from}</td>
                    <td className="cr-td--muted">{p.to}</td>
                    <td className="num"><EditableCell type="number" align="right" value={p.capacity} readOnly={readOnly} onCommit={(v) => onEditPipe(p.id, { capacity: v })} /></td>
                    <td className="num"><EditableCell type="number" align="right" value={p.length} readOnly={readOnly} onCommit={(v) => onEditPipe(p.id, { pipelineLength: v })} /></td>
                    <td className="num"><EditableCell type="number" align="right" value={p.diameter} readOnly={readOnly} onCommit={(v) => onEditPipe(p.id, { pipelineDiameter: v })} /></td>
                    <td><EditableCell value={p.material} readOnly={readOnly} onCommit={(v) => onEditPipe(p.id, { pipelineMaterial: v })} /></td>
                    <td>
                      <input type="checkbox" checked={p.active} disabled={readOnly} onChange={(e) => onEditPipe(p.id, { active: e.target.checked })} aria-label={`${p.name} active`} />
                    </td>
                    <td><span className={`cr-pill cr-pill--${p.inService ? "ok" : "chip"}`}>{p.inService ? "Yes" : "No"}</span></td>
                    <td><button type="button" className="cr-link" onClick={() => onFocus(p.id)}>Show</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
