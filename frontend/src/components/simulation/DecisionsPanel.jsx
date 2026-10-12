import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CalendarClock, Check, ChevronRight, CircleCheck, Download, MessageSquareText, Send, X,
} from "lucide-react";
import { allocationGrid, allocationsToCsv, groupDemandVerdicts } from "../../lib/simulationRows";
import { downloadCsv } from "../../lib/exportCsv";
// Cards, pills and table chrome are shared with the Results tab.
import "./ResultsPanel.css";
import "./DecisionsPanel.css";

// The three decisions the desktop hands back to the portals, and the single
// action that persists them. Nothing here writes until Publish is pressed —
// pressing Run only produces a draft. Rejections and revisions need an
// operator comment (the server refuses to publish without one), entered in an
// inline editor under the row.

const nf = new Intl.NumberFormat("en-US");
const fmt = (v) => (v == null ? "—" : nf.format(Math.round(v)));

const STATUS = {
  approved: { label: "Approved", tone: "ok", Icon: Check },
  adjusted: { label: "Revised", tone: "warn", Icon: AlertTriangle },
  postponed: { label: "Postponed", tone: "warn", Icon: CalendarClock },
  rejected: { label: "Rejected", tone: "err", Icon: X },
  shortfall: { label: "Shortfall", tone: "err", Icon: X },
};
const ORDER = ["approved", "adjusted", "postponed", "rejected", "shortfall"];

const maintenanceApproved = (v) => v.decision ?? v.status === "approved";

function StatusPill({ status }) {
  const { label, tone, Icon } = STATUS[status] || { label: status, tone: "", Icon: AlertTriangle };
  return (
    <span className={`rp-pill dp-pill--${tone}`}>
      <Icon size={11} aria-hidden="true" />
      {label}
    </span>
  );
}

function Tally({ verdicts }) {
  const counts = verdicts.reduce((acc, v) => {
    acc[v.status] = (acc[v.status] || 0) + 1;
    return acc;
  }, {});
  return (
    <span className="dp-tally">
      {ORDER.filter((s) => counts[s]).map((s) => (
        <span key={s} className={`rp-pill dp-pill--${STATUS[s].tone}`}>{counts[s]} {STATUS[s].label.toLowerCase()}</span>
      ))}
    </span>
  );
}

/**
 * Approve / Reject segmented control. `approved` may be null for a partial
 * demand revision (some but not all of the volume) — neither side is lit.
 */
function DecisionSwitch({ approved, onChange, disabled, label }) {
  const yes = approved === true;
  const no = approved === false;
  return (
    <span className="dp-seg" role="group" aria-label={label} onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`dp-seg__btn dp-seg__btn--yes${yes ? " is-on" : ""}`}
        aria-pressed={yes} disabled={disabled} onClick={() => !yes && onChange(true)} title="Approve in full">
        <Check size={13} aria-hidden="true" /> Approve
      </button>
      <button type="button" className={`dp-seg__btn dp-seg__btn--no${no ? " is-on" : ""}`}
        aria-pressed={no} disabled={disabled} onClick={() => !no && onChange(false)} title="Reject (needs a comment)">
        <X size={13} aria-hidden="true" /> Reject
      </button>
    </span>
  );
}

function DemandVolumeEditor({ row, disabled, onCommit }) {
  const [value, setValue] = useState(row.approved);
  useEffect(() => setValue(row.approved), [row.approved]);
  return (
    <span className={`dp-volume${Number(row.approved) < Number(row.required) ? " dp-volume--cut" : ""}`} title={Number(row.approved) < Number(row.required) ? `Cut from ${fmt(row.required)} m³` : undefined}>
      <input type="number" min="0" max={row.required} value={value} disabled={disabled}
        aria-label={`Approved volume on ${row.date}`}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        onBlur={async () => {
          if (Number(value) === row.approved) return;
          if (!(await onCommit(value))) setValue(row.approved);
        }} />
      <span>m³</span>
    </span>
  );
}

