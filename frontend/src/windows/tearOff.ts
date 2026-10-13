// "Drag it off to take it out" for things that aren't in a TabStrip (e.g.
// Simulation Config's Configuration / Results / Decisions / Canvas tabs).
//
// Call from onPointerDown. A press that is released more than TEAR_OFF_PX
// above/below `bounds` (or outside the browser window) calls `onTear` with
// the drop point in screen pixels; anything else stays a normal click.

const TEAR_OFF_PX = 70;

export const startTearOff = (
  event: PointerEvent | { button: number; clientX: number; clientY: number; currentTarget: EventTarget | null },
  bounds: () => DOMRect | null | undefined,
  onTear: (at: { x: number; y: number }) => void
): void => {
  if (event.button !== 0) return;
  let torn = false;
  const target = event.currentTarget as HTMLElement | null;

  const move = (e: PointerEvent) => {
    const rect = bounds();
    const outside = e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight;
    const away = rect ? e.clientY < rect.top - TEAR_OFF_PX || e.clientY > rect.bottom + TEAR_OFF_PX : false;
    const next = outside || away;
    if (next !== torn) {
      torn = next;
      target?.classList.toggle("is-tearing", torn);
      document.body.style.cursor = torn ? "copy" : "";
    }
  };
  const up = (e: PointerEvent) => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    target?.classList.remove("is-tearing");
    document.body.style.cursor = "";
    if (!torn) return;
    // Swallow the click that follows the drag, so the tab isn't also selected.
    const swallow = (click: MouseEvent) => {
      click.stopPropagation();
      click.preventDefault();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", swallow, true), 0);
    onTear({ x: e.screenX, y: e.screenY });
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
};
