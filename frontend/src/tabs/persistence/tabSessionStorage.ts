// Storage boundary for tab sessions.
//
// localStorage rather than IndexedDB: a session is ids, titles and a sub-tab
// key. It reads synchronously at mount so the strip never flashes empty, and
// it keeps canvas-shaped data out of a database named for the canvas.

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
 * Every method swallows storage errors. Recovery is a convenience; a quota
 * failure or a browser configured to block site data must never break tabs.
 */
export const createTabSessionStorage = (domain: string): TabSessionStorage => {
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
