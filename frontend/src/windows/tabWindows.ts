// Tabs taken out into their own browser windows.
//
// A taken-out tab is an independent window running the whole app in "window
// mode" (see App.jsx): no top navigation, no tab strip, just that tab. It
// survives reloading either window. The windows talk over a BroadcastChannel,
// and a small registry in localStorage (refreshed by each window's heartbeat)
// lets a reloaded main window know which of its tabs are out.
//
//   main window                          tab window
//   openTabWindow(...)  ── handoff ──▶   boots with WINDOW = { domain, key, … }
//   strip marks the tab "in window" ◀── alive (every 2 s)
//   focusTabWindow(...) ─────────────▶   window.focus()
//   onTabReturned(domain, fn)  ◀──────── returned { state } (close / "Return")
//   onDataChanged(domain, fn)  ◀──────▶  notifyDataChanged(domain, key)
//
// The tab's state (sub-tab, an unsaved draft…) travels with it: the main
// window hands its tab over on open, the window hands it back when it closes.

import { useSyncExternalStore } from "react";

export interface TabWindowInfo {
  /** Window id (also its sessionStorage identity across reloads). */
  id: string;
  /** Tab strip domain, e.g. "production", "simulation", "workspace". */
  domain: string;
  /** The tab's record key (plant id, config id, workspace id…). */
  key: string;
  /** A single sub-view (Simulation Config's Results…) rather than the whole tab. */
  sub?: string | null;
  title: string;
}

interface HandoffRecord extends TabWindowInfo {
  /** The tab as the main window had it (its stored tab object), if any. */
  tab?: unknown;
}

interface RegistryEntry extends TabWindowInfo {
  seen: number;
}

type Message =
  | { type: "alive"; info: TabWindowInfo }
  | { type: "returned"; info: TabWindowInfo; state: unknown }
  | { type: "focus"; id: string }
  | { type: "changed"; domain: string; key: string | null; from: string; payload?: unknown };

const CHANNEL = "widispatch.windows";
const REGISTRY_KEY = "widispatch.windows";
const HANDOFF_PREFIX = "widispatch.window.";
const SESSION_KEY = "widispatch.thisWindow";
const URL_PARAM = "window";
const HEARTBEAT_MS = 2000;
const STALE_MS = 7000;

const hasWindow = typeof window !== "undefined";

const safeJson = (raw: string | null): unknown => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const storageGet = (store: Storage | undefined, key: string): string | null => {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
};

const storageSet = (store: Storage | undefined, key: string, value: string | null): void => {
  try {
    if (!store) return;
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // Storage blocked: windows still open, they just can't be tracked.
  }
};

const local = hasWindow ? window.localStorage : undefined;
const session = hasWindow ? window.sessionStorage : undefined;

// ── Which window is this? ────────────────────────────────────────────────────

/**
 * Read once at startup. A window opened with ?window=<id> takes its handoff
 * from localStorage and keeps it in sessionStorage, so it stays a tab window
 * through reloads even after the URL has moved on.
 */
const readThisWindow = (): HandoffRecord | null => {
  if (!hasWindow) return null;
  const fromSession = safeJson(storageGet(session, SESSION_KEY)) as HandoffRecord | null;
  if (fromSession?.id) return fromSession;
  const id = new URLSearchParams(window.location.search).get(URL_PARAM);
  if (!id) return null;
  const handoff = safeJson(storageGet(local, HANDOFF_PREFIX + id)) as HandoffRecord | null;
  storageSet(local, HANDOFF_PREFIX + id, null);
  if (!handoff?.domain) return null;
  const record = { ...handoff, id };
  storageSet(session, SESSION_KEY, JSON.stringify(record));
  return record;
};

const THIS_WINDOW = readThisWindow();

/** This window's tab, when it is a taken-out tab window. */
export const thisTabWindow: TabWindowInfo | null = THIS_WINDOW
  ? { id: THIS_WINDOW.id, domain: THIS_WINDOW.domain, key: THIS_WINDOW.key, sub: THIS_WINDOW.sub ?? null, title: THIS_WINDOW.title }
  : null;

export const isTabWindow = (): boolean => thisTabWindow !== null;

/** True when this window is showing `domain` (optionally only that sub-view). */
export const isWindowFor = (domain: string, sub?: string | null): boolean =>
  thisTabWindow !== null && thisTabWindow.domain === domain && (sub === undefined || (thisTabWindow.sub ?? null) === sub);