/** Comment button shown on a rejected / revised row: the saved comment, or a required prompt. */
function CommentChip({ comment, disabled, onClick }) {
  return (
    <button type="button" className={`dp-comment${comment ? "" : " dp-comment--required"}`} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }} title={comment ? "Edit comment" : "A comment is required before publishing"}>
      <MessageSquareText size={12} aria-hidden="true" />
      <span>{comment || "Add comment (required)"}</span>
    </button>
  );
}

/** Inline editor row for a required operator comment. */
function CommentEditor({ editor, onCancel, onSubmit }) {
  const [text, setText] = useState(editor.text || "");
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
  };
  return (
    <div className="dp-editor" onClick={(e) => e.stopPropagation()}>
      <label className="dp-editor__label" htmlFor="dp-editor-text">
        <MessageSquareText size={13} aria-hidden="true" />
        {editor.title}
      </label>
      <textarea
        id="dp-editor-text"
        ref={ref}
        rows={2}
        value={text}
        placeholder="Explain the decision for the portal team (required)"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
        }}
      />
      <div className="dp-editor__actions">
        <span className="dp-editor__hint">Ctrl + Enter to save · Esc to cancel</span>
        <button type="button" className="scp-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="scp-btn scp-btn--primary" onClick={submit} disabled={!text.trim()}>
          Save comment
        </button>
      </div>
    </div>
  );
}

