import React from "react";
import "./WorkspaceHeader.css";

const statusToneClass = {
  default: "workspace-header__badge--default",
  amber: "workspace-header__badge--amber",
  green: "workspace-header__badge--green",
  blue: "workspace-header__badge--blue",
  red: "workspace-header__badge--red",
};

export function WorkspaceHeaderButton({
  icon: Icon,
  children,
  className = "",
  tone = "default",
  type = "button",
  ...buttonProps
}) {
  return (
    <button
      type={type}
      className={`workspace-header-button workspace-header-button--${tone} ${className}`.trim()}
      {...buttonProps}
    >
      {Icon && <Icon size={14} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function WorkspaceHeaderChip({ children, tone = "default", className = "" }) {
  return (
    <span className={`workspace-header-chip workspace-header-chip--${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}

export default function WorkspaceHeader({
  title,
  subtitle,
  status,
  statusTone = "amber",
  icon: Icon,
  actions,
  className = "",
}) {
  const renderedActions = Array.isArray(actions) ? actions : actions ? [actions] : [];

  return (
    <div className={`workspace-header ${className}`.trim()}>
      <div className="workspace-header__row">
        <div className="workspace-header__main">
          <div className="workspace-header__title-row">
            <h1 className="workspace-header__title">
              {Icon && <Icon size={16} />}
              <span>{title}</span>
            </h1>
            {status && (
              <span className={`workspace-header__badge ${statusToneClass[statusTone] || statusToneClass.default}`}>
                {status}
              </span>
            )}
          </div>
          {subtitle && <p className="workspace-header__subtitle">{subtitle}</p>}
        </div>
        {renderedActions.length > 0 && (
          <div className="workspace-header__actions">
            {renderedActions.map((action, index) => (
              <React.Fragment key={index}>{action}</React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
