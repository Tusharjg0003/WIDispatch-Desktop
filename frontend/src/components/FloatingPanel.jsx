import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, GripHorizontal, PanelTopClose, X } from "lucide-react";
import "./assetFormFields.css";
import "./FloatingPanel.css";

// Non-blocking floating window for canvas forms (asset details, pipe
// variables, group lines…). It floats over the page instead of sitting in the
// layout, so the sidebars never move; the canvas behind stays usable.
//
// • Drag it by the title bar; where you leave it is remembered per
//   `storageKey` (this browser only) and clamped back on screen next time.
// • Pop out: moves the same React tree into a separate browser window (for a
//   second monitor). It stays connected — saving there updates the canvas.
//   "Return to app" brings it back; closing that window cancels the form.
// • Esc closes (cancels) it.
//
// Rendered into <body> via a portal, so its look never depends on where the
// caller mounts it.

const POS_PREFIX = "fp.pos.";
const EDGE = 8; // keep at least this much of the window on screen
const HEADER_H = 38;

const readPos = (key) => {
  try {
    const raw = window.localStorage.getItem(POS_PREFIX + key);
    const pos = raw ? JSON.parse(raw) : null;
    return pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) ? pos : null;
  } catch {
    return null;
  }
};
const writePos = (key, pos) => {
  try {
    window.localStorage.setItem(POS_PREFIX + key, JSON.stringify(pos));
  } catch {
    // Storage unavailable: the window just opens in its default spot.
  }
};

// Keep the title bar reachable: the window may hang off the right/bottom,
// but never so far that it can't be dragged back.
const clamp = ({ x, y }, width) => ({
  x: Math.round(Math.min(Math.max(x, EDGE - width + 120), window.innerWidth - 120)),
  y: Math.round(Math.min(Math.max(y, EDGE), window.innerHeight - HEADER_H - EDGE)),
});

// Default spot: top-right corner of the canvas, inside its border.
const defaultPos = (width) => {
  const canvas = document.querySelector(".nb-canvas-wrap")?.getBoundingClientRect();
  if (canvas && canvas.width > width + 2 * EDGE) {
    return { x: canvas.right - width - 12, y: canvas.top + 12 };
  }
  return { x: (window.innerWidth - width) / 2, y: 72 };
};

// Copy the app's stylesheets and theme into a popped-out window, and keep
// them in step (theme switches, and styles Vite injects later in dev).
function mirrorDocument(target) {
  const sync = () => {
    target.document.querySelectorAll("[data-fp-mirror]").forEach((node) => node.remove());
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      const copy = target.document.importNode(node, true);
      if (copy.tagName === "LINK") copy.href = node.href; // absolute URL
      copy.setAttribute("data-fp-mirror", "");
      target.document.head.appendChild(copy);
    });
  };
  const syncRootAttrs = () => {
    const from = document.documentElement;
    const to = target.document.documentElement;
    [...to.attributes].forEach((attr) => to.removeAttribute(attr.name));
    [...from.attributes].forEach((attr) => to.setAttribute(attr.name, attr.value));
  };
  sync();
  syncRootAttrs();
  const headObserver = new MutationObserver(sync);
  headObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
  const rootObserver = new MutationObserver(syncRootAttrs);
  rootObserver.observe(document.documentElement, { attributes: true });
  return () => {
    headObserver.disconnect();
    rootObserver.disconnect();
  };
}

