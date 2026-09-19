import { getCardAscension } from './definitions';

// Persisted Ascension progression: per card, the rank reached and how many duplicates were spent getting
// there. Only progression state - the card definitions and Ascension paths stay the source of truth, and
// the collection quantity (copies available) lives in game/collection. Same store shape as the
// collection/account: an in-memory snapshot mirroring localStorage, replaced on write, with subscribers.

export const ASCENSION_STORAGE_KEY = 'skyloom:ascension';
export const ASCENSION_VERSION = 1;

export interface CardAscensionState {
  rank: number;
  duplicatesSpent: number;
}

export interface AscensionState {
  version: number;
  cards: Readonly<Record<string, CardAscensionState>>;
}

const whole = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);

/** Keeps only cards that have an Ascension path, clamps rank to the path's length, drops rank-0 entries. */
export function sanitizeAscension(raw: unknown): AscensionState {
  const cards: Record<string, CardAscensionState> = {};
  const src = raw && typeof raw === 'object' ? (raw as { cards?: unknown }).cards : undefined;
  if (src && typeof src === 'object' && !Array.isArray(src)) {
    for (const [cardId, v] of Object.entries(src as Record<string, unknown>)) {
      const def = getCardAscension(cardId);
      if (!def || !v || typeof v !== 'object') continue;
      const rank = Math.min(def.ranks.length, whole((v as { rank?: unknown }).rank));
      if (rank <= 0) continue;
      cards[cardId] = { rank, duplicatesSpent: whole((v as { duplicatesSpent?: unknown }).duplicatesSpent) };
    }
  }
  return { version: ASCENSION_VERSION, cards };
}

let snapshot: AscensionState | null = null;
const listeners = new Set<() => void>();

function load(): AscensionState {
  try {
    const raw = localStorage.getItem(ASCENSION_STORAGE_KEY);
    if (raw !== null) return Object.freeze(sanitizeAscension(JSON.parse(raw)));
  } catch {
    // malformed or unavailable storage: start clean (Base everywhere) rather than crash
  }
  return Object.freeze(sanitizeAscension(null));
}

function commit(next: AscensionState): void {
  snapshot = Object.freeze(next);
  try {
    localStorage.setItem(ASCENSION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // best-effort only
  }
  for (const l of [...listeners]) l();
}

export function getAscensionState(): AscensionState {
  if (!snapshot) snapshot = load();
  return snapshot;
}

export function subscribeAscension(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAscensionRank(cardId: string, state: AscensionState = getAscensionState()): number {
  return state.cards[cardId]?.rank ?? 0;
}

export function getDuplicatesSpent(cardId: string, state: AscensionState = getAscensionState()): number {
  return state.cards[cardId]?.duplicatesSpent ?? 0;
}

/** Records one Ascension step (rank + spent copies). Callers must have already validated and spent the copies - see ascension/ascend.ts. */
export function recordAscension(cardId: string, toRank: number, spent: number): void {
  const state = getAscensionState();
  const prev = state.cards[cardId];
  commit({ ...state, cards: { ...state.cards, [cardId]: { rank: toRank, duplicatesSpent: (prev?.duplicatesSpent ?? 0) + spent } } });
}

/** Ranks for a list of card ids (Base omitted) - what a match takes in as `ascensions.player`. */
export function ascensionRanksFor(cardIds: string[], state: AscensionState = getAscensionState()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of new Set(cardIds)) {
    const r = getAscensionRank(id, state);
    if (r > 0) out[id] = r;
  }
  return out;
}

// ---- Dev / test helpers ----------------------------------------------------------------------

export function setAscensionRank(cardId: string, rank: number): void {
  const state = getAscensionState();
  const next = { ...state.cards };
  const clamped = Math.min(getCardAscension(cardId)?.ranks.length ?? 0, Math.max(0, Math.floor(rank)));
  if (clamped <= 0) delete next[cardId];
  else next[cardId] = { rank: clamped, duplicatesSpent: next[cardId]?.duplicatesSpent ?? 0 };
  commit({ ...state, cards: next });
}

export function resetAscension(): void {
  try {
    localStorage.removeItem(ASCENSION_STORAGE_KEY);
  } catch {
    // ignore
  }
  commit(sanitizeAscension(null));
}

export function reloadAscension(): void {
  snapshot = null;
  for (const l of [...listeners]) l();
}
