import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import "./CanvasRibbon.css";

// Office-style ribbon for the network canvas: Home / Insert / Edit / View /
// Tools tabs, each a row of labelled groups. Pure renderer — the tab, group
// and command definitions (and the item shapes) live in ribbon/canvasRibbon.js.
//
// Every control gets a hover "screen tip" (name, shortcut, description) the
// way Office shows one; icon-only buttons rely on it for their name.

const TIP_DELAY_MS = 450;
const LARGE_ICON = 18;
const SMALL_ICON = 15;

// ── Shared hover tip ─────────────────────────────────────────────────────────
// One tip for the whole ribbon, positioned under the hovered control and
// rendered into <body> so the ribbon's scroll clipping can't cut it off.
function useScreenTip() {
  const [tip, setTip] = useState(null);
  const timerRef = useRef(null);

  const hide = useCallback(() => {
    clearTimeout(timerRef.current);
    setTip(null);
  }, []);

  const show = useCallback((event, item) => {
    clearTimeout(timerRef.current);
    const rect = event.currentTarget.getBoundingClientRect();
    timerRef.current = setTimeout(() => setTip({ item, rect }), TIP_DELAY_MS);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);
  return { tip, show, hide };
}

function ScreenTip({ tip }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(tip.rect.left, window.innerWidth - box.width - 8));
    setPos({ left, top: tip.rect.bottom + 6 });
  }, [tip]);

  if (!tip) return null;
  const { label, keys, tip: description } = tip.item;
  return createPortal(
    <div
      ref={ref}
      className="rb-tip"
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      <div className="rb-tip__head">
        <span className="rb-tip__name">{label}</span>
        {keys && <kbd className="rb-tip__keys">{keys}</kbd>}
      </div>
      {description && <div className="rb-tip__desc">{description}</div>}
    </div>,
    document.body
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────
const buttonClass = (item, size) =>
  [
    "rb-btn",
    `rb-btn--${size}`,
    item.iconOnly && size !== "large" ? "rb-btn--icon" : "",
    item.active ? "is-active" : "",
    item.primary ? "rb-btn--primary" : "",
    item.danger ? "rb-btn--danger" : "",
  ].filter(Boolean).join(" ");

function ButtonContent({ item, size, withChevron = false }) {
  const Icon = item.icon;
  const showLabel = size === "large" || !item.iconOnly || !Icon;
  // Large buttons carry their icon in a tinted tile, like the type tiles in
  // the side panels; small ones use the bare icon.
  const icon = Icon && <Icon size={size === "large" ? LARGE_ICON : SMALL_ICON} aria-hidden="true" className="rb-btn__icon" />;
  return (
    <>
      {icon && (size === "large" ? <span className="rb-btn__tile" style={item.colour ? { "--rb-tone": item.colour } : undefined} aria-hidden="true">{icon}</span> : icon)}
      {showLabel && <span className="rb-btn__label">{item.label}</span>}
      {withChevron && <ChevronDown size={11} aria-hidden="true" className="rb-btn__chevron" />}
    </>
  );
}

function RibbonButton({ item, size, tipHandlers }) {
  return (
    <button
      type="button"
      className={buttonClass(item, size)}
      onClick={item.onClick}
      disabled={item.disabled}
      aria-label={item.label}
      aria-pressed={item.active ? true : undefined}
      aria-keyshortcuts={item.keys}
      data-id={item.id}
      onMouseEnter={(e) => tipHandlers.show(e, item)}
      onMouseLeave={tipHandlers.hide}
      onFocus={(e) => tipHandlers.show(e, item)}
      onBlur={tipHandlers.hide}
    >
      <ButtonContent item={item} size={size} />
    </button>
  );
}

// Dropdown button. The list is rendered into <body> at a fixed position, so
// it can extend past the ribbon, and supports arrow keys / Enter / Esc.
function RibbonMenu({ item, size, tipHandlers }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const toggle = () => {
    tipHandlers.hide();
    if (open) return close();
    setRect(triggerRef.current.getBoundingClientRect());
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    listRef.current?.querySelector('[role="menuitemradio"], [role="menuitem"]')?.focus();
    const onDown = (event) => {
      if (!listRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) close();
    };
    const onScroll = () => close();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, close]);

  const onListKey = (event) => {
    const options = [...listRef.current.querySelectorAll("button")];
    const index = options.indexOf(document.activeElement);
    if (event.key === "ArrowDown") { event.preventDefault(); options[(index + 1) % options.length]?.focus(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); options[(index - 1 + options.length) % options.length]?.focus(); }
    else if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); close(true); }
  };

  const pick = (value) => {
    close(true);
    item.onSelect(value);
  };

  const checkable = item.value !== undefined;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${buttonClass({ ...item, active: item.active || open }, size)} rb-btn--menu`}
        onClick={toggle}
        disabled={item.disabled}
        aria-label={item.label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-id={item.id}
        onMouseEnter={(e) => !open && tipHandlers.show(e, item)}
        onMouseLeave={tipHandlers.hide}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) { e.preventDefault(); toggle(); }
        }}
      >
        <ButtonContent item={item} size={size} withChevron />
      </button>
      {open && rect && createPortal(
        <div
          ref={listRef}
          className="rb-menu"
          role="menu"
          aria-label={item.label}
          style={{ left: Math.max(8, Math.min(rect.left, window.innerWidth - 240)), top: rect.bottom + 4 }}
          onKeyDown={onListKey}
        >
          {item.options.map((option) => {
            const checked = checkable && option.value === item.value;
            return (
              <button
                key={option.value}
                type="button"
                role={checkable ? "menuitemradio" : "menuitem"}
                aria-checked={checkable ? checked : undefined}
                className={`rb-menu__item${checked ? " is-checked" : ""}`}
                onClick={() => pick(option.value)}
              >
                {checkable && <Check size={13} aria-hidden="true" className="rb-menu__check" />}
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

function RibbonCheck({ item, tipHandlers }) {
  return (
    <label
      className={`rb-check${item.disabled ? " is-disabled" : ""}`}
      data-id={item.id}
      onMouseEnter={(e) => tipHandlers.show(e, item)}
      onMouseLeave={tipHandlers.hide}
    >
      <input
        type="checkbox"
        checked={Boolean(item.checked)}
        disabled={item.disabled}
        onChange={() => item.onChange()}
        onFocus={(e) => tipHandlers.show({ currentTarget: e.currentTarget.parentElement }, item)}
        onBlur={tipHandlers.hide}
      />
      <span className="rb-check__box" aria-hidden="true"><Check size={10} strokeWidth={3} /></span>
      <span className="rb-check__label">{item.label}</span>
    </label>
  );
}

function RibbonControl({ item, size, tipHandlers }) {
  if (item.type === "menu") return <RibbonMenu item={item} size={size} tipHandlers={tipHandlers} />;
  if (item.type === "check") return <RibbonCheck item={item} tipHandlers={tipHandlers} />;
  return <RibbonButton item={item} size={size} tipHandlers={tipHandlers} />;
}

// ── Layout ───────────────────────────────────────────────────────────────────
// Drop absent commands, then empty rows, columns and groups, so a missing
// handler never leaves a gap.
function visibleColumns(group) {
  return (group.columns || [])
    .map((column) => {
      if (column.large !== undefined) return column.large ? column : null;
      const rows = (column.rows || []).map((row) => row.filter(Boolean)).filter((row) => row.length);
      return rows.length ? { rows } : null;
    })
    .filter(Boolean);
}

function RibbonGroup({ group, tipHandlers }) {
  const columns = visibleColumns(group);
  if (!columns.length) return null;
  return (
    <div className="rb-group" role="group" aria-label={group.label} data-group={group.id}>
      <div className="rb-group__content">
        {columns.map((column, index) =>
          column.large ? (
            <RibbonControl key={column.large.id} item={column.large} size="large" tipHandlers={tipHandlers} />
          ) : (
            <div className="rb-col" key={`col-${index}`}>
              {column.rows.map((row, rowIndex) => (
                <div className="rb-row" key={rowIndex}>
                  {row.map((item) => <RibbonControl key={item.id} item={item} size="small" tipHandlers={tipHandlers} />)}
                </div>
              ))}
            </div>
          )
        )}
      </div>
      <div className="rb-group__label">{group.label}</div>
    </div>
  );
}

// Chevron for the ribbon's collapse / expand button.
function CollapseChevron({ direction = "left", size = 12 }) {
  const rotate = { left: 0, up: 90, right: 180, down: 270 }[direction] ?? 0;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// `collapsed` hides the command area and leaves just the tab row, Office
// style; picking a tab while collapsed opens the ribbon again.
export default function CanvasRibbon({ tabs, activeTab, onTabChange, contextualGroups = [], collapsed = false, onToggleCollapsed = null }) {
  const tipHandlers = useScreenTip();
  const visibleTabs = tabs.filter((tab) => tab.groups.some((group) => visibleColumns(group).length));
  const current = visibleTabs.find((tab) => tab.id === activeTab) || visibleTabs[0];

  // A tip left open while the ribbon re-renders under it (tab switch,
  // collapse) would point at nothing.
  const { hide } = tipHandlers;
  useEffect(() => hide(), [current?.id, collapsed, hide]);

  return (
    <div className={`nb-ribbon${collapsed ? " nb-ribbon--collapsed" : ""}`}>
      <div className="nb-ribbon__tabs" role="tablist" aria-label="Canvas ribbon">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === current?.id}
            className={`nb-ribbon__tab${tab.id === current?.id ? " nb-ribbon__tab--active" : ""}`}
            onClick={() => {
              onTabChange(tab.id);
              if (collapsed) onToggleCollapsed?.();
            }}
          >
            {tab.label}
          </button>
        ))}
        {contextualGroups.length > 0 && (
          <span className="nb-ribbon__contextual-label">{contextualGroups[0].contextLabel || "Format"}</span>
        )}
        {onToggleCollapsed && (
          <button
            type="button"
            className="nb-collapse-btn nb-ribbon__collapse"
            onClick={onToggleCollapsed}
            title={collapsed ? "Show toolbar" : "Hide toolbar"}
            aria-label={collapsed ? "Show toolbar" : "Hide toolbar"}
            aria-expanded={!collapsed}
          >
            <CollapseChevron direction={collapsed ? "down" : "up"} />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="rb-body" role="tabpanel" aria-label={current?.label}>
          {current?.groups.map((group) => <RibbonGroup key={group.id} group={group} tipHandlers={tipHandlers} />)}
          {contextualGroups.map((group) => (
            <div className="rb-contextual" key={group.id}>
              <RibbonGroup group={group} tipHandlers={tipHandlers} />
            </div>
          ))}
        </div>
      )}
      <ScreenTip tip={tipHandlers.tip} />
    </div>
  );
}
