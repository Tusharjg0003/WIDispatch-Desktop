import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, Info, PencilLine, TriangleAlert } from "lucide-react";
import { currentDialog, settleDialog, subscribeDialogs } from "./appDialog";
import "./AppDialog.css";

const ICONS = { confirm: CircleHelp, prompt: PencilLine, alert: Info };

// Renders the queued confirm / prompt / alert dialogs (see appDialog.js) in
// the app's card language: a tinted icon tile, title, message, and footer
// buttons. Esc and the backdrop cancel; Enter confirms.
export default function AppDialogHost() {
  const dialog = useSyncExternalStore(subscribeDialogs, currentDialog, currentDialog);
  const [value, setValue] = useState("");
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!dialog) return;
    setValue(dialog.defaultValue ?? "");
    setError(null);
    // Focus after paint so the field selects its default text.
    const timer = setTimeout(() => {
      if (dialog.kind === "prompt") {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else {
        confirmRef.current?.focus();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [dialog]);

  if (!dialog) return null;

  const cancel = () => settleDialog(dialog.id, dialog.kind === "prompt" ? null : dialog.kind === "confirm" ? false : undefined);
  const confirm = () => {
    if (dialog.kind === "prompt") {
      const text = value.trim();
      const problem = !text ? "Enter a value." : dialog.validate ? dialog.validate(text) : null;
      if (problem) {
        setError(problem);
        return;
      }
      settleDialog(dialog.id, text);
      return;
    }
    settleDialog(dialog.id, dialog.kind === "confirm" ? true : undefined);
  };

  const Icon = dialog.tone === "danger" ? TriangleAlert : ICONS[dialog.kind] || Info;

  return createPortal(
    <div
      className="app-dialog"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cancel();
        } else if (e.key === "Enter" && dialog.kind !== "prompt" && e.target.tagName !== "BUTTON") {
          confirm();
        }
      }}
    >
      <section className={`app-dialog__card app-dialog--${dialog.tone || "default"}`} role={dialog.kind === "alert" ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={`app-dialog-${dialog.id}`}>
        <header className="app-dialog__head">
          <span className="app-dialog__icon" aria-hidden="true"><Icon size={17} /></span>
          <h2 id={`app-dialog-${dialog.id}`}>{dialog.title}</h2>
        </header>
        {dialog.message && <p className="app-dialog__message">{dialog.message}</p>}
        {dialog.kind === "prompt" && (
          <form className="app-dialog__form" onSubmit={(e) => { e.preventDefault(); confirm(); }}>
            <input
              ref={inputRef}
              className={`app-dialog__input${error ? " is-invalid" : ""}`}
              value={value}
              placeholder={dialog.placeholder}
              onChange={(e) => { setValue(e.target.value); setError(null); }}
              aria-label={dialog.title}
              aria-invalid={Boolean(error)}
            />
            {error && <span className="app-dialog__error">{error}</span>}
          </form>
        )}
        <footer className="app-dialog__foot">
          {dialog.kind !== "alert" && (
            <button type="button" className="app-dialog__btn" onClick={cancel}>{dialog.cancelLabel || "Cancel"}</button>
          )}
          <button ref={confirmRef} type="button" className={`app-dialog__btn app-dialog__btn--primary${dialog.tone === "danger" ? " is-danger" : ""}`} onClick={confirm}>
            {dialog.confirmLabel || "OK"}
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
