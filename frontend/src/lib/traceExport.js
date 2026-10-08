// Traceability export — Excel + PDF (port of SWIIMS utils/traceExport.js).
// Fed the same trace-info objects the trace panel renders (see
// cytoscape/multiTrace.js buildTraceInfo).

import { traceEndpointSections } from "../cytoscape/multiTrace.js";
import { exportSheetsToXlsx } from "./xlsxWriter.js";

const fmtFlow = (v) => {
  const n = Number(v) || 0;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
};

const dirLabel = (direction) => (direction === "both" ? "upstream + downstream" : direction || "—");

/** Flatten trace infos into three named sheets. */
export function traceInfosToSheets(traceInfos) {
  const summary = [];
  const endpoints = [];
  const connections = [];
  (traceInfos || []).forEach((info) => {
    summary.push({
      Root: info.rootName,
      Type: info.rootType,
      Direction: dirLabel(info.direction),
      "Upstream nodes": info.upCount,
      "Downstream nodes": info.downCount,
      Mode: info.mode,
    });
    traceEndpointSections(info).forEach((section) => {
      section.rows.forEach((row) => {
        endpoints.push({ Root: info.rootName, "Root type": info.rootType, Relation: section.label, Endpoint: row.name });
      });
    });
    (info.sources || []).forEach((s) => {
      connections.push({ Root: info.rootName, Direction: "Comes from", Neighbour: s.name, "Flow (m³/d)": info.hasFlow ? Math.round(Number(s.flow) || 0) : "" });
    });
    (info.dests || []).forEach((d) => {
      connections.push({ Root: info.rootName, Direction: "Goes to", Neighbour: d.name, "Flow (m³/d)": info.hasFlow ? Math.round(Number(d.flow) || 0) : "" });
    });
  });
  return { "Trace Summary": summary, Endpoints: endpoints, Connections: connections };
}

export function exportTraceExcel(traceInfos, filename = "traceability") {
  return exportSheetsToXlsx(traceInfosToSheets(traceInfos), filename);
}

/** A4 text PDF (selectable text, automatic page breaks). meta: { title, subtitle, filename } */
export async function exportTracePDF(traceInfos, meta = {}) {
  const { title = "Traceability report", subtitle = "", filename = "traceability" } = meta;
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const bottom = pageH - 40;
  let y = 48;
  const ensure = (needed) => {
    if (y + needed > bottom) {
      doc.addPage();
      y = 48;
    }
  };
  const line = (text, { size = 10, style = "normal", color = [40, 40, 40], indent = 0, gap = 4 } = {}) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    doc.splitTextToSize(String(text), pageW - marginX * 2 - indent).forEach((w) => {
      ensure(size + gap);
      doc.text(w, marginX + indent, y);
      y += size + gap;
    });
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 48, 87);
  doc.text(title, marginX, y);
  y += 22;
  const stamp = new Date().toLocaleString();
  line(subtitle ? `${subtitle} · Generated ${stamp}` : `Generated ${stamp}`, { size: 9, color: [93, 127, 150], gap: 8 });

  if (!traceInfos || traceInfos.length === 0) {
    line("No traces to report.", { size: 11, color: [150, 150, 150] });
    doc.save(`${filename}.pdf`);
    return;
  }

  traceInfos.forEach((info, idx) => {
    ensure(40);
    if (idx > 0) y += 6;
    doc.setDrawColor(210, 224, 234);
    doc.line(marginX, y, pageW - marginX, y);
    y += 14;
    line(info.rootName, { size: 12, style: "bold", color: [0, 48, 87], gap: 3 });
    line(`${info.rootType} · ${dirLabel(info.direction)} · ${info.upCount} upstream · ${info.downCount} downstream · ${info.mode}`, { size: 9, color: [93, 127, 150], gap: 8 });
    traceEndpointSections(info).forEach((section) => {
      line(`${section.label} (${section.rows.length})`, { size: 10, style: "bold", color: section.direction === "upstream" ? [29, 79, 145] : [86, 127, 0], gap: 3 });
      if (section.rows.length === 0) line("— none —", { size: 9, color: [160, 160, 160], indent: 10 });
      else section.rows.forEach((row) => line(`• ${row.name}`, { size: 9, color: [38, 81, 110], indent: 10, gap: 2 }));
      y += 4;
    });
    if (info.direction !== "downstream") {
      line(`Comes from (${info.sources.length})`, { size: 10, style: "bold", color: [29, 79, 145], gap: 3 });
      if (!info.sources.length) line("— no direct source —", { size: 9, color: [160, 160, 160], indent: 10 });
      else info.sources.forEach((s) => line(`• ${s.name}${info.hasFlow ? `   ${fmtFlow(s.flow)} m³/d` : ""}`, { size: 9, color: [38, 81, 110], indent: 10, gap: 2 }));
      y += 4;
    }
    if (info.direction !== "upstream") {
      line(`Goes to (${info.dests.length})`, { size: 10, style: "bold", color: [86, 127, 0], gap: 3 });
      if (!info.dests.length) line("— no direct destination —", { size: 9, color: [160, 160, 160], indent: 10 });
      else info.dests.forEach((d) => line(`• ${d.name}${info.hasFlow ? `   ${fmtFlow(d.flow)} m³/d` : ""}`, { size: 9, color: [38, 81, 110], indent: 10, gap: 2 }));
      y += 4;
    }
  });
  doc.save(`${filename}.pdf`);
}
