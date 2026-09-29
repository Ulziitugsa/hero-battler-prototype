// Cosmetics unlocked by event rewards. Kept in its own tiny store (not inside the event save) so
// game/backgrounds can read it without importing the event store, the economy or the collection.
// Unlocks are permanent: an event ending never takes a cosmetic back.

export const EVENT_COSMETICS_STORAGE_KEY = 'moonwater:event-cosmetics';

let snapshot: ReadonlySet<string> | null = null;

function load(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(EVENT_COSMETICS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function isEventCosmeticUnlocked(id: string): boolean {
  if (!snapshot) snapshot = load();
  return snapshot.has(id);
}

/** Returns true if this call newly unlocked it. */
export function unlockEventCosmetic(id: string): boolean {
  if (isEventCosmeticUnlocked(id)) return false;
  const next = new Set(snapshot);
  next.add(id);
  snapshot = next;
  try {
    localStorage.setItem(EVENT_COSMETICS_STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // best effort, same as every other local store
  }
  return true;
}

export function resetEventCosmetics(): void {
  snapshot = null;
  try {
    localStorage.removeItem(EVENT_COSMETICS_STORAGE_KEY);
  } catch {
    // ignore
  }
}
