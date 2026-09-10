import React from "react";
import { ArrowRight, Columns3, Inbox } from "lucide-react";
import { formatStatus, statusTone } from "../../lib/status";
import "./WorkspacePrimitives.css";

export function StatusBadge({ status, tone, children, className = "" }) {
  const label = children || formatStatus(status);
  return <span className={`ui-badge ui-badge--${tone || statusTone(status)} ${className}`.trim()}>{label}</span>;
}

export function PageHeader({ eyebrow, title, description, meta, actions, icon: Icon }) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header__identity">
        {Icon && <span className="ui-page-header__icon"><Icon size={18} /></span>}
        <div>
          {eyebrow && <p className="ui-page-header__eyebrow">{eyebrow}</p>}
          <div className="ui-page-header__title-row">
            <h1>{title}</h1>
            {meta}
          </div>
          {description && <p className="ui-page-header__description">{description}</p>}
        </div>
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
}

export function StatCard({ label, value, unit, detail, tone = "default", icon: Icon, trend }) {
  return (
    <article className={`ui-stat-card ui-stat-card--${tone}`}>
      <div className="ui-stat-card__head">
        <span>{label}</span>
        {Icon && <Icon size={16} aria-hidden="true" />}
      </div>
      <div className="ui-stat-card__value">{value}<small>{unit}</small></div>
      <div className="ui-stat-card__foot">
        <span>{detail}</span>
        {trend && <span className="ui-stat-card__trend">{trend}</span>}
      </div>
    </article>
  );
}

export function Notice({ tone = "info", title, children, action }) {
  return (
    <div className={`ui-notice ui-notice--${tone}`} role={tone === "critical" ? "alert" : "status"}>
      <div><strong>{title}</strong>{children && <p>{children}</p>}</div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children, action, icon: Icon = Inbox }) {
  return (
    <div className="ui-empty-state">
      <span className="ui-empty-state__icon"><Icon size={22} /></span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function SkeletonGrid({ cards = 4 }) {
  return (
    <div className="ui-skeleton-grid" role="status" aria-label="Loading dashboard">
      {Array.from({ length: cards }, (_, index) => <span key={index} className="ui-skeleton-card" />)}
    </div>
  );
}

export function InlineLink({ children, ...props }) {
  return <a className="ui-inline-link" {...props}>{children}<ArrowRight size={13} /></a>;
}

export function ColumnChooser({ columns, hiddenColumns, onToggle, label = "Table columns" }) {
  const visibleCount = columns.filter((column) => !hiddenColumns.has(column.key)).length;
  return (
    <details className="ui-column-chooser">
      <summary><Columns3 size={13} /><span>Columns</span><small>{visibleCount}/{columns.length}</small></summary>
      <div className="ui-column-chooser__menu" role="group" aria-label={label}>
        <strong>{label}</strong>
        {columns.map((column) => {
          const checked = !hiddenColumns.has(column.key);
          return (
            <label key={column.key}>
              <input type="checkbox" checked={checked} disabled={checked && visibleCount === 1} onChange={() => onToggle(column.key)} />
              <span>{column.label}</span>
            </label>
          );
        })}
      </div>
    </details>
  );
}