export default function FloatingPanel({
  title,
  onClose,
  storageKey,
  width = 560,
  className = "",
  children,
}) {
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [pos, setPos] = useState(() => clamp(readPos(storageKey) || defaultPos(width), width));
  const [popout, setPopout] = useState(null); // { win, container }
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // ── Dragging ──────────────────────────────────────────────────────────────
  const onPointerDown = (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, origin: pos };
    panelRef.current?.classList.add("is-dragging");
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const panelWidth = panelRef.current?.offsetWidth || width;
    setPos(clamp({ x: drag.origin.x + event.clientX - drag.startX, y: drag.origin.y + event.clientY - drag.startY }, panelWidth));
  };
  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    panelRef.current?.classList.remove("is-dragging");
    setPos((current) => {
      writePos(storageKey, current);
      return current;
    });
  };

  // Keyboard move for the title bar: arrows nudge the window.
  const onHeaderKey = (event) => {
    const step = event.shiftKey ? 40 : 10;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta) return;
    event.preventDefault();
    setPos((current) => {
      const next = clamp({ x: current.x + delta[0], y: current.y + delta[1] }, panelRef.current?.offsetWidth || width);
      writePos(storageKey, next);
      return next;
    });
  };

  // Stay on screen when the browser window shrinks.
  useEffect(() => {
    const onResize = () => setPos((current) => clamp(current, panelRef.current?.offsetWidth || width));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [width]);

  // ── Pop out / back in ─────────────────────────────────────────────────────
  const popOut = useCallback(() => {
    const rect = panelRef.current?.getBoundingClientRect();
    const w = Math.round(rect?.width || width);
    const h = Math.round(Math.min(Math.max(rect?.height || 600, 420), window.screen.availHeight - 80));
    const left = Math.round(window.screenX + (rect?.left || 80));
    const top = Math.round(window.screenY + (rect?.top || 80));
    const win = window.open("", `fp-${storageKey}`, `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
    if (!win) {
      window.alert("The pop-out window was blocked by the browser. Allow pop-ups for this site and try again.");
      return;
    }
    win.document.title = typeof title === "string" ? title : "Details";
    win.document.body.className = "fp-popout-body";
    win.document.body.innerHTML = "";
    const container = win.document.createElement("div");
    container.className = "fp-popout-root";
    win.document.body.appendChild(container);
    setPopout({ win, container, stopMirror: mirrorDocument(win) });
  }, [storageKey, title, width]);

  const popIn = useCallback(() => {
    setPopout((current) => {
      if (current) {
        current.stopMirror();
        current.win.__fpReturning = true;
        current.win.close();
      }
      return null;
    });
  }, []);

  // The user closing the pop-out window cancels the form, like the × does.
  useEffect(() => {
    if (!popout) return undefined;
    const { win } = popout;
    const onUnload = () => {
      if (win.__fpReturning) return;
      popout.stopMirror();
      onCloseRef.current?.();
    };
    win.addEventListener("pagehide", onUnload);
    return () => win.removeEventListener("pagehide", onUnload);
  }, [popout]);

  // Form finished or cancelled from the app: take the pop-out window with it.
  const popoutRef = useRef(null);
  popoutRef.current = popout;
  useEffect(() => () => {
    const current = popoutRef.current;
    if (current && !current.win.closed) {
      current.stopMirror();
      current.win.__fpReturning = true;
      current.win.close();
    }
  }, []);

  // ── Focus & Esc ───────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const root = panelRef.current;
    if (!root || root.contains(root.ownerDocument.activeElement)) return;
    const first = root.querySelector("[autofocus], input:not([type=hidden]), select, textarea, button:not(.fp__icon-btn)");
    first?.focus();
  }, [popout]);

  const onKeyDown = (event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.stopPropagation();
      onClose?.();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const popped = Boolean(popout);
  const panel = (
    <section
      ref={panelRef}
      className={`fp${popped ? " fp--popout" : ""} ${className}`.trim()}
      role="dialog"
      aria-label={typeof title === "string" ? title : undefined}
      style={popped ? undefined : { left: pos.x, top: pos.y, width }}
      onKeyDown={onKeyDown}
    >
      <header
        className="fp__head"
        onPointerDown={popped ? undefined : onPointerDown}
        onPointerMove={popped ? undefined : onPointerMove}
        onPointerUp={popped ? undefined : onPointerUp}
        onPointerCancel={popped ? undefined : onPointerUp}
        onKeyDown={popped ? undefined : onHeaderKey}
        tabIndex={popped ? undefined : 0}
        aria-roledescription={popped ? undefined : "Draggable title bar. Use arrow keys to move."}
      >
        {!popped && <GripHorizontal size={14} className="fp__grip" aria-hidden="true" />}
        <h2 className="fp__title">{title}</h2>
        <div className="fp__actions">
          {popped ? (
            <button type="button" className="fp__icon-btn fp__icon-btn--text" onClick={popIn} title="Return to the app window">
              <PanelTopClose size={14} aria-hidden="true" />
              <span>Return to app</span>
            </button>
          ) : (
            <button type="button" className="fp__icon-btn" onClick={popOut} title="Open in a separate window" aria-label="Open in a separate window">
              <ExternalLink size={14} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="fp__icon-btn" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="fp__body">{children}</div>
    </section>
  );

  return createPortal(panel, popped ? popout.container : document.body);
}
