import React from "react";
import { ChevronRight, CircleAlert, CircleCheck, Info, ListChecks, RotateCw, TriangleAlert } from "lucide-react";
import "./RightPanels.css";

// Right panel → Validation: run the network check and walk its findings.
// Same build as the Details card / legend: header tile, stat tiles, bordered
// list. Rows that point at a canvas element zoom to it.

const SEVERITY = {
  error: { label: "Error", icon: CircleAlert, tone: "err" },
  warning: { label: "Warning", icon: TriangleAlert, tone: "warn" },
  info: { label: "Note", icon: Info, tone: "acc" },
  success: { label: "Passed", icon: CircleCheck, tone: "ok" },
};

export default function ValidationPanel({ issues = [], counts = {}, onValidate, onFocus }) {
  const hasRun = issues.length > 0;
  const problems = issues.filter((issue) => issue.severity !== "success");
  const passed = hasRun && problems.length === 0;
  const summary = !hasRun
    ? "Check the canvas for disconnected assets, missing capacities and other problems."
    : passed
    ? "No problems found on the canvas."
    : `${problems.length} finding${problems.length === 1 ? "" : "s"} to review.`;

  return (
    <div className="rp">
      <header className="rp-head">
        <span className="rp-head__icon" aria-hidden="true"><ListChecks size={17} /></span>
        <div className="rp-head__titles">
          <span className="rp-head__eyebrow">Network check</span>
          <h3 className="rp-head__title">Validation</h3>
          <span className="rp-head__subtitle">{summary}</span>
        </div>
      </header>
      <div className="rp-actions">
        <button type="button" className="rp-btn rp-btn--primary" onClick={onValidate}>
          {hasRun ? <RotateCw size={13} aria-hidden="true" /> : <ListChecks size={13} aria-hidden="true" />}
          {hasRun ? "Run again" : "Validate"}
        </button>
      </div>

      {hasRun && (
        <div className="rp-stats" role="list" aria-label="Validation summary">
          {[
            { key: "error", value: counts.error || 0, label: ["Error", "Errors"] },
            { key: "warning", value: counts.warning || 0, label: ["Warning", "Warnings"] },
            { key: "info", value: counts.info || 0, label: ["Note", "Notes"] },
          ].map(({ key, value, label }) => (
            <div key={key} role="listitem" className={`rp-stat rp-stat--${SEVERITY[key].tone}${value ? "" : " is-zero"}`}>
              <span className="rp-stat__value">{value}</span>
              <span className="rp-stat__label">{value === 1 ? label[0] : label[1]}</span>
            </div>
          ))}
        </div>
      )}

      {!hasRun ? (
        <div className="rp-empty">
          <ListChecks size={20} aria-hidden="true" />
          <span>No results yet. Run a check to see issues here.</span>
        </div>
      ) : passed ? (
        <div className="rp-empty rp-empty--ok">
          <CircleCheck size={20} aria-hidden="true" />
          <span>Everything checks out.</span>
        </div>
      ) : (
        <section className="rp-section">
          <div className="rp-section__head">
            <h4 className="rp-section__title">Findings</h4>
            <span className="rp-count">{problems.length}</span>
          </div>
          <ul className="rp-list">
            {problems.map((issue) => {
              const meta = SEVERITY[issue.severity] || SEVERITY.warning;
              const Icon = meta.icon;
              const clickable = Boolean(issue.elementId);
              return (
                <li key={issue.id}>
                  <button
                    type="button"
                    className={`rp-row${clickable ? "" : " is-static"}`}
                    onClick={() => clickable && onFocus(issue.elementId)}
                    disabled={!clickable}
                    title={clickable ? "Zoom to it on the canvas" : undefined}
                  >
                    <span className={`rp-tile rp-tile--${meta.tone}`} aria-hidden="true"><Icon size={14} /></span>
                    <span className="rp-row__text">
                      <span className="rp-row__name">{issue.title}</span>
                      {issue.detail && <span className="rp-row__sub rp-row__sub--wrap">{issue.detail}</span>}
                    </span>
                    {clickable && <ChevronRight size={14} className="rp-row__go" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
