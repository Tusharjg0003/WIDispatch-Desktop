import React, { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Check, CheckCircle2, Clock3, Download, TriangleAlert, Wrench, X } from "lucide-react";
import RecordKpis from "./RecordKpis";
import { updateMaintenanceDesktopApproval } from "../../api/production";
import { buildMaintenanceRows, filterMaintenanceByStatus, computeMaintenanceStats, maintenanceDurationHours, maintenanceRowsToCsv } from "../../lib/maintenanceRecords";
import "./MaintenanceRecordList.css";
import "./ProductionInputTable.css";

const fmtDT = (v) => { if (!v) return "N/A"; const d = parseISO(v); return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm"); };
const fmtShort = (v) => { if (!v) return "—"; const d = parseISO(v); return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM dd, HH:mm"); };
const num = (v) => (v == null ? "—" : Number(v).toLocaleString());
const humanStatus = (v) => (v ? String(v).replaceAll("_", " ") : "pending");
const desktopStatus = (r) => r.desktop_approval_status || r.desktop_decision_status || r.desktop_approval || "pending";
const desktopApprovedAt = (r) => r.desktop_approved_at || r.desktop_decision_at || null;

export default function MaintenanceRecordList({ plantId, bundle, readOnly = false, hideDesktopApproval = false }) {
  const { maintenanceRecords, users } = bundle;
  const showActions = !readOnly;
  const emptyColSpan = (hideDesktopApproval ? 10 : 12) + (showActions ? 1 : 0);
  const [localRecords, setLocalRecords] = useState(maintenanceRecords);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("all");
  const [pendingApprovals, setPendingApprovals] = useState({});
  const [approvalError, setApprovalError] = useState("");

  useEffect(() => {
    setLocalRecords(maintenanceRecords);
  }, [maintenanceRecords]);

  const resolveUserName = (ref) => {
    if (!ref) return "N/A";
    const u = users.find((x) => x.id === ref || x.email === ref);
    return u?.name || u?.email || ref;
  };

  const rows = useMemo(() => filterMaintenanceByStatus(
    buildMaintenanceRows(localRecords, plantId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59`) : undefined,
    }), status,
  ), [localRecords, plantId, startDate, endDate, status]);

  const stats = useMemo(() => computeMaintenanceStats(rows), [rows]);

  const setDesktopApproval = async (record, nextStatus) => {
    if (!record.id) return;
    setApprovalError("");
    setPendingApprovals((current) => ({ ...current, [record.id]: nextStatus }));

    const now = new Date().toISOString();
    const previousRecords = localRecords;
    setLocalRecords((current) => current.map((r) => (
      r.id === record.id
        ? { ...r, desktop_approval_status: nextStatus, desktop_approved_at: now }
        : r
    )));

    try {
      const updated = await updateMaintenanceDesktopApproval(record.id, nextStatus);
      setLocalRecords((current) => current.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setLocalRecords(previousRecords);
      setApprovalError(err.message || "Failed to update desktop approval.");
    } finally {
      setPendingApprovals((current) => {
        const { [record.id]: _done, ...rest } = current;
        return rest;
      });
    }
  };

  const exportCsv = () => {
    const csv = maintenanceRowsToCsv(rows, resolveUserName);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `maintenance-records-${format(new Date(), "yyyy-MM-dd")}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mrl">
      <RecordKpis
        items={[
          { label: "Total", value: stats.total, icon: Wrench, tone: "neutral", sub: "Records in range" },
          { label: "Pending", value: stats.pending, icon: Clock3, tone: stats.pending > 0 ? "warn" : "neutral", sub: "Awaiting approval" },
          { label: "Approved", value: stats.approved, icon: CheckCircle2, tone: "ok", sub: "On the website" },
          { label: "Expected loss", value: Math.round(stats.totalImpact).toLocaleString(), unit: "m³", icon: TriangleAlert, tone: stats.totalImpact > 0 ? "err" : "neutral" },
        ]}
      />

      <section className="prod-card">
      <div className="prod-filters">
        <label>Start Date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>End Date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option><option value="draft">Draft</option><option value="submitted">Submitted</option>
            <option value="under_revision">Under Revision</option><option value="revised">Revised</option>
            <option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select>
        </label>
        <button type="button" className="prod-btn" onClick={exportCsv} disabled={rows.length === 0}><Download size={14} /> Export CSV</button>
      </div>

      <div className="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th>Description</th><th>Start</th><th>End</th><th className="ta-r">Duration</th>
              <th className="ta-r">Expected Loss</th><th className="ta-r">Actual Impact</th><th>Status</th>
              <th>Responsible User</th><th>Submitted At</th><th>Website Approved At</th>
              {!hideDesktopApproval && <th>Desktop Approval</th>}
              {!hideDesktopApproval && <th>Desktop Approved At</th>}
              {showActions && <th className="mrl__sticky">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i}>
                <td className="mrl__desc">{r.description}</td>
                <td className="nowrap">{fmtShort(r.start_datetime)}</td>
                <td className="nowrap">{fmtShort(r.end_datetime)}</td>
                <td className="ta-r mono">{maintenanceDurationHours(r.start_datetime, r.end_datetime)}h</td>
                <td className="ta-r mono">{num(r.expected_impact_m3)}{r.expected_impact_m3 != null ? " m³" : ""}</td>
                <td className="ta-r mono">{r.actual_impact_m3 != null ? `${num(r.actual_impact_m3)} m³` : "-"}</td>
                <td>
                  <span className={`prod-badge prod-badge--${r.submission_status}`}>
                    {humanStatus(r.submission_status)}
                  </span>
                </td>
                <td className="nowrap muted">{resolveUserName(r.submitted_by || r.approved_by)}</td>
                <td className="nowrap">{fmtDT(r.submitted_at || r.created_at)}</td>
                <td className="nowrap">{fmtDT(r.approved_at)}</td>
                {!hideDesktopApproval && <td><span className={`prod-badge prod-badge--${desktopStatus(r)}`}>{humanStatus(desktopStatus(r))}</span></td>}
                {!hideDesktopApproval && <td className="nowrap">{fmtDT(desktopApprovedAt(r))}</td>}
                {showActions && (
                  <td className="mrl__sticky">
                    <div className="mrl__actions" role="group" aria-label={`Desktop approval for ${r.description || "this record"}`}>
                      <button
                        type="button"
                        className={`mrl__approval-btn mrl__approval-btn--accept${desktopStatus(r) === "approved" ? " is-on" : ""}`}
                        aria-pressed={desktopStatus(r) === "approved"}
                        onClick={() => setDesktopApproval(r, "approved")}
                        disabled={!r.id || !!pendingApprovals[r.id] || desktopStatus(r) === "approved"}
                      >
                        <Check size={13} /> Accept
                      </button>
                      <button
                        type="button"
                        className={`mrl__approval-btn mrl__approval-btn--reject${desktopStatus(r) === "rejected" ? " is-on" : ""}`}
                        aria-pressed={desktopStatus(r) === "rejected"}
                        onClick={() => setDesktopApproval(r, "rejected")}
                        disabled={!r.id || !!pendingApprovals[r.id] || desktopStatus(r) === "rejected"}
                      >
                        <X size={13} /> Reject
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={emptyColSpan} className="empty">No maintenance records match the filters.</td></tr>}
          </tbody>
        </table>
      </div>
      </section>
      {showActions && approvalError && (
        <div className="mrl__error" role="alert"><TriangleAlert size={14} aria-hidden="true" /><span>{approvalError}</span></div>
      )}
    </div>
  );
}