function Card({ title, count, aside, children }) {
  return (
    <section className="rp-card" aria-label={title}>
      <header className="rp-card__head">
        <h3 className="rp-card__title">{title}</h3>
        {count != null && <span className="rp-card__count">{count}</span>}
        {aside && <span className="rp-card__aside">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

export default function DecisionsPanel({ plan, onPublish, publishing, publishError, published, onDecisionSave }) {
  const [expanded, setExpanded] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const [editError, setEditError] = useState(null);
  // { key, title, text, submit(text) => Promise<boolean>, cancel() }
  const [editor, setEditor] = useState(null);
  const maintenance = plan.maintenanceVerdicts || [];
  const demandVerdicts = plan.demandVerdicts || [];
  const demandByGate = useMemo(() => groupDemandVerdicts(demandVerdicts), [demandVerdicts]);
  const grid = useMemo(() => allocationGrid(plan), [plan]);

  const allocationCount = (plan.plantAllocations || []).length;
  const isPublished = Boolean(published) || plan.status === "published";

  // What the server will refuse to publish: crosses / revisions without a comment.
  const missing = useMemo(() => {
    const m = maintenance.filter((v) => !maintenanceApproved(v) && !String(v.operatorComment || "").trim());
    const d = demandVerdicts.filter((v) => v.approved < v.required && !String(v.operatorComment || "").trim());
    return { maintenance: m.length, demand: d.length, total: m.length + d.length };
  }, [maintenance, demandVerdicts]);

  const save = async (key, payload) => {
    setSavingKey(key);
    setEditError(null);
    try { await onDecisionSave(payload); return true; }
    catch (error) { setEditError(error.message); return false; }
    finally { setSavingKey(null); }
  };

  const closeEditor = () => {
    editor?.cancel?.();
    setEditor(null);
  };

  const askComment = (key, title, text) => new Promise((resolve) => {
    editor?.cancel?.();
    setEditor({
      key,
      title,
      text,
      submit: (comment) => resolve(comment),
      cancel: () => resolve(null),
    });
  });

  const changeMaintenance = async (row, decision) => {
    const key = `m:${row.recordId}`;
    if (decision) {
      closeEditor();
      return save(key, { maintenanceVerdicts: [{ recordId: row.recordId, decision: true, operatorComment: "" }] });
    }
    const comment = await askComment(key, `Why is maintenance on ${row.assetName} rejected?`, row.operatorComment);
    if (comment == null) return false;
    return save(key, { maintenanceVerdicts: [{ recordId: row.recordId, decision: false, operatorComment: comment }] });
  };

  const changeDemand = async (row, approved) => {
    const key = `d:${row.assetId}:${row.date}`;
    const value = Math.max(0, Math.min(row.required, Number(approved)));
    if (value >= row.required) {
      closeEditor();
      return save(key, { demandVerdicts: [{ assetId: row.assetId, date: row.date, approved: value, operatorComment: "" }] });
    }
    const comment = await askComment(
      key,
      `Why is ${row.gateName || row.assetId} on ${row.date} cut to ${fmt(value)} of ${fmt(row.required)} m³?`,
      row.operatorComment,
    );
    if (comment == null) return false;
    return save(key, { demandVerdicts: [{ assetId: row.assetId, date: row.date, approved: value, operatorComment: comment }] });
  };

  const editorRow = (key, colSpan) => editor?.key === key && (
    <tr className="dp-editor-row">
      <td colSpan={colSpan}>
        <CommentEditor
          editor={editor}
          onCancel={closeEditor}
          onSubmit={(text) => {
            // Resolves askComment with the text; the caller then saves.
            const current = editor;
            setEditor(null);
            current.submit(text);
          }}
        />
      </td>
    </tr>
  );

  const toggle = (key) => setExpanded((cur) => (cur === key ? null : key));

  return (
    <div className="rp dp">
      {/* ── Publish ─────────────────────────────────────────────────────── */}
      <section className={`dp-publish${isPublished ? " dp-publish--done" : missing.total ? " dp-publish--blocked" : ""}`} aria-label="Publish">
        <span className="dp-publish__icon" aria-hidden="true">
          {isPublished ? <CircleCheck size={20} /> : <Send size={18} />}
        </span>
        <div className="dp-publish__copy">
          <span className="dp-publish__eyebrow">{isPublished ? "Published" : "Draft plan"}</span>
          <h2>{isPublished ? "Published to the portals" : "Publish these decisions"}</h2>
          <p>
            {isPublished
              ? "Production, Demand and Maintenance records now carry this plan's id."
              : "Nothing has been written yet. Publishing sends the following to the portals:"}
          </p>
          {!isPublished && (
            <div className="dp-publish__stats">
              <span className="rp-pill">{allocationCount} production allocation{allocationCount === 1 ? "" : "s"}</span>
              <span className="rp-pill">{demandVerdicts.length} demand decision{demandVerdicts.length === 1 ? "" : "s"}</span>
              <span className="rp-pill">{maintenance.length} maintenance decision{maintenance.length === 1 ? "" : "s"}</span>
            </div>
          )}
          {!isPublished && missing.total > 0 && (
            <p className="dp-publish__block">
              <AlertTriangle size={13} aria-hidden="true" />
              {missing.total} decision{missing.total === 1 ? " needs" : "s need"} a comment before publishing
              {missing.maintenance > 0 && missing.demand > 0
                ? ` (${missing.maintenance} maintenance, ${missing.demand} demand day${missing.demand === 1 ? "" : "s"})`
                : missing.maintenance > 0 ? " (maintenance)" : " (demand days)"}.
            </p>
          )}
        </div>
        <button type="button" className="scp-btn scp-btn--primary dp-publish__btn" onClick={onPublish}
          disabled={publishing || isPublished || Boolean(savingKey) || missing.total > 0}
          title={missing.total > 0 ? "Add the required comments first" : undefined}>
          {isPublished ? <CircleCheck size={14} aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
          {isPublished ? "Published" : publishing ? "Publishing…" : "Publish decisions"}
        </button>
      </section>

      {publishError && <div className="scp-banner scp-banner--err"><X size={14} aria-hidden="true" /><span>{publishError}</span></div>}
      {editError && <div className="scp-banner scp-banner--err"><X size={14} aria-hidden="true" /><span>{editError}</span></div>}

      {/* ── Maintenance ─────────────────────────────────────────────────── */}
      <div className="rp-group">
        <h2 className="rp-group__title">Decisions</h2>

        <Card title="Maintenance requests" count={maintenance.length} aside={<Tally verdicts={maintenance} />}>
          <div className="sheet__table-wrap">
            <table className="ledger rp-table">
              <thead>
                <tr>
                  <th className="rp-table__chev" aria-label="Expand" />
                  <th>Asset</th>
                  <th>Type</th>
                  <th>Window</th>
                  <th className="num">Shortage caused</th>
                  <th>Decision</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {maintenance.map((v) => {
                  const key = `m:${v.recordId}`;
                  const open = expanded === key;
                  const approved = maintenanceApproved(v);
                  const canOpen = v.affectedGates.length > 0;
                  return (
                    <React.Fragment key={v.recordId}>
                      <tr className={`${canOpen ? "rp__row--click" : ""}${open ? " is-open" : ""}`.trim() || undefined}
                        onClick={() => canOpen && toggle(key)} aria-expanded={canOpen ? open : undefined}>
                        <td className="rp-table__chev">{canOpen && <ChevronRight size={13} aria-hidden="true" />}</td>
                        <td>
                          <span className="rp__name">{v.assetName}</span>
                          <span className="rp__sub mono">{v.assetId}</span>
                        </td>
                        <td>{v.maintenanceType || "—"}</td>
                        <td className="mono">
                          {v.windowDays[0]}
                          {v.windowDays.length > 1 && ` → ${v.windowDays[v.windowDays.length - 1]}`}
                        </td>
                        <td className={`num mono${v.shortageCaused > 0 ? " rp__bad" : ""}`}>
                          {v.shortageCaused > 0 ? fmt(v.shortageCaused) : "—"}
                        </td>
                        <td>
                          <DecisionSwitch approved={approved} disabled={isPublished || savingKey === key}
                            onChange={(decision) => changeMaintenance(v, decision)} label={`Decision for ${v.assetName}`} />
                        </td>
                        <td className="dp-reason">
                          <span>{v.reason}</span>
                          {!approved && (
                            <CommentChip comment={v.operatorComment} disabled={isPublished}
                              onClick={() => changeMaintenance(v, false)} />
                          )}
                        </td>
                      </tr>
                      {editorRow(key, 7)}
                      {open && (
                        <tr className="rp__detail-row">
                          <td colSpan={7}>
                            <div className="rp__detail">
                              <h4>City gates this work would cut</h4>
                              <ul className="dp-gates">
                                {v.affectedGates.map((g) => (
                                  <li key={g.assetId}>
                                    <span>{g.name}</span>
                                    <span className="rp__bad mono">−{fmt(g.m3)} m³</span>
                                  </li>
                                ))}
                              </ul>
                              {v.suggestedWindow && (
                                <p className="dp-suggest">
                                  <CalendarClock size={13} aria-hidden="true" />
                                  Clear alternative window: <strong>{v.suggestedWindow.from}</strong>
                                  {v.suggestedWindow.to !== v.suggestedWindow.from && <> → <strong>{v.suggestedWindow.to}</strong></>}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {!maintenance.length && (
                  <tr><td colSpan={7} className="dp-empty">No maintenance requests awaiting a desktop decision in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── City gate demand ─────────────────────────────────────────── */}
        <Card title="City gate demand" count={demandByGate.length} aside={<Tally verdicts={demandByGate} />}>
          <div className="sheet__table-wrap">
            <table className="ledger rp-table">
              <thead>
                <tr>
                  <th className="rp-table__chev" aria-label="Expand" />
                  <th>City gate</th>
                  <th className="num">Requested</th>
                  <th className="num">Approved</th>
                  <th>Approved share</th>
                  <th className="num">Days revised</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {demandByGate.map((gate) => {
                  const gateKey = `gate:${gate.assetId}`;
                  const open = expanded === gateKey;
                  const share = gate.requiredM3 ? Math.round((gate.approvedM3 / gate.requiredM3) * 1000) / 10 : null;
                  return (
                    <React.Fragment key={gate.assetId}>
                      <tr className={`rp__row--click${open ? " is-open" : ""}`} onClick={() => toggle(gateKey)} aria-expanded={open}>
                        <td className="rp-table__chev"><ChevronRight size={13} aria-hidden="true" /></td>
                        <td>
                          <span className="rp__name">{gate.gateName}</span>
                          <span className="rp__sub mono">{gate.assetId}</span>
                        </td>
                        <td className="num mono">{fmt(gate.requiredM3)}</td>
                        <td className="num mono">{fmt(gate.approvedM3)}</td>
                        <td>
                          {share == null ? "—" : (
                            <span className={`rp-fill${share < 100 ? " rp-fill--low" : ""}`}>
                              <span className="rp-fill__track"><span className="rp-fill__bar" style={{ width: `${Math.min(100, share)}%` }} /></span>
                              <span className="rp-fill__pct mono">{share}%</span>
                            </span>
                          )}
                        </td>
                        <td className="num mono">{gate.revisedDays || "—"}</td>
                        <td><StatusPill status={gate.status} /></td>
                      </tr>
                      {open && (
                        <tr className="rp__detail-row">
                          <td colSpan={7}>
                            <div className="dp-days-wrap">
                              <table className="ledger rp-table dp-days">
                                <thead>
                                  <tr><th>Date</th><th className="num">Requested</th><th>Approved</th><th>Decision</th><th>Comment</th></tr>
                                </thead>
                                <tbody>
                                  {gate.days.map((day) => {
                                    const key = `d:${day.assetId}:${day.date}`;
                                    const full = day.approved >= day.required;
                                    return (
                                      <React.Fragment key={day.date}>
                                        <tr className={full ? undefined : "dp-days__row--revised"}>
                                          <td className="mono">{day.date}</td>
                                          <td className="num mono">{fmt(day.required)}</td>
                                          <td>
                                            <DemandVolumeEditor row={day} disabled={isPublished || savingKey === key}
                                              onCommit={(value) => changeDemand(day, value)} />
                                          </td>
                                          <td>
                                            <DecisionSwitch approved={full ? true : Number(day.approved) === 0 ? false : null} disabled={isPublished || savingKey === key}
                                              label={`Decision for ${gate.gateName} on ${day.date}`}
                                              onChange={(checked) => changeDemand(day, checked ? day.required : 0)} />
                                          </td>
                                          <td className="dp-reason">
                                            {full ? <span className="rp__sub">—</span> : (
                                              <CommentChip comment={day.operatorComment} disabled={isPublished}
                                                onClick={() => changeDemand(day, day.approved)} />
                                            )}
                                          </td>
                                        </tr>
                                        {editorRow(key, 5)}
                                      </React.Fragment>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {!demandByGate.length && (
                  <tr><td colSpan={7} className="dp-empty">No approved demand in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ── Production allocation ─────────────────────────────────────── */}
      <div className="rp-group">
        <h2 className="rp-group__title">Production allocation</h2>
        <Card
          title="Daily allocation by plant"
          count={grid.rows.length}
          aside={(
            <button type="button" className="scp-btn dp-export"
              onClick={() => downloadCsv(`dispatch-allocation-${plan.from}-to-${plan.to}.csv`, allocationsToCsv(grid))}>
              <Download size={13} aria-hidden="true" /> Export CSV
            </button>
          )}
        >
          <div className="sheet__table-wrap">
            <table className="ledger rp-table dp-alloc">
              <thead>
                <tr>
                  <th className="dp-alloc__sticky">Plant</th>
                  {grid.dates.map((date) => <th key={date} className="num">{date.slice(5)}</th>)}
                  <th className="num dp-alloc__total">Total m³</th>
                  <th className="num">Cost (SAR)</th>
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row) => (
                  <tr key={row.assetId}>
                    <td className="dp-alloc__sticky">
                      <span className="rp__name">{row.name}</span>
                      <span className="rp__sub mono">{row.assetId}</span>
                    </td>
                    {grid.dates.map((date) => {
                      const v = row.byDate[date] ?? 0;
                      return <td key={date} className={`num mono${v ? "" : " dp-alloc__zero"}`}>{v ? fmt(v) : "0"}</td>;
                    })}
                    <td className="num mono dp-alloc__total">{fmt(row.totalM3)}</td>
                    <td className="num mono">{fmt(row.costSar)}</td>
                  </tr>
                ))}
                {!grid.rows.length && (
                  <tr><td colSpan={grid.dates.length + 3} className="dp-empty">No production allocation in this run.</td></tr>
                )}
              </tbody>
              {grid.rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td className="dp-alloc__sticky">Total</td>
                    {grid.dates.map((date) => (
                      <td key={date} className="num mono">{fmt(grid.totalsByDate[date])}</td>
                    ))}
                    <td className="num mono dp-alloc__total">{fmt(plan.kpis.totalDeliveredM3)}</td>
                    <td className="num mono">{fmt(plan.kpis.totalVariableOmCost)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
