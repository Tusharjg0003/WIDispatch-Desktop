// Storage boundary for tab sessions.
//
// localStorage rather than IndexedDB: a session is ids, titles and a sub-tab
// key. It reads synchronously at mount so the strip never flashes empty, and
// it keeps canvas-shaped data out of a database named for the canvas.

import { TAB_SESSION_VERSION } from "./tabSession.schemas.ts";
import { handedOverTab, isTabWindow, isWindowFor, setReturnState, thisTabWindow } from "../../windows/tabWindows.ts";

export interface TabSessionStorage {
  read(): unknown;
  write(value: unknown): void;
  clear(): void;
}

/** Used in tests and wherever localStorage is unavailable. */
export class MemoryTabSessionStorage implements TabSessionStorage {
  #value: unknown = null;

  read(): unknown {
    return this.#value;
  }

  write(value: unknown): void {
    this.#value = value;
  }

  clear(): void {
    this.#value = null;
  }
}

/**
 * A taken-out tab window (windows/tabWindows.ts) keeps its tabs in memory, so
 * it can never overwrite the main window's stored session. It starts from the
 * tab the main window handed over, and hands that tab back when it closes.
 */
const createWindowSessionStorage = (domain: string): TabSessionStorage => {
  const storage = new MemoryTabSessionStorage();
  if (!isWindowFor(domain)) return storage;
  const tab = handedOverTab(domain) as { id?: unknown } | null;
  if (tab && typeof tab.id === "string") {
    storage.write({ version: TAB_SESSION_VERSION, activeTabId: tab.id, order: [tab.id], tabs: [tab] });
  }
  if (!thisTabWindow?.sub) {
    setReturnState(() => {
      const value = storage.read() as { tabs?: Array<{ key?: unknown }> } | null;
      return value?.tabs?.find((t) => t?.key === thisTabWindow?.key) ?? null;
    });
  }
  return storage;
};

/**
 * Every method swallows storage errors. Recovery is a convenience; a quota
 * failure or a browser configured to block site data must never break tabs.
 */
export const createTabSessionStorage = (domain: string): TabSessionStorage => {
  if (isTabWindow()) return createWindowSessionStorage(domain);
  const key = `widispatch.tabs.${domain}`;

  const available = (): boolean => {
    try {
      return typeof localStorage !== "undefined" && localStorage !== null;
    } catch {
      return false;
    }
  };

  if (!available()) {
    console.warn(
      `[tabs] localStorage unavailable — ${domain} tabs will work, ` +
        "but will not survive a refresh."
    );
    return new MemoryTabSessionStorage();
  }

  return {
    read() {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? null : JSON.parse(raw);
      } catch (error) {
        console.warn(`[tabs] could not read the ${domain} session`, error);
        return null;
      }
    },
    write(value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn(`[tabs] could not save the ${domain} session`, error);
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn(`[tabs] could not clear the ${domain} session`, error);
      }
    },
  };
};
