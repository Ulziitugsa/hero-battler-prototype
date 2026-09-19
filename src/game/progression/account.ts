import { MASTERIES, MASTERY_ORDER, isMasteryId, type MasteryId } from '../mastery/definitions';
import type { MasteryLoadout } from '../types';
import { MASTERY_POINT_LEVELS, MASTERY_RANK_UP_COST, MAX_LEVEL, xpToNextLevel } from './config';
import { clearStoredAccount, defaultAccount, readStoredAccount, sanitizeAccount, writeStoredAccount } from './persistence';
import type { AccountState, XpGrantResult } from './types';

// The single source of truth for account progression. Same shape as the collection store: an in-memory
// snapshot mirroring localStorage, replaced on every write, with subscribers - so any mounted screen
// updates the moment XP is granted, no reload, no state library.
//
// MIGRATION NOTE: a save with no account state starts at Level 1 / 0 XP. Existing Campaign clears are
// deliberately NOT converted into retroactive XP - this is a prototype and a clean, predictable start
// (with the starting Mastery already usable) beats a one-off giant grant nobody can reason about.

let snapshot: AccountState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

function commit(next: AccountState): void {
  snapshot = Object.freeze({ ...next, unlockedMasteries: { ...next.unlockedMasteries } });
  writeStoredAccount(snapshot);
  emit();
}

/** Unlocks (at rank 1) every implemented Mastery whose unlock level has been reached. Returns the newly unlocked ids. */
function unlockForLevel(account: AccountState): MasteryId[] {
  const added: MasteryId[] = [];
  for (const id of MASTERY_ORDER) {
    const def = MASTERIES[id];
    if (def.implemented && def.unlockLevel <= account.level && !account.unlockedMasteries[id]) {
      account.unlockedMasteries[id] = 1;
      added.push(id);
    }
  }
  return added;
}

function load(): AccountState {
  const stored = readStoredAccount();
  const account = stored.status === 'ok' ? stored.account : defaultAccount();
  unlockForLevel(account); // self-heal: level and unlocks can never disagree
  if (stored.status !== 'ok') writeStoredAccount(account);
  return Object.freeze(account);
}

export function getAccount(): AccountState {
  if (!snapshot) snapshot = load();
  return snapshot;
}

export function subscribeAccount(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---- Derived values (never stored) ------------------------------------------------------------

export function masteryPointsEarned(level: number): number {
  return MASTERY_POINT_LEVELS.filter((l) => l <= level).length;
}

/** Points spent = one cost per rank above 1, summed over unlocked Masteries. */
export function masteryPointsSpent(account: AccountState): number {
  return Object.values(account.unlockedMasteries).reduce((sum, rank) => sum + Math.max(0, (rank ?? 1) - 1) * MASTERY_RANK_UP_COST, 0);
}

export function masteryPointsAvailable(account: AccountState = getAccount()): number {
  return Math.max(0, masteryPointsEarned(account.level) * MASTERY_RANK_UP_COST - masteryPointsSpent(account));
}

export function getMasteryRank(id: MasteryId, account: AccountState = getAccount()): number {
  return account.unlockedMasteries[id] ?? 0;
}

// ---- XP / levels ------------------------------------------------------------------------------

/** Adds XP, rolling over as many levels as it earns (excess carries; nothing is lost). Stops accruing at MAX_LEVEL. */
export function grantXp(amount: number): XpGrantResult {
  const before = getAccount();
  const gained = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const next: AccountState = { ...before, unlockedMasteries: { ...before.unlockedMasteries } };
  const levelsGained: number[] = [];
  next.totalXp += gained;
  if (next.level < MAX_LEVEL) {
    next.xp += gained;
    while (next.level < MAX_LEVEL && next.xp >= xpToNextLevel(next.level)) {
      next.xp -= xpToNextLevel(next.level);
      next.level += 1;
      levelsGained.push(next.level);
    }
  }
  if (next.level >= MAX_LEVEL) next.xp = 0;
  const masteriesUnlocked = unlockForLevel(next);
  if (gained > 0) commit(next);
  return {
    gained,
    levelBefore: before.level,
    levelAfter: next.level,
    levelsGained,
    xpAfter: next.xp,
    masteriesUnlocked,
    masteryPointsGained: masteryPointsEarned(next.level) - masteryPointsEarned(before.level),
  };
}

// ---- Mastery ----------------------------------------------------------------------------------

/** Equips one Mastery (or none with null). Fails - changing nothing - for a locked, unknown or not-yet-implemented Mastery. */
export function equipMastery(id: MasteryId | null): boolean {
  const account = getAccount();
  if (id === null) {
    commit({ ...account, equippedMasteryId: null });
    return true;
  }
  if (!isMasteryId(id) || !MASTERIES[id].implemented || !account.unlockedMasteries[id]) return false;
  commit({ ...account, equippedMasteryId: id });
  return true;
}

export function canUpgradeMastery(id: MasteryId, account: AccountState = getAccount()): boolean {
  const rank = account.unlockedMasteries[id];
  if (!rank || !MASTERIES[id].implemented) return false;
  return rank < MASTERIES[id].ranks.length && masteryPointsAvailable(account) >= MASTERY_RANK_UP_COST;
}

/** Spends one Mastery Point to raise a Mastery one rank. */
export function upgradeMastery(id: MasteryId): boolean {
  const account = getAccount();
  if (!canUpgradeMastery(id, account)) return false;
  commit({ ...account, unlockedMasteries: { ...account.unlockedMasteries, [id]: (account.unlockedMasteries[id] ?? 1) + 1 } });
  return true;
}

/** What the battle engine takes into a match, or null with nothing equipped. Only the id + rank - transient trigger state lives in the match. */
export function getEquippedLoadout(account: AccountState = getAccount()): MasteryLoadout | null {
  const id = account.equippedMasteryId;
  if (!id) return null;
  const rank = account.unlockedMasteries[id];
  return rank ? { id, rank } : null;
}

// ---- Dev / test helpers (exposed to the UI only through devTools.ts, dev server only) -----------

export function setLevel(level: number): void {
  const next = sanitizeAccount({ ...getAccount(), level, xp: 0 });
  unlockForLevel(next);
  commit(next);
}

export function unlockMastery(id: MasteryId, rank = 1): void {
  const account = getAccount();
  commit(sanitizeAccount({ ...account, unlockedMasteries: { ...account.unlockedMasteries, [id]: rank } }));
}

export function setMasteryRank(id: MasteryId, rank: number): void {
  unlockMastery(id, rank);
}

export function resetProgression(): void {
  clearStoredAccount();
  snapshot = null;
  commit(load());
}

/** Drops the in-memory snapshot so the next read comes from storage (tests, or storage changed externally). */
export function reloadAccount(): void {
  snapshot = null;
  emit();
}
