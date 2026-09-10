import React from "react";
import { ChevronDown } from "lucide-react";
import "./CompactSection.css";

/**
 * Compact progressive-disclosure region for supporting information.
 * It intentionally uses native details/summary semantics and starts closed.
 */
export default function CompactSection({
  title,
  summary,
  children,
  defaultOpen = false,
  className = "",
}) {
  return (
    <details className={`compact-section ${className}`.trim()} open={defaultOpen || undefined}>
      <summary>
        <span className="compact-section__label">{title}</span>
        {summary && <span className="compact-section__summary">{summary}</span>}
        <ChevronDown className="compact-section__chevron" size={13} aria-hidden="true" />
      </summary>
      <div className="compact-section__content">{children}</div>
    </details>
  );
}
