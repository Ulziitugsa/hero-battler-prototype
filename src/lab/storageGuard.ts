// The lab's save protection. The lab is its own page load (?lab): the game, its save migrations and its mission and
// event tracking never start. On top of that, every write to the page's localStorage is refused for as long as the lab
// is open, so nothing the lab reuses (the battle screen, Card Inspect) can change the player's save, even by accident.
// Reads still work: Card Inspect can say how many copies of a card the player owns.
//
// Each refused write is recorded, so the lab can show "0 writes blocked" and QA can see anything that tried.

export interface StorageGuard {
  /** Every refused write, in order: "setItem moonwater:ranked:v1", "removeItem …", "clear". */
  readonly blocked: readonly string[];
  /** Puts the original methods back (tests; the lab itself never uninstalls). */
  uninstall(): void;
}

type Method = 'setItem' | 'removeItem' | 'clear';
const METHODS: Method[] = ['setItem', 'removeItem', 'clear'];

/**
 * Refuses writes to `target` only. The methods live on Storage.prototype (shared with sessionStorage), so each patched
 * method checks which storage it was called on and passes every other one straight through.
 */
export function installStorageGuard(target: Storage, onBlocked?: (entry: string) => void): StorageGuard {
  const proto = Object.getPrototypeOf(target) as Record<Method, (...args: unknown[]) => unknown>;
  const original = Object.fromEntries(METHODS.map((m) => [m, proto[m]])) as Record<Method, (...args: unknown[]) => unknown>;
  const blocked: string[] = [];
  for (const method of METHODS) {
    proto[method] = function guarded(this: Storage, ...args: unknown[]) {
      if (this !== target) return original[method].apply(this, args);
      const entry = method === 'clear' ? 'clear' : `${method} ${String(args[0])}`;
      blocked.push(entry);
      onBlocked?.(entry);
      return undefined;
    };
  }
  return {
    blocked,
    uninstall() {
      for (const method of METHODS) proto[method] = original[method];
    },
  };
}
