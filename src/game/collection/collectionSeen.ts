import type { CardMarksState } from './cardMarks';

// When the player last looked at their collection: the one extra fact the Cards tab needs to say "new cards are
// waiting" truthfully. A card is new when its most recent grant (cardMarks.obtainedAt, written by every real grant)
// is later than this. Its own additive storage key: no save version changes, and an old save simply starts with
// "seen now", so nothing it already owned is suddenly announced as new.

export const COLLECTION_SEEN_STORAGE_KEY = 'moonwater:collection-seen-at';

let snapshot: number | null = null;
const listeners = new Set<() => void>();

function persist(at: number): void {
  try {
    localStorage.setItem(COLLECTION_SEEN_STORAGE_KEY, String(at));
  } catch {
    // best effort: the badge simply re-derives from the in-memory value this session
  }
}

function load(now: number): number {
  try {
    const raw = localStorage.getItem(COLLECTION_SEEN_STORAGE_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  } catch {
    // fall through to "seen now"
  }
  persist(now);
  return now;
}

/** Stable value (same number until the player visits the collection) - safe for useSyncExternalStore. */
export function getCollectionSeenAt(now: number = Date.now()): number {
  if (snapshot === null) snapshot = load(now);
  return snapshot;
}

export function subscribeCollectionSeen(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The player opened the collection: everything obtained so far has been seen. */
export function markCollectionSeen(now: number = Date.now()): void {
  if (snapshot !== null && snapshot >= now) return;
  snapshot = now;
  persist(now);
  for (const l of [...listeners]) l();
}

/** Cards obtained since the player last looked at the collection, most recent first. */
export function newCardIds(marks: CardMarksState, seenAt: number): string[] {
  return Object.entries(marks.obtainedAt)
    .filter(([, at]) => at > seenAt)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

/** Dev/playtest reset (game/devReset.ts) and tests: the next read starts from "seen now" again. */
export function resetCollectionSeen(): void {
  snapshot = null;
  try {
    localStorage.removeItem(COLLECTION_SEEN_STORAGE_KEY);
  } catch {
    // ignore
  }
  for (const l of [...listeners]) l();
}
