import { useEffect, useRef } from "react";

export interface TabCapabilities {
  rename: boolean;
  duplicate: boolean;
  pin: boolean;
  /** Whether the strip offers a "+" button for a blank new tab. */
  create: boolean;
}

export interface TabContextMenuProps {
  x: number;
  y: number;
  capabilities: TabCapabilities;
  pinned: boolean;
  permanent: boolean;
  canCloseOthers: boolean;
  canCloseToRight: boolean;
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
export default function TabContextMenu({
  x,
  y,
  capabilities,
  pinned,
  permanent,
  canCloseOthers,
  canCloseToRight,
  onRename,
  onDuplicate,
  onTogglePin,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onDismiss,
}: TabContextMenuProps) {
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
      className={`tab-menu__item${danger ? " tab-menu__item--danger" : ""}`}
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
    <div ref={ref} className="tab-menu" style={{ left: x, top: y }} role="menu">
      {capabilities.rename && !permanent && item("Rename", onRename)}
      {capabilities.duplicate && !permanent && item("Duplicate", onDuplicate)}
      {capabilities.pin && !permanent && item(pinned ? "Unpin" : "Pin", onTogglePin)}
      <div className="tab-menu__separator" />
      {item("Close", onClose, permanent)}
      {item("Close Others", onCloseOthers, !canCloseOthers)}
      {item("Close Tabs to the Right", onCloseToRight, !canCloseToRight)}
    </div>
  );
}
