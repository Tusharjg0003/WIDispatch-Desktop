// Unsaved work that would be lost by leaving the current page.
//
// A page with work that only lives in its components (e.g. Asset Registry
// forms) registers a guard while mounted. In-app navigation (top navigation,
// search) asks `confirmLeave()` first, and the browser shows its "Leave site?"
// warning on close / reload while a guard reports unsaved work.

const guards = new Set();

/**
 * Register a guard: `hasUnsaved()` says whether there is work to lose,
 * `confirm()` asks the user (resolves true to leave). Returns an unregister.
 */
export const addLeaveGuard = (hasUnsaved, confirm) => {
  const guard = { hasUnsaved, confirm };
  guards.add(guard);
  return () => guards.delete(guard);
};

/** Resolves true when it's fine to leave (nothing unsaved, or the user agreed). */
export const confirmLeave = async () => {
  for (const guard of guards) {
    if (guard.hasUnsaved() && !(await guard.confirm())) return false;
  }
  return true;
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (event) => {
    if ([...guards].some((guard) => guard.hasUnsaved())) {
      event.preventDefault();
      // Legacy browsers need a returnValue to show the prompt.
      event.returnValue = "";
    }
  });
}
