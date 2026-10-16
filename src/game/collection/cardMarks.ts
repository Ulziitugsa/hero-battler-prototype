// Player-side marks on cards that sit beside the collection rather than inside it: which cards are
// favorited, when each card was last obtained (for "Recently obtained" sorting) and when its first copy
// arrived (for the Cards tab's "new cards" marker - a duplicate is not a new card). Kept in its own
// additive storage key so the collection's copy-count model and its save version stay untouched - an
// old save simply has no marks yet. Same store shape as the collection: in-memory snapshot mirroring
// localStorage, replaced on write, with subscribers for useSyncExternalStore.

export const CARD_MARKS_STORAGE_KEY = 'skyloom:cardMarks';
export const CARD_MARKS_VERSION = 1;

export interface CardMarksState {
  version: number;
  /** Favorited card ids, most recently favorited last. */
  favorites: readonly string[];
  /** card id -> epoch ms of the most recent grant. Cards owned before this store existed have no entry. */
  obtainedAt: Readonly<Record<string, number>>;
  /**
   * card id -> epoch ms its first copy was granted (the collection went from 0 to owning it). Added after
   * obtainedAt, so cards owned before it existed have no entry and are never announced as new.
   */
  firstObtainedAt: Readonly<Record<string, number>>;
}

const EMPTY: CardMarksState = Object.freeze({ version: CARD_MARKS_VERSION, favorites: Object.freeze([]), obtainedAt: Object.freeze({}), firstObtainedAt: Object.freeze({}) });

function sanitizeTimes(raw: unknown): Record<string, number> {
  const times: Record<string, number> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [id, t] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof t === 'number' && Number.isFinite(t) && t > 0) times[id] = t;
    }
  }
  return times;
}

/** Drops anything malformed; never invents data. */
export function sanitizeCardMarks(raw: unknown): CardMarksState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY;
  const src = raw as { favorites?: unknown; obtainedAt?: unknown; firstObtainedAt?: unknown };
  const favorites = Array.isArray(src.favorites) ? [...new Set(src.favorites.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [];
  return { version: CARD_MARKS_VERSION, favorites, obtainedAt: sanitizeTimes(src.obtainedAt), firstObtainedAt: sanitizeTimes(src.firstObtainedAt) };
}

let snapshot: CardMarksState | null = null;
const listeners = new Set<() => void>();

function load(): CardMarksState {
  try {
    const raw = localStorage.getItem(CARD_MARKS_STORAGE_KEY);
    return raw ? sanitizeCardMarks(JSON.parse(raw)) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function commit(next: CardMarksState): void {
  snapshot = Object.freeze(next);
  try {
    localStorage.setItem(CARD_MARKS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // best-effort only
  }
  for (const l of [...listeners]) l();
}

export function getCardMarks(): CardMarksState {
  if (!snapshot) snapshot = load();
  return snapshot;
}

export function subscribeCardMarks(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isFavorite(cardId: string, marks: CardMarksState = getCardMarks()): boolean {
  return marks.favorites.includes(cardId);
}

export function toggleFavorite(cardId: string): boolean {
  const marks = getCardMarks();
  const on = !marks.favorites.includes(cardId);
  commit({ ...marks, favorites: on ? [...marks.favorites, cardId] : marks.favorites.filter((id) => id !== cardId) });
  return on;
}

/** Called by the collection on every grant; `firstCopy` when the player did not own the card before it. `now` is injectable for tests. */
export function recordCardObtained(cardId: string, firstCopy: boolean, now: number = Date.now()): void {
  const marks = getCardMarks();
  commit({ ...marks, obtainedAt: { ...marks.obtainedAt, [cardId]: now }, firstObtainedAt: firstCopy ? { ...marks.firstObtainedAt, [cardId]: now } : marks.firstObtainedAt });
}

/** Drops the in-memory snapshot so the next read comes from storage (tests). */
export function reloadCardMarks(): void {
  snapshot = null;
  for (const l of [...listeners]) l();
}

/** Dev/playtest only. See game/devReset.ts. */
export function resetCardMarks(): void {
  try {
    localStorage.removeItem(CARD_MARKS_STORAGE_KEY);
  } catch {
    // ignore
  }
  reloadCardMarks();
}
