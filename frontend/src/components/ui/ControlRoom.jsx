import React from "react";
import { Search } from "lucide-react";

/* ============================================================
   Shared "Control Room" design primitives: React wrappers over the
   .cr-* classes in styles/control-room.css. Port of WIDispatch-Production
   components/shared/design-ui.tsx. Presentational only.
   ============================================================ */

const cx = (...parts) => parts.filter(Boolean).join(" ");

export function Page({ children, fill = false, className, ...rest }) {
  return (
    <div className={cx("cr-page", fill && "cr-page--fill", className)} {...rest}>
      {children}
    </div>
  );
}

export function PageHead({ kick, title, subtitle, actions }) {
  return (
    <div className="cr-page-head">
      <div style={{ minWidth: 0 }}>
        {kick && <div className="cr-kick">{kick}</div>}
        {title && <h1 className="cr-title">{title}</h1>}
        {subtitle && <p className="cr-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="cr-row" style={{ alignItems: "center", flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

export function TableCard({ children, fill = false, className, style }) {
  return (
    <div className={cx("cr-card", fill && "cr-card--fill", className)} style={style}>
      {children}
    </div>
  );
}

export function CardToolbar({ children, className }) {
  return <div className={cx("cr-card-toolbar", className)}>{children}</div>;
}

export function SectionTitle({ children, className }) {
  return <h3 className={cx("cr-section-title", className)}>{children}</h3>;
}

export function SearchBox({ value, onChange, placeholder, maxWidth = 340, ...rest }) {
  return (
    <div className="cr-search" style={{ maxWidth }}>
      <Search strokeWidth={2} aria-hidden="true" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={rest["aria-label"] || placeholder}
        {...rest}
      />
    </div>
  );
}

export function Count({ children }) {
  return <span className="cr-count">{children}</span>;
}

/** options: [{ value, label, icon? }] */
export function SegmentedToggle({ value, onChange, options, ariaLabel }) {
  return (
    <div className="cr-segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={active ? "is-active" : undefined}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {Icon && <Icon size={11} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** items: [{ label, value, unit?, note?, tone?: "ok"|"warn"|"err"|"acc" }] */
export function KpiStrip({ items, className }) {
  return (
    <div className={cx("cr-kpi-strip", className)}>
      {items.map((item, index) => (
        <div key={item.label ?? index} className={cx("cr-kpi", item.tone && `cr-kpi--${item.tone}`)} title={item.title}>
          <div className="cr-kpi__label">{item.label}</div>
          <div className="cr-kpi__value">
            {item.value}
            {item.unit && <span className="cr-kpi__unit">{item.unit}</span>}
          </div>
          {item.note != null && <div className="cr-kpi__note">{item.note}</div>}
        </div>
      ))}
    </div>
  );
}

export function Pill({ tone = "chip", children, title, className }) {
  return (
    <span className={cx("cr-pill", `cr-pill--${tone}`, className)} title={title}>
      {children}
    </span>
  );
}

const STATUS_TONES = {
  operational: "ok",
  active: "ok",
  online: "ok",
  running: "ok",
  approved: "ok",
  ok: "ok",
  healthy: "ok",
  maintenance: "warn",
  warning: "warn",
  degraded: "warn",
  planned: "acc",
  submitted: "acc",
  standby: "acc",
  offline: "err",
  outage: "err",
  rejected: "err",
  critical: "err",
  failed: "err",
  error: "err",
  decommissioned: "chip",
  draft: "chip",
  inactive: "chip",
  revised: "purp",
  under_revision: "purp",
};

export function statusTone(status) {
  return STATUS_TONES[String(status || "").toLowerCase().replace(/[\s-]+/g, "_")] || "chip";
}

export function StatusBadge({ status, label }) {
  if (!status && !label) return null;
  const text = label || String(status).replace(/_/g, " ");
  return <Pill tone={statusTone(status)}>{text}</Pill>;
}

export function SubmissionBadge({ status }) {
  if (!status) return null;
  const labels = { under_revision: "Revised", revised: "Revised" };
  return <Pill tone={statusTone(status)}>{labels[status] || String(status).replace(/_/g, " ")}</Pill>;
}

export function Dot({ tone }) {
  return <span className={cx("cr-dot", tone && `cr-dot--${tone}`)} aria-hidden="true" />;
}

export function EmptyState({ title, children }) {
  return (
    <div className="cr-empty">
      {title && <strong>{title}</strong>}
      {children}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <div className="cr-field__label">{label}</div>
      <div className="cr-field__value">{children ?? "—"}</div>
    </div>
  );
}
