// Tab keyboard shortcuts for any strip whose controller exposes this shape.
//
// Ctrl/Cmd+Tab is deliberately absent: Chrome reserves it for browser tab
// switching and the event is not cancelable, so binding it would silently do
// nothing.

import { useEffect } from "react";

export interface TabShortcutTarget {
  activateRelative(offset: number): void;
  closeActive(): void;
  reopenLastClosed(): unknown;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  // A modal owns the keyboard while it is open.
  return Boolean(el.closest('[role="dialog"]'));
};

export const useTabShortcuts = (
  target: TabShortcutTarget,
  enabled = true
): void => {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const lower = event.key.toLowerCase();

      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        target.activateRelative(1);
      } else if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        target.activateRelative(-1);
      } else if (event.shiftKey && lower === "t") {
        event.preventDefault();
        target.reopenLastClosed();
      } else if (!event.shiftKey && lower === "w") {
        // Closing is undoable via Ctrl/Cmd+Shift+T, so no confirmation prompt.
        event.preventDefault();
        target.closeActive();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, enabled]);
};
