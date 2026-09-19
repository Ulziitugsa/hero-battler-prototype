import { MASTERIES, MAX_MASTERY_RANK, isMasteryId, type MasteryId } from '../mastery/definitions';
import { MAX_LEVEL, STARTING_MASTERY, xpToNextLevel } from './config';
import { ACCOUNT_VERSION, type AccountState } from './types';

// Centralised localStorage access for account progression - same conventions as collection/localDecks:
// try/catch-wrapped, never throws, malformed data is sanitised rather than trusted.

export const ACCOUNT_STORAGE_KEY = 'skyloom:account';

/** A brand-new profile: Level 1, 0 XP, the starting Mastery unlocked at rank 1 and equipped. */
export function defaultAccount(): AccountState {
  return { version: ACCOUNT_VERSION, level: 1, xp: 0, totalXp: 0, unlockedMasteries: { [STARTING_MASTERY]: 1 }, equippedMasteryId: STARTING_MASTERY };
}

const whole = (n: unknown, fallback: number): number => (typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : fallback);

/** Coerces anything into a valid AccountState: clamps level/xp, drops unknown Masteries, caps ranks, un-equips anything not unlocked/implemented. */
export function sanitizeAccount(raw: unknown): AccountState {
  if (!raw || typeof raw !== 'object') return defaultAccount();
  const r = raw as Partial<Record<keyof AccountState, unknown>>;
  const level = Math.max(1, Math.min(MAX_LEVEL, whole(r.level, 1)));
  let xp = Math.max(0, whole(r.xp, 0));
  xp = level >= MAX_LEVEL ? 0 : Math.min(xp, xpToNextLevel(level) - 1);
  const totalXp = Math.max(0, whole(r.totalXp, 0));

  const unlockedMasteries: Partial<Record<MasteryId, number>> = {};
  if (r.unlockedMasteries && typeof r.unlockedMasteries === 'object') {
    for (const [id, rank] of Object.entries(r.unlockedMasteries as Record<string, unknown>)) {
      if (!isMasteryId(id)) continue;
      unlockedMasteries[id] = Math.max(1, Math.min(MASTERIES[id].ranks.length, MAX_MASTERY_RANK, whole(rank, 1)));
    }
  }
  const equipped = isMasteryId(r.equippedMasteryId) && unlockedMasteries[r.equippedMasteryId] && MASTERIES[r.equippedMasteryId].implemented ? r.equippedMasteryId : null;
  return { version: ACCOUNT_VERSION, level, xp, totalXp, unlockedMasteries, equippedMasteryId: equipped };
}

export type StoredAccount = { status: 'missing' } | { status: 'malformed' } | { status: 'ok'; account: AccountState };

export function readStoredAccount(): StoredAccount {
  let raw: string | null;
  try {
    raw = localStorage.getItem(ACCOUNT_STORAGE_KEY);
  } catch {
    return { status: 'missing' };
  }
  if (raw === null) return { status: 'missing' };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { status: 'malformed' };
    return { status: 'ok', account: sanitizeAccount(parsed) };
  } catch {
    return { status: 'malformed' };
  }
}

export function writeStoredAccount(account: AccountState): void {
  try {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
  } catch {
    // best-effort only - the in-memory copy still serves this session
  }
}

export function clearStoredAccount(): void {
  try {
    localStorage.removeItem(ACCOUNT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
