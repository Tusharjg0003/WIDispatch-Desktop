import { useEffect, useRef } from "react";

export interface WorkspaceTabContextMenuProps {
  x: number;
  y: number;
  canCloseOthers: boolean;
  canCloseToRight: boolean;
  pinned: boolean;
  onRename(): void;
  onDuplicate(): void;
  onTogglePin(): void;
  onClose(): void;
  onCloseOthers(): void;
  onCloseToRight(): void;
  onDismiss(): void;
}

/**
 * A plain DOM popover — unrelated to the cytoscape-context-menus extension
 * used on the canvas itself.
 */
export default function WorkspaceTabContextMenu({
  x,
  y,
  canCloseOthers,
  canCloseToRight,
  pinned,
  onRename,
  onDuplicate,
  onTogglePin,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onDismiss,
}: WorkspaceTabContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    // Capture phase: the canvas stops propagation on some pointer events, so a
    // bubbling listener would leave the menu stuck open.
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onDismiss]);

  const item = (
    label: string,
    action: () => void,
    disabled = false,
    danger = false
  ) => (
    <button
      type="button"
      className={`ws-menu__item${danger ? " ws-menu__item--danger" : ""}`}
      disabled={disabled}
      onClick={() => {
        onDismiss();
        action();
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="ws-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      {item("Rename", onRename)}
      {item("Duplicate", onDuplicate)}
      {item(pinned ? "Unpin" : "Pin", onTogglePin)}
      <div className="ws-menu__separator" />
      {item("Close", onClose)}
      {item("Close Others", onCloseOthers, !canCloseOthers)}
      {item("Close Tabs to the Right", onCloseToRight, !canCloseToRight)}
    </div>
  );
}
