import { getCard } from '../cards';
import { HERO_LEVEL_VERSION, type HeroLevelState } from './types';
import { MAX_HERO_LEVEL } from './config';

// Persisted Hero Level progression: per card, the level reached. Same store shape as ascension/store.ts -
// an in-memory snapshot mirroring localStorage, replaced on write, with subscribers - and the same
// "only store what isn't the default" convention (Level 1 is never written explicitly).

export const HERO_LEVEL_STORAGE_KEY = 'skyloom:heroLevel';

const whole = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 0);

function isRealCard(cardId: string): boolean {
  try {
    getCard(cardId);
    return true;
  } catch {
    return false;
  }
}

/** Keeps only real card ids, clamps level to [1, MAX_HERO_LEVEL], drops Level-1 entries (the implicit default). */
export function sanitizeHeroLevel(raw: unknown): HeroLevelState {
  const levels: Record<string, number> = {};
  const src = raw && typeof raw === 'object' ? (raw as { levels?: unknown }).levels : undefined;
  if (src && typeof src === 'object' && !Array.isArray(src)) {
    for (const [cardId, v] of Object.entries(src as Record<string, unknown>)) {
      if (!isRealCard(cardId)) continue;
      const level = Math.max(1, Math.min(MAX_HERO_LEVEL, whole(v)));
      if (level > 1) levels[cardId] = level;
    }
  }
  return { version: HERO_LEVEL_VERSION, levels };
}

let snapshot: HeroLevelState | null = null;
const listeners = new Set<() => void>();

function load(): HeroLevelState {
  try {
    const raw = localStorage.getItem(HERO_LEVEL_STORAGE_KEY);
    if (raw !== null) return Object.freeze(sanitizeHeroLevel(JSON.parse(raw)));
  } catch {
    // malformed or unavailable storage: start clean (everyone at Level 1) rather than crash
  }
  return Object.freeze(sanitizeHeroLevel(null));
}

function commit(next: HeroLevelState): void {
  snapshot = Object.freeze(next);
  try {
    localStorage.setItem(HERO_LEVEL_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // best-effort only
  }
  for (const l of [...listeners]) l();
}

export function getHeroLevelState(): HeroLevelState {
  if (!snapshot) snapshot = load();
  return snapshot;
}

export function subscribeHeroLevel(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getHeroLevel(cardId: string, state: HeroLevelState = getHeroLevelState()): number {
  return state.levels[cardId] ?? 1;
}

/** Records a new level for a card. Callers must have already validated and spent the Gold - see heroLevel/levelUp.ts. */
export function recordHeroLevel(cardId: string, level: number): void {
  const state = getHeroLevelState();
  const next = { ...state.levels };
  if (level > 1) next[cardId] = level;
  else delete next[cardId];
  commit({ ...state, levels: next });
}

/** Levels for a list of card ids (Level 1 omitted) - what a match takes in as `heroLevels.player`, mirroring ascension/store.ts's ascensionRanksFor. */
export function heroLevelsFor(cardIds: string[], state: HeroLevelState = getHeroLevelState()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of new Set(cardIds)) {
    const level = getHeroLevel(id, state);
    if (level > 1) out[id] = level;
  }
  return out;
}

// ---- Dev / test helpers ------------------------------------------------------------------------

export function setHeroLevel(cardId: string, level: number): void {
  const clamped = Math.max(1, Math.min(MAX_HERO_LEVEL, Math.floor(level)));
  recordHeroLevel(cardId, clamped);
}

export function resetHeroLevels(): void {
  try {
    localStorage.removeItem(HERO_LEVEL_STORAGE_KEY);
  } catch {
    // ignore
  }
  commit(sanitizeHeroLevel(null));
}

export function reloadHeroLevels(): void {
  snapshot = null;
  for (const l of [...listeners]) l();
}
