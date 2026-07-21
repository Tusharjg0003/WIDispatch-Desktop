import React, { useEffect, useMemo, useState } from "react";
import { format, parseISO, startOfDay, subDays } from "date-fns";
import { Check, Download, X } from "lucide-react";
import { buildProductionRows, filterRows, computeTotals } from "../../lib/productionRows";
import { demandRowsToCsv, demandDesktopStatus, demandApprovedDemand } from "../../lib/demandRows";
import { updateDemandDesktopApproval } from "../../api/demand";
import "../production/ProductionInputTable.css"; // shared prod-* table/badge/kpi/filter classes
import "../production/MaintenanceRecordList.css"; // shared mrl__ action-button classes
import "./DemandInputTable.css";

const num = (v) => Math.round(v).toLocaleString();
const isoInput = (d) => format(d, "yyyy-MM-dd");
const humanStatus = (v) => (v ? String(v).replaceAll("_", " ") : "pending");

export default function DemandInputTable({ cityGate, cityGateId, bundle }) {
  const { demandInputs, maintenanceRecords, outages, contractedCapacities, users } = bundle;

  const [localInputs, setLocalInputs] = useState(demandInputs);
  const [startDate, setStartDate] = useState(startOfDay(subDays(new Date(), 30)));
  const [endDate, setEndDate] = useState(startOfDay(new Date()));
  const [requestedStatus, setRequestedStatus] = useState("all");
  const [pendingApprovals, setPendingApprovals] = useState({});
  const [approvalError, setApprovalError] = useState("");

  useEffect(() => { setLocalInputs(demandInputs); }, [demandInputs]);

  const resolveUserName = (ref) => {
    if (!ref) return "N/A";
    const u = users.find((x) => x.id === ref || x.email === ref);
    return u?.name || u?.email || ref;
  };
  const fmtDateTime = (v) => {
    if (!v) return "N/A";
    const d = parseISO(v);
    return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm");
  };

  // Reuse the production per-day engine: it walks every day in [start, end]
  // and carries required_m3 as `requested`, plus the raw record as `input`.
  const rows = useMemo(
    () => buildProductionRows({
      plant: cityGate, plantId: cityGateId, productionInputs: localInputs,
      maintenanceRecords, outages, contractedCapacities, startDate, endDate,
    }),
    [cityGate, cityGateId, localInputs, maintenanceRecords, outages, contractedCapacities, startDate, endDate],
  );
  const visibleRows = useMemo(() => filterRows(rows, { deliveredStatus: "all", requestedStatus }), [rows, requestedStatus]);
  const totals = useMemo(() => computeTotals(visibleRows), [visibleRows]);
  const requiredTotal = useMemo(() => visibleRows.reduce((s, r) => s + (r.requested ?? 0), 0), [visibleRows]);

  const setDesktopApproval = async (input, nextStatus) => {
    if (!input?.id) return;
    setApprovalError("");
    setPendingApprovals((current) => ({ ...current, [input.id]: nextStatus }));

    const now = new Date().toISOString();
    const previous = localInputs;
    setLocalInputs((current) => current.map((r) => (
      r.id === input.id ? { ...r, desktop_approval_status: nextStatus, desktop_approved_at: now } : r
    )));

    try {
      const updated = await updateDemandDesktopApproval(input.id, nextStatus);
      setLocalInputs((current) => current.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setLocalInputs(previous);
      setApprovalError(err.message || "Failed to update desktop approval.");
    } finally {
      setPendingApprovals((current) => {
        const { [input.id]: _done, ...rest } = current;
        return rest;
      });
    }
  };

  const exportToCSV = () => {
    const csv = demandRowsToCsv(visibleRows, resolveUserName);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `demand-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="prod-input">
      <div className="prod-strip">
        {[
          ["Contracted (m³)", num(totals.contracted), ""],
          ["Available (m³)", num(totals.available), "prod-kpi--blue"],
          ["Required (m³)", num(requiredTotal), "prod-kpi--green"],
          ["Total Loss (m³)", num(totals.loss), "prod-kpi--red"],
          ["Avg Availability", `${totals.availabilityPct.toFixed(0)}%`, ""],
        ].map(([label, value, tone]) => (
          <div className="prod-strip-cell" key={label}>
            <div className="prod-kpi-label">{label}</div>
            <div className={`prod-kpi-value ${tone}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="prod-filters">
        <label>Start Date
          <input type="date" value={isoInput(startDate)} onChange={(e) => e.target.value && setStartDate(startOfDay(parseISO(e.target.value)))} />
        </label>
        <label>End Date
          <input type="date" value={isoInput(endDate)} onChange={(e) => e.target.value && setEndDate(startOfDay(parseISO(e.target.value)))} />
        </label>
        <label>Required Status
          <select value={requestedStatus} onChange={(e) => setRequestedStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="allocated">Allocated</option>
            <option value="pending">Pending</option>
          </select>
        </label>
        <button type="button" className="prod-btn" onClick={exportToCSV} disabled={visibleRows.length === 0}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th>Date</th><th className="ta-r">Contracted</th><th className="ta-r">Maint. Loss</th>
              <th className="ta-r">Outage Loss</th><th className="ta-r">Variance</th><th className="ta-r">Available Capacity</th>
              <th className="ta-r">Required Demand</th><th className="ta-r">Approved Demand</th>
              <th>Responsible User</th><th>Submitted At</th><th>Website Approved At</th>
              <th>Desktop Approval</th><th>Desktop Approved At</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const input = r.input;
              const desktop = demandDesktopStatus(input);
              const approved = demandApprovedDemand(r);
              const busy = input?.id ? !!pendingApprovals[input.id] : false;
              return (
                <tr key={r.iso}>
                  <td className="nowrap">{format(parseISO(r.iso), "EEE, MMM dd")}</td>
                  <td className="ta-r mono">{num(r.contracted)}</td>
                  <td className="ta-r mono">{r.maintenanceLoss > 0 ? num(r.maintenanceLoss) : "—"}</td>
                  <td className="ta-r mono">{r.outageLoss > 0 ? num(r.outageLoss) : "—"}</td>
                  <td className="ta-r mono"><span className={r.variance > 0 ? "neg" : ""}>{r.variance > 0 ? `-${num(r.variance)}` : "0"}</span></td>
                  <td className="ta-r mono">{num(r.available)}</td>
                  <td className="ta-r mono">{r.requested != null ? num(r.requested) : <span className="muted">Pending</span>}</td>
                  <td className="ta-r mono">{approved != null ? num(approved) : <span className="muted">{input ? "Pending" : "—"}</span>}</td>
                  <td className="nowrap muted">{resolveUserName(r.responsibleUser)}</td>
                  <td className="nowrap">{fmtDateTime(r.submittedAt)}</td>
                  <td className="nowrap">{fmtDateTime(r.approvedAt)}</td>
                  <td>{desktop ? <span className={`prod-badge prod-badge--${desktop}`}>{humanStatus(desktop)}</span> : "—"}</td>
                  <td className="nowrap">{input ? fmtDateTime(input.desktop_approved_at) : "—"}</td>
                  <td>
                    {input?.id ? (
                      <div className="mrl__actions">
                        <button
                          type="button"
                          className="mrl__approval-btn mrl__approval-btn--accept"
                          onClick={() => setDesktopApproval(input, "approved")}
                          disabled={busy || desktop === "approved"}
                        >
                          <Check size={13} /> Accept
                        </button>
                        <button
                          type="button"
                          className="mrl__approval-btn mrl__approval-btn--reject"
                          onClick={() => setDesktopApproval(input, "rejected")}
                          disabled={busy || desktop === "rejected"}
                        >
                          <X size={13} /> Reject
                        </button>
                      </div>
                    ) : <span className="muted">—</span>}
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr><td colSpan={14} className="empty">No days match the selected range/filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {approvalError && <div className="mrl__error">{approvalError}</div>}
      <div className="prod-caption">
        {visibleRows.length === 0 ? "No days match the selected range/filters." : `Showing ${visibleRows.length} day${visibleRows.length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}