/** The tab the main window handed over (its stored tab object), for this window's domain. */
export const handedOverTab = (domain: string): unknown =>
  THIS_WINDOW && THIS_WINDOW.domain === domain ? THIS_WINDOW.tab ?? null : null;

// ── Channel ──────────────────────────────────────────────────────────────────

const channel: BroadcastChannel | null =
  hasWindow && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;

type Listener = (message: Message) => void;
const listeners = new Set<Listener>();
channel?.addEventListener("message", (event: MessageEvent<Message>) => {
  listeners.forEach((fn) => fn(event.data));
});
const post = (message: Message) => channel?.postMessage(message);

// ── Registry (which tabs are out) ───────────────────────────────────────────

const readRegistry = (): Record<string, RegistryEntry> =>
  (safeJson(storageGet(local, REGISTRY_KEY)) as Record<string, RegistryEntry> | null) || {};

const writeRegistry = (registry: Record<string, RegistryEntry>) =>
  storageSet(local, REGISTRY_KEY, JSON.stringify(registry));

const live = (registry: Record<string, RegistryEntry>, now = Date.now()) =>
  Object.values(registry).filter((entry) => now - entry.seen < STALE_MS);

let snapshot: RegistryEntry[] = hasWindow ? live(readRegistry()) : [];
const subscribers = new Set<() => void>();

// Liveness: each window holds a Web Lock for as long as it's open; the browser
// drops it the moment the window closes or crashes. Unlike a heartbeat it
// doesn't lapse when a background window's timers are throttled. (Browsers
// without Web Locks fall back to the heartbeat.)
const lockName = (id: string) => `widispatch.window.${id}`;
const locks: LockManager | null = hasWindow && typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : null;
// A window just opened may not hold its lock yet.
const STARTUP_GRACE_MS = 4000;

const publish = (next: RegistryEntry[]) => {
  const same =
    next.length === snapshot.length &&
    next.every((entry) => snapshot.some((s) => s.id === entry.id && s.key === entry.key && s.sub === entry.sub && s.title === entry.title));
  if (same) return;
  snapshot = next;
  subscribers.forEach((fn) => fn());
};

const refresh = () => {
  const registry = readRegistry();
  if (!locks) {
    publish(live(registry));
    return;
  }
  void locks.query().then(({ held = [] }) => {
    const names = new Set(held.map((lock) => lock.name));
    const now = Date.now();
    publish(Object.values(registry).filter((entry) => names.has(lockName(entry.id)) || now - entry.seen < STARTUP_GRACE_MS));
  }).catch(() => publish(live(registry)));
};

/** Drop a window from the list right away (it said it's going). */
const forget = (id: string) => publish(snapshot.filter((entry) => entry.id !== id));

if (hasWindow) {
  window.addEventListener("storage", (event) => {
    if (event.key === REGISTRY_KEY) refresh();
  });
  // Drops windows that died without saying goodbye (crash, killed process).
  setInterval(refresh, HEARTBEAT_MS);
  listeners.add((message) => {
    if (message.type === "alive" || message.type === "returned") setTimeout(refresh, 0);
  });
}

const upsert = (info: TabWindowInfo) => {
  const registry = readRegistry();
  const now = Date.now();
  registry[info.id] = { ...info, seen: now };
  // Prune the long dead while we're here. Generous: a throttled background
  // window may beat only once a minute, and its lock says it's alive.
  for (const [id, entry] of Object.entries(registry)) if (now - entry.seen > 10 * 60 * 1000) delete registry[id];
  writeRegistry(registry);
};

const remove = (id: string) => {
  const registry = readRegistry();
  if (!registry[id]) return;
  delete registry[id];
  writeRegistry(registry);
};

const subscribe = (fn: () => void) => {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
};

/** Every tab currently out in a window (re-renders when that changes). */
export const useTabWindows = (): RegistryEntry[] => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

/** The window holding `domain`/`key` (whole tab when `sub` is omitted), if any. */
export const findTabWindow = (entries: RegistryEntry[], domain: string, key: string, sub: string | null = null) =>
  entries.find((entry) => entry.domain === domain && entry.key === key && (entry.sub ?? null) === sub) || null;

export const tabWindowsFor = (domain: string): RegistryEntry[] => snapshot.filter((entry) => entry.domain === domain);

// ── Opening, focusing ────────────────────────────────────────────────────────

const windowName = (info: Pick<TabWindowInfo, "domain" | "key" | "sub">) =>
  `widispatch-${info.domain}-${info.key}${info.sub ? `-${info.sub}` : ""}`.replace(/[^\w-]/g, "_");

