import { useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface TabView {
  id: string;
  title: string;
  pinned: boolean;
  permanent: boolean;
  /** Unsaved-changes dot. Domains without drafts omit it. */
  dirty?: boolean;
  /** Warning glyph plus tooltip, e.g. a document that failed to load. */
  warning?: string | null;
}

export interface TabProps {
  tab: TabView;
  active: boolean;
  pending: boolean;
  renaming: boolean;
  onActivate(): void;
  onClose(): void;
  onStartRename(): void;
  onCommitRename(title: string): void;
  onCancelRename(): void;
  onContextMenu(event: React.MouseEvent): void;
}

export default function Tab({
  tab,
  active,
  pending,
  renaming,
  onActivate,
  onClose,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onContextMenu,
}: TabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tab.id, disabled: renaming });

  // Focus from a callback ref rather than an effect: it runs synchronously the
  // moment the input mounts, so there is no frame to miss. An effect scheduling
  // requestAnimationFrame does miss it — StrictMode's mount/cleanup/mount cycle
  // cancels the frame and the field opens unfocused.
  const focusOnMount = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  // Uncontrolled: the field seeds from the current title every time it mounts,
  // so a draft can never go stale against a rename made elsewhere.
  const commit = (value: string) => {
    const next = value.trim();
    if (!next || next === tab.title) onCancelRename();
    else onCommitRename(next);
  };

  const className = [
    "tab",
    active ? "tab--active" : "",
    isDragging ? "tab--dragging" : "",
    pending ? "tab--pending" : "",
    tab.pinned || tab.permanent ? "tab--pinned" : "",
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
        if (event.button === 1 && !tab.permanent) {
          event.preventDefault();
          onClose();
        }
      }}
      title={tab.warning ? `${tab.title} — ${tab.warning}` : tab.title}
    >
      {renaming ? (
        <input
          ref={focusOnMount}
          className="tab__rename"
          defaultValue={tab.title}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit(event.currentTarget.value);
            else if (event.key === "Escape") onCancelRename();
            // Pages bind global shortcuts; without this, typing "w" in a tab
            // name would try to close the tab.
            event.stopPropagation();
          }}
        />
      ) : (
        <button
          type="button"
          className="tab__label"
          onClick={onActivate}
          {...attributes}
          {...listeners}
        >
          {(tab.pinned || tab.permanent) && (
            <span className="tab__pin" aria-hidden="true" />
          )}
          <span className="tab__name">{tab.title}</span>
          {tab.warning && (
            <span className="tab__warn" title={tab.warning}>
              !
            </span>
          )}
          {tab.dirty && <span className="tab__dirty" title="Unsaved changes" />}
        </button>
      )}

      {!tab.permanent && (
        <button
          type="button"
          className="tab__close"
          aria-label={`Close ${tab.title}`}
          title="Close"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
