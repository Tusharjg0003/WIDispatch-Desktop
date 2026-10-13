// In-app replacements for window.confirm / prompt / alert, in the app's own
// design (rendered by AppDialogHost). Each returns a promise; requests queue
// and show one at a time.
//
//   if (await confirmDialog({ title: "Delete plant?", message: "…", confirmLabel: "Delete", tone: "danger" })) …
//   const name = await promptDialog({ title: "Name this network", defaultValue: "Untitled network" });
//   await alertDialog({ title: "Window blocked", message: "…" });

let queue = [];
const listeners = new Set();
let seq = 0;

const emit = () => listeners.forEach((fn) => fn());

export const subscribeDialogs = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The dialog on screen (first in the queue), or null. */
export const currentDialog = () => queue[0] ?? null;

const open = (kind, options) =>
  new Promise((resolve) => {
    seq += 1;
    queue = [...queue, { id: seq, kind, ...options, resolve }];
    emit();
  });

/** Settle the dialog on screen and show the next one. */
export const settleDialog = (id, value) => {
  const dialog = queue.find((d) => d.id === id);
  if (!dialog) return;
  queue = queue.filter((d) => d.id !== id);
  emit();
  dialog.resolve(value);
};

/** Resolves true when confirmed, false when cancelled (Esc, Cancel, backdrop). */
export const confirmDialog = ({ title = "", message = "", confirmLabel = "OK", cancelLabel = "Cancel", tone = "default" } = {}) =>
  open("confirm", { title, message, confirmLabel, cancelLabel, tone });

/** Resolves the entered text (trimmed), or null when cancelled. */
export const promptDialog = ({
  title = "", message = "", defaultValue = "", placeholder = "", confirmLabel = "OK", cancelLabel = "Cancel", validate = null,
} = {}) => open("prompt", { title, message, defaultValue, placeholder, confirmLabel, cancelLabel, validate, tone: "default" });

/** Resolves when dismissed. */
export const alertDialog = ({ title = "", message = "", confirmLabel = "OK", tone = "default" } = {}) =>
  open("alert", { title, message, confirmLabel, tone });

/** Unsaved-changes question shared by every tab strip. */
export const confirmDiscard = (name) =>
  confirmDialog({
    title: "Discard unsaved changes?",
    message: `"${name}" has changes that haven't been saved. Close it anyway?`,
    confirmLabel: "Discard changes",
    cancelLabel: "Keep editing",
    tone: "danger",
  });
