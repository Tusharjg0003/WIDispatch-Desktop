import { isValidElement, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useLayout } from "../contexts/LayoutContext";

// Bottom status strip: port of WIDispatch-Production components/layout/
// status-bar.tsx. Pages publish dot-indicator metrics with useStatusItems();
// when none are published it falls back to the workspace / section label.
const SECTION_LABELS = {
  "/": "Operations",
  "/production": "Production",
  "/demand": "Demand",
  "/transmission": "Transmission",
  "/economics": "Economics",
  "/network-builder": "Network Builder",
  "/simulation-config": "Simulation Config",
  "/asset-registry": "Asset Registry",
};

function sectionFor(pathname) {
  if (pathname === "/") return SECTION_LABELS["/"];
  const match = Object.keys(SECTION_LABELS)
    .filter((path) => path !== "/" && pathname.startsWith(path))
    .sort((a, b) => b.length - a.length)[0];
  return match ? SECTION_LABELS[match] : "Workspace";
}

const TONE_VAR = {
  neutral: "var(--mut)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  err: "var(--err)",
  acc: "var(--acc)",
};

/**
 * Publish status-bar metrics for the current page. `items` should be memoised
 * by the caller: { left: [{ label, value, tone }], right: [{ label, value }],
 * actions: [{ id, label, title, onClick, icon?, group? } | { id, type: "readout", label, group? }],
 * leading / trailing: [{ id, label, title, icon, pressed, onClick }] }.
 * `left` items take an optional `pill: true` (rendered as a status pill);
 * `right` items an optional `icon`. Icons are lucide components.
 */
export function useStatusItems(items) {
  const { setStatusItems } = useLayout();
  useEffect(() => {
    setStatusItems(items);
  }, [items, setStatusItems]);
  useEffect(() => () => setStatusItems(null), [setStatusItems]);
}

function Indicator({ label, value, tone = "neutral", pill = false }) {
  const colour = TONE_VAR[tone] || tone;
  if (pill) {
    return (
      <span className="sb-pill" style={{ "--sb-tone": colour }} title={label}>
        <span className="sb-dot" aria-hidden="true" />
        {value}
      </span>
    );
  }
  return (
    <span className="sb-metric">
      <span className="sb-dot" style={{ background: colour }} aria-hidden="true" />
      <span className="sb-metric__label">{label}</span>
      <strong className="sb-metric__value">{value}</strong>
    </span>
  );
}

function Readout({ label, value, icon: Icon }) {
  return (
    <span className="sb-metric" title={`${label}: ${value}`}>
      {Icon && <Icon size={12} className="sb-metric__icon" aria-hidden="true" />}
      <span className="sb-metric__label">{label}</span>
      <strong className="sb-metric__value">{value}</strong>
    </span>
  );
}

function ActionButton({ action }) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      className={`sb-btn${Icon && !action.showLabel ? " sb-btn--icon" : ""}`}
      onClick={action.onClick}
      title={action.title}
      aria-label={action.title || action.label}
      disabled={action.disabled}
    >
      {Icon && <Icon size={12} aria-hidden="true" />}
      {(!Icon || action.showLabel) && <span>{action.label}</span>}
    </button>
  );
}

// Consecutive actions sharing a `group` render as one segmented control
// (e.g. zoom − 100% +); the rest stand alone.
function Actions({ actions }) {
  const blocks = [];
  actions.forEach((action) => {
    const last = blocks[blocks.length - 1];
    if (action.group && last && last.group === action.group) last.items.push(action);
    else blocks.push({ group: action.group, items: [action] });
  });
  return (
    <span className="sb-actions">
      {blocks.map((block, index) =>
        block.group ? (
          <span key={block.group} className="sb-segment" role="group" aria-label={block.group}>
            {block.items.map((action) =>
              action.type === "readout" ? (
                <span key={action.id} className="sb-segment__readout" aria-live="polite">{action.label}</span>
              ) : (
                <ActionButton key={action.id} action={action} />
              )
            )}
          </span>
        ) : (
          block.items.map((action) =>
            action.type === "readout" ? (
              <span key={action.id} className="sb-segment__readout">{action.label}</span>
            ) : (
              <ActionButton key={action.id || index} action={action} />
            )
          )
        )
      )}
    </span>
  );
}

// On/off button for a collapsible page region (sidebar, toolbar).
function PanelToggle({ label, title, icon, pressed, onClick }) {
  // `icon` is either a ready element or a component type (lucide icons are
  // forwardRef objects, so test for an element rather than a function).
  const Icon = icon && !isValidElement(icon) ? icon : null;
  return (
    <button
      type="button"
      className={`sb-toggle${pressed ? " is-on" : ""}`}
      aria-pressed={pressed}
      title={title || label}
      onClick={onClick}
    >
      {Icon ? <Icon size={13} aria-hidden="true" /> : icon}
      <span>{label}</span>
    </button>
  );
}

export default function StatusBar() {
  const { pathname } = useLocation();
  const { statusItems } = useLayout();
  const left = statusItems?.left ?? [];
  const right = statusItems?.right ?? [];
  const actions = statusItems?.actions ?? [];
  // Panel toggles pinned to the outer edges: `leading` before the left
  // metrics, `trailing` after the right ones.
  const leading = statusItems?.leading ?? [];
  const trailing = statusItems?.trailing ?? [];

  return (
    <footer className="app-status-bar" role="contentinfo">
      {leading.length > 0 && (
        <div className="sb-toggles">
          {leading.map((toggle) => <PanelToggle key={toggle.id} {...toggle} />)}
        </div>
      )}
      <div className="sb-left">
        {left.length > 0 ? (
          left.map((item) => <Indicator key={item.label} {...item} />)
        ) : (
          <>
            <Indicator label="Workspace" value={sectionFor(pathname)} tone="acc" />
            <Indicator label="Mode" value="Local workspace" tone="ok" />
          </>
        )}
      </div>
      <div className="sb-right">
        {actions.length > 0 && <Actions actions={actions} />}
        {right.map((item) => <Readout key={item.label} {...item} />)}
        {right.length === 0 && actions.length === 0 && <span className="sb-brand">WIDispatch · Operator Workspace</span>}
        {trailing.length > 0 && (
          <span className="sb-toggles">
            {trailing.map((toggle) => <PanelToggle key={toggle.id} {...toggle} />)}
          </span>
        )}
      </div>
    </footer>
  );
}
