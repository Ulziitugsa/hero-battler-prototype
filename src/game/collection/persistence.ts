import { ALL_CARDS } from '../cards';
import { COLLECTION_VERSION, type OwnedMap, type PersistedCollection } from './types';

// Centralised localStorage access for the collection - UI never touches storage directly. Same
// convention as localDecks.ts / preferences.ts: try/catch-wrapped, never throws, sane fallbacks.

export const COLLECTION_STORAGE_KEY = 'skyloom:collection';
const MAX_COPIES_TRACKED = 99;
const KNOWN_IDS = new Set(ALL_CARDS.map((c) => c.id));

/** Keeps only real card ids with a positive whole quantity. Unknown ids and zero/negative/NaN counts are dropped, never invented. */
export function sanitizeOwned(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    if (!KNOWN_IDS.has(id)) continue;
    const count = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 0;
    if (count > 0) out[id] = Math.min(count, MAX_COPIES_TRACKED);
  }
  return out;
}

export type StoredState = { status: 'missing' } | { status: 'malformed' } | { status: 'ok'; owned: Record<string, number> };

export function readStoredCollection(): StoredState {
  let raw: string | null;
  try {
    raw = localStorage.getItem(COLLECTION_STORAGE_KEY);
  } catch {
    return { status: 'missing' };
  }
  if (raw === null) return { status: 'missing' };
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedCollection> | null;
    if (!parsed || typeof parsed !== 'object') return { status: 'malformed' };
    // Version 1 is the only shape so far; a future version bump would branch here.
    return { status: 'ok', owned: sanitizeOwned(parsed.owned) };
  } catch {
    return { status: 'malformed' };
  }
}

export function writeStoredCollection(owned: OwnedMap): void {
  const payload: PersistedCollection = { version: COLLECTION_VERSION, owned: { ...owned } };
  try {
    localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // best-effort only - the in-memory copy still serves this session
  }
}

export function clearStoredCollection(): void {
  try {
    localStorage.removeItem(COLLECTION_STORAGE_KEY);
  } catch {
    // ignore
  }
}
