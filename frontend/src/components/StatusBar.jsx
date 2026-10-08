import { useEffect } from "react";
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
 * actions: [{ id, label, title, onClick } | { id, type: "readout", label }],
 * leading / trailing: [{ id, label, title, icon, pressed, onClick }] }.
 */
export function useStatusItems(items) {
  const { setStatusItems } = useLayout();
  useEffect(() => {
    setStatusItems(items);
  }, [items, setStatusItems]);
  useEffect(() => () => setStatusItems(null), [setStatusItems]);
}

function Indicator({ label, value, tone = "neutral" }) {
  return (
    <span className="app-status-bar__item">
      <span className="app-status-bar__dot" style={{ background: TONE_VAR[tone] || tone }} aria-hidden="true" />
      {label}: <strong>{value}</strong>
    </span>
  );
}

// On/off button for a collapsible page region (sidebar, toolbar).
function PanelToggle({ label, title, icon, pressed, onClick }) {
  return (
    <button
      type="button"
      className={`app-status-bar__toggle${pressed ? " app-status-bar__toggle--on" : ""}`}
      aria-pressed={pressed}
      title={title || label}
      onClick={onClick}
    >
      {icon}
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
        <div className="app-status-bar__toggles">
          {leading.map((toggle) => <PanelToggle key={toggle.id} {...toggle} />)}
        </div>
      )}
      <div className="app-status-bar__left">
        {left.length > 0 ? (
          left.map((item) => <Indicator key={item.label} {...item} />)
        ) : (
          <>
            <Indicator label="Workspace" value={sectionFor(pathname)} tone="acc" />
            <Indicator label="Mode" value="Local workspace" tone="ok" />
          </>
        )}
      </div>
      <div className="app-status-bar__right">
        {actions.length > 0 && (
          <span className="app-status-bar__actions">
            {actions.map((action) =>
              action.type === "readout" ? (
                <span key={action.id} className="app-status-bar__readout">{action.label}</span>
              ) : (
                <button
                  key={action.id}
                  type="button"
                  className="app-status-bar__action"
                  onClick={action.onClick}
                  title={action.title}
                  aria-label={action.title || action.label}
                  disabled={action.disabled}
                >
                  {action.label}
                </button>
              )
            )}
          </span>
        )}
        {right.map((item) => (
          <span key={item.label}>
            {item.label}: <strong>{item.value}</strong>
          </span>
        ))}
        {right.length === 0 && <span>WIDispatch · Operator Workspace</span>}
        {trailing.length > 0 && (
          <span className="app-status-bar__toggles">
            {trailing.map((toggle) => <PanelToggle key={toggle.id} {...toggle} />)}
          </span>
        )}
      </div>
    </footer>
  );
}
