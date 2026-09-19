import { getCard } from '../cards';
import { PLAYTEST_ROSTER } from '../cards/roster';
import { maxCopiesFor } from '../engine/deckRules';
import { buildStarterCollection } from './starterCollection';
import { clearStoredCollection, readStoredCollection, sanitizeOwned, writeStoredCollection } from './persistence';
import type { GrantResult, OwnedMap } from './types';

// The single source of truth for what the player owns. An in-memory snapshot mirrors localStorage;
// every write updates both and notifies subscribers, so screens that are mounted (or mount later in
// the same session) see changes immediately with no reload and no state library.

let snapshot: OwnedMap | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

function commit(next: Record<string, number>): void {
  snapshot = Object.freeze(next);
  writeStoredCollection(snapshot);
  emit();
}

/** Loads from storage, initialising the starter collection when nothing usable is stored. An existing collection is preserved as-is. */
function load(): OwnedMap {
  const stored = readStoredCollection();
  if (stored.status === 'ok') return Object.freeze(stored.owned);
  const starter = { ...buildStarterCollection() };
  writeStoredCollection(starter);
  return Object.freeze(starter);
}

/** Stable snapshot (same object until the collection changes) - safe for useSyncExternalStore. */
export function getCollection(): OwnedMap {
  if (!snapshot) snapshot = load();
  return snapshot;
}

export function subscribeCollection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOwnedCount(cardId: string, owned: OwnedMap = getCollection()): number {
  return owned[cardId] ?? 0;
}

export function ownsCard(cardId: string, owned: OwnedMap = getCollection()): boolean {
  return getOwnedCount(cardId, owned) > 0;
}

/** Copies of a card the player can actually put in a deck: min(owned, the game's copy limit). */
export function usableCopies(cardId: string, owned: OwnedMap = getCollection()): number {
  return Math.min(getOwnedCount(cardId, owned), maxCopiesFor(cardId));
}

/** Adds copies. Returns null (and changes nothing) for an unknown card id or a non-positive count. */
export function grantCard(cardId: string, count = 1): GrantResult | null {
  if (!Number.isInteger(count) || count < 1) return null;
  try {
    getCard(cardId);
  } catch {
    return null;
  }
  const current = getCollection();
  const previous = getOwnedCount(cardId, current);
  commit(sanitizeOwned({ ...current, [cardId]: previous + count }));
  const owned = getOwnedCount(cardId);
  return { cardId, granted: owned - previous, previous, owned, isNew: previous === 0 };
}

/** Dev/test only - removes copies (down to zero). */
export function removeCard(cardId: string, count = 1): void {
  const current = getCollection();
  const left = getOwnedCount(cardId, current) - count;
  const next = { ...current };
  if (left > 0) next[cardId] = left;
  else delete next[cardId];
  commit(next);
}

/** Dev/test only - every roster card, `copies` each. */
export function setAllOwned(copies = 2): void {
  commit(Object.fromEntries(PLAYTEST_ROSTER.map((id) => [id, copies])));
}

/** Dev/test only - replace the whole collection (sanitised). */
export function setCollection(owned: Record<string, number>): void {
  commit(sanitizeOwned(owned));
}

/** Dev/test only - back to the deterministic starter collection. */
export function resetCollection(): void {
  commit({ ...buildStarterCollection() });
}

/** Drops the in-memory snapshot so the next read comes from storage (tests, or storage changed out from under us). */
export function reloadCollection(): void {
  snapshot = null;
  emit();
}

/** Removes the stored collection entirely - the next read initialises a fresh starter collection. */
export function clearCollection(): void {
  clearStoredCollection();
  reloadCollection();
}

export { buildStarterCollection };