export interface OpenTabWindowOptions {
  domain: string;
  key: string;
  sub?: string | null;
  title: string;
  /** The page URL (path + query) the window opens on. */
  path: string;
  /** The tab object to carry over (sub-tab, draft…). */
  tab?: unknown;
  /** Where to put it, in screen pixels (e.g. where a tab was dropped). */
  at?: { x: number; y: number } | null;
}

/**
 * Open a tab in its own window. Must run from a user gesture (click, drop),
 * or the browser blocks the window. Returns false when it was blocked.
 */
export const openTabWindow = ({ domain, key, sub = null, title, path, tab, at }: OpenTabWindowOptions): boolean => {
  const existing = findTabWindow(snapshot, domain, key, sub);
  if (existing) {
    focusTabWindow(existing);
    return true;
  }
  const id = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const record: HandoffRecord = { id, domain, key, sub, title, tab };
  storageSet(local, HANDOFF_PREFIX + id, JSON.stringify(record));

  const width = Math.round(Math.max(Math.min(window.outerWidth * 0.8, 1400), 900));
  const height = Math.round(Math.max(Math.min(window.outerHeight * 0.85, 960), 640));
  const left = Math.round(at ? at.x - 120 : window.screenX + 60);
  const top = Math.round(at ? at.y - 20 : window.screenY + 60);
  const url = `${path}${path.includes("?") ? "&" : "?"}${URL_PARAM}=${id}`;
  const win = window.open(url, windowName(record), `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
  if (!win) {
    storageSet(local, HANDOFF_PREFIX + id, null);
    window.alert("The new window was blocked by the browser. Allow pop-ups for this site and try again.");
    return false;
  }
  // Mark it out straight away; the window's own heartbeat keeps it so.
  upsert({ id, domain, key, sub, title });
  refresh();
  return true;
};

/** Bring a tab's window to the front (from a click in the main window). */
export const focusTabWindow = (entry: Pick<TabWindowInfo, "id" | "domain" | "key" | "sub">): void => {
  // A named lookup reaches the window even after this one was reloaded. If the
  // name no longer resolves the browser hands back a blank window — close it.
  try {
    const win = window.open("", windowName(entry));
    if (win && win.location.href === "about:blank") {
      win.close();
    } else {
      win?.focus();
    }
  } catch {
    // Cross-origin or blocked: fall back to asking the window itself.
  }
  post({ type: "focus", id: entry.id });
};

// ── Coming back ──────────────────────────────────────────────────────────────

type ReturnHandler = (info: TabWindowInfo, state: unknown) => void;
const returnHandlers = new Map<string, Set<ReturnHandler>>();

// Returns that arrive while their page isn't mounted wait here for it.
const pendingReturns = new Map<string, Array<[TabWindowInfo, unknown]>>();

const deliverReturn = (info: TabWindowInfo, state: unknown) => {
  // The list must already show the tab as back, or the strip would treat it
  // as still out the moment it's activated.
  forget(info.id);
  refresh();
  const handlers = returnHandlers.get(info.domain);
  if (handlers?.size) handlers.forEach((fn) => fn(info, state));
  else pendingReturns.set(info.domain, [...(pendingReturns.get(info.domain) ?? []), [info, state]]);
};

listeners.add((message) => {
  if (message.type !== "returned" || isTabWindow()) return;
  deliverReturn(message.info, message.state);
});

/** Main window: run `fn` when a tab of `domain` comes back from its window. */
export const onTabReturned = (domain: string, fn: ReturnHandler): (() => void) => {
  const set = returnHandlers.get(domain) ?? new Set();
  set.add(fn);
  returnHandlers.set(domain, set);
  const waiting = pendingReturns.get(domain);
  if (waiting) {
    pendingReturns.delete(domain);
    waiting.forEach(([info, state]) => fn(info, state));
  }
  return () => set.delete(fn);
};

// What this window hands back when it closes; pages register a getter.
let returnStateGetter: (() => unknown) | null = null;
export const setReturnState = (getter: (() => unknown) | null): void => {
  returnStateGetter = getter;
};

let returned = false;
const sendBack = () => {
  if (!thisTabWindow || returned) return;
  returned = true;
  let state: unknown = null;
  try {
    state = returnStateGetter?.() ?? null;
  } catch {
    state = null;
  }
  remove(thisTabWindow.id);
  post({ type: "returned", info: thisTabWindow, state });
  storageSet(session, SESSION_KEY, null);
};

/** Tab window: hand the tab back to the main window and close. */
export const returnToMainWindow = (): void => {
  sendBack();
  window.close();
};

if (thisTabWindow) {
  // Held until this window goes away (see refresh()).
  void locks?.request(lockName(thisTabWindow.id), () => new Promise<void>(() => {})).catch(() => {});
  const beat = () => {
    upsert(thisTabWindow);
    post({ type: "alive", info: thisTabWindow });
  };
  beat();
  setInterval(beat, HEARTBEAT_MS);
  listeners.add((message) => {
    if (message.type === "focus" && message.id === thisTabWindow.id) window.focus();
  });
  // Closing the window (or reloading it — pagehide can't tell) leaves a
  // pending return; see below.
  window.addEventListener("pagehide", () => sendBackUnlessReloading());
}

// A reload keeps sessionStorage, a close drops it. We can't tell which at
// pagehide, so the window marks a pending return and, if it boots again
// (reload), cancels it; the main window applies a return only after a short
// grace period with no heartbeat.
const PENDING_RETURN = "widispatch.windowReturnPending";
function sendBackUnlessReloading() {
  if (!thisTabWindow || returned) return;
  let state: unknown = null;
  try {
    state = returnStateGetter?.() ?? null;
  } catch {
    state = null;
  }
  storageSet(local, `${PENDING_RETURN}.${thisTabWindow.id}`, JSON.stringify({ info: thisTabWindow, state, at: Date.now() }));
}

if (thisTabWindow) {
  // Booted again (a reload): this window is still out.
  storageSet(local, `${PENDING_RETURN}.${thisTabWindow.id}`, null);
}

if (hasWindow && !thisTabWindow) {
  // Main window: settle windows that closed without "Return to main window".
  const settle = () => {
    const now = Date.now();
    const registry = readRegistry();
    let keys: string[] = [];
    try {
      keys = Object.keys(window.localStorage).filter((k) => k.startsWith(`${PENDING_RETURN}.`));
    } catch {
      keys = [];
    }
    for (const k of keys) {
      const pending = safeJson(storageGet(local, k)) as { info: TabWindowInfo; state: unknown; at: number } | null;
      if (!pending?.info) {
        storageSet(local, k, null);
        continue;
      }
      const entry = registry[pending.info.id];
      // Booted again since (a reload): its heartbeat is newer than the pending return.
      const stillAlive = entry && entry.seen > pending.at;
      if (stillAlive) {
        storageSet(local, k, null); // it reloaded
        continue;
      }
      if (now - pending.at < 2500) continue; // give a reload time to boot
      storageSet(local, k, null);
      remove(pending.info.id);
      deliverReturn(pending.info, pending.state);
      refresh();
    }
  };
  setInterval(settle, 1000);
}

// ── Data changed elsewhere ───────────────────────────────────────────────────

const instanceId = `i-${Math.random().toString(36).slice(2, 9)}`;
type ChangeHandler = (key: string | null, payload: unknown) => void;
const changeHandlers = new Map<string, Set<ChangeHandler>>();

listeners.add((message) => {
  if (message.type !== "changed" || message.from === instanceId) return;
  changeHandlers.get(message.domain)?.forEach((fn) => fn(message.key, message.payload));
});

/** Tell the other windows that `domain` data (optionally one record) changed. */
export const notifyDataChanged = (domain: string, key: string | null = null, payload?: unknown): void =>
  post({ type: "changed", domain, key, from: instanceId, payload });

/** Run `fn` when another window changes `domain` data. */
export const onDataChanged = (domain: string, fn: ChangeHandler): (() => void) => {
  const set = changeHandlers.get(domain) ?? new Set();
  set.add(fn);
  changeHandlers.set(domain, set);
  return () => set.delete(fn);
};

// Saved networks: the Network Builder announces a save with a window event
// (its saved-networks rail listens for it). Pass it on to the other windows,
// and replay theirs here — without echoing a replayed one back.
if (hasWindow) {
  const NETWORK_SAVED_EVENT = "widispatch:network-saved";
  let replaying = false;
  window.addEventListener(NETWORK_SAVED_EVENT, () => {
    if (!replaying) notifyDataChanged("networks");
  });
  onDataChanged("networks", () => {
    replaying = true;
    try {
      window.dispatchEvent(new Event(NETWORK_SAVED_EVENT));
    } finally {
      replaying = false;
    }
  });
}
