import { useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { WorkspaceInstance } from "../types/workspace.types.ts";

export interface WorkspaceTabProps {
  workspace: WorkspaceInstance;
  active: boolean;
  pending: boolean;
  renaming: boolean;
  onActivate(): void;
  onClose(): void;
  onStartRename(): void;
  onCommitRename(name: string): void;
  onCancelRename(): void;
  onContextMenu(event: React.MouseEvent): void;
}

export default function WorkspaceTab({
  workspace,
  active,
  pending,
  renaming,
  onActivate,
  onClose,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onContextMenu,
}: WorkspaceTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: workspace.id, disabled: renaming });
  // Focus from a callback ref rather than an effect: it runs synchronously the
  // moment the input mounts, so there is no frame to miss. An effect scheduling
  // requestAnimationFrame does miss it — StrictMode's mount/cleanup/mount cycle
  // cancels the frame and the field opens unfocused.
  const focusOnMount = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  // Uncontrolled: the field seeds from the current name every time it mounts,
  // so a draft can never go stale against a rename made elsewhere.
  const commit = (value: string) => {
    const next = value.trim();
    if (!next || next === workspace.document.name) onCancelRename();
    else onCommitRename(next);
  };

  const className = [
    "ws-tab",
    active ? "ws-tab--active" : "",
    isDragging ? "ws-tab--dragging" : "",
    pending ? "ws-tab--pending" : "",
    workspace.pinned ? "ws-tab--pinned" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onContextMenu={onContextMenu}
      onDoubleClick={onStartRename}
      onAuxClick={(event) => {
        // Middle-click closes, matching editor and browser tab conventions.
        if (event.button === 1) {
          event.preventDefault();
          onClose();
        }
      }}
      title={
        workspace.loadError
          ? `${workspace.document.name} — couldn't load`
          : workspace.document.name
      }
    >
      {renaming ? (
        <input
          ref={focusOnMount}
          className="ws-tab__rename"
          defaultValue={workspace.document.name}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit(event.currentTarget.value);
            else if (event.key === "Escape") onCancelRename();
            // The page binds global shortcuts; without this, typing "w" in a
            // tab name would try to close the workspace.
            event.stopPropagation();
          }}
        />
      ) : (
        <button
          type="button"
          className="ws-tab__label"
          onClick={onActivate}
          {...attributes}
          {...listeners}
        >
          {workspace.pinned && <span className="ws-tab__pin" aria-hidden="true" />}
          <span className="ws-tab__name">{workspace.document.name}</span>
          {workspace.loadError && (
            <span className="ws-tab__warn" title="Couldn't load this network">
              !
            </span>
          )}
          {workspace.dirty && (
            <span className="ws-tab__dirty" title="Unsaved changes" />
          )}
        </button>
      )}

      <button
        type="button"
        className="ws-tab__close"
        aria-label={`Close ${workspace.document.name}`}
        title="Close"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
    </div>
  );
}
