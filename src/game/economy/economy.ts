import { MAX_GEMS, type GemSource } from './config';
import { clearStoredEconomy, defaultEconomy, readStoredEconomy, sanitizeEconomy, writeStoredEconomy } from './persistence';
import type { GemGrantResult, PlayerEconomy, SummonHistoryEntry } from './types';
import { SUMMON_CONFIG } from '../summon/config';

// The single source of truth for Gems and the Summon counters. Same shape as the collection/account
// stores: an in-memory snapshot mirroring localStorage, replaced on every write, with subscribers - so
// any mounted screen updates the moment Gems change. Every mutation goes through this file.
//
// MIGRATION NOTE: a save with no economy state starts with STARTING_GEMS (one single Summon). Previous
// Campaign clears are deliberately NOT converted into retroactive Gems; use skyloomDev.addGems() to test.
// v1 -> v2 (per-banner pity): the old single pity counter is dropped; Gems and history carry over.
//
// CRASH-SAFETY NOTE: Gems, pity and history are ONE document, so a Summon's spend + pity + history are a
// single atomic write. The pulled cards are written to the collection store afterwards (a second key), so
// a crash between the two writes would cost the Gems without delivering the cards. localStorage has no
// cross-key transaction; for a local prototype that window is a few synchronous microseconds.

let snapshot: PlayerEconomy | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

function commit(next: PlayerEconomy): void {
  snapshot = Object.freeze({ ...next, summon: Object.freeze({ pity: { ...next.summon.pity }, history: [...next.summon.history] }) }) as PlayerEconomy;
  writeStoredEconomy(snapshot);
  emit();
}

function load(): PlayerEconomy {
  const stored = readStoredEconomy();
  if (stored.status === 'ok') return stored.economy;
  const fresh = defaultEconomy();
  writeStoredEconomy(fresh);
  return fresh;
}

/** Stable snapshot (same object until something changes) - safe for useSyncExternalStore. */
export function getEconomy(): PlayerEconomy {
  if (!snapshot) snapshot = load();
  return snapshot;
}

export function subscribeEconomy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---- Dev-only Unlimited Gems -----------------------------------------------------------------
// A testing aid so animations can be inspected without earning Gems. It exists ONLY when
// import.meta.env.DEV is true (the Vite dev server / vitest): a production build compiles the checks to
// `false`, the flag can't be read from storage or switched on, and every affordability check uses the real balance.

const UNLIMITED_KEY = 'skyloom:dev:unlimitedGems';
let unlimitedGems = false;
if (import.meta.env.DEV) {
  try {
    unlimitedGems = localStorage.getItem(UNLIMITED_KEY) === '1';
  } catch {
    // ignore
  }
}

export function isUnlimitedGems(): boolean {
  return import.meta.env.DEV && unlimitedGems;
}

export function setUnlimitedGems(on: boolean): void {
  if (!import.meta.env.DEV) return;
  unlimitedGems = on;
  try {
    localStorage.setItem(UNLIMITED_KEY, on ? '1' : '0');
  } catch {
    // ignore
  }
  emit();
}

/** Subscribable for useSyncExternalStore. */
export function subscribeUnlimited(listener: () => void): () => void {
  return subscribeEconomy(listener);
}

// ---- Gems -------------------------------------------------------------------------------------

export function getGems(): number {
  return getEconomy().gems;
}

export function canAfford(amount: number, gems: number = getGems()): boolean {
  if (!Number.isInteger(amount) || amount < 0) return false;
  return isUnlimitedGems() || gems >= amount;
}

/** Adds Gems (whole, positive; balance is capped at MAX_GEMS). Returns what was actually added. */
export function grantGems(amount: number, source: GemSource): GemGrantResult {
  const economy = getEconomy();
  const want = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const balance = Math.min(MAX_GEMS, economy.gems + want);
  const gained = balance - economy.gems;
  if (gained > 0) commit({ ...economy, gems: balance });
  return { gained, balance, source };
}

/** Removes Gems. Returns false - changing nothing - for a non-whole/negative amount or one the player can't afford. (Unlimited Gems, dev only, succeeds without deducting.) */
export function spendGems(amount: number): boolean {
  const economy = getEconomy();
  if (!canAfford(amount, economy.gems)) return false;
  if (amount > 0 && !isUnlimitedGems()) commit({ ...economy, gems: economy.gems - amount });
  return true;
}

// ---- Summon state -----------------------------------------------------------------------------

export function getSummonState(): PlayerEconomy['summon'] {
  return getEconomy().summon;
}

/** Pulls since the last Legendary on this banner. */
export function getPity(bannerId: string): number {
  return getEconomy().summon.pity[bannerId] ?? 0;
}

/**
 * Spends `cost` Gems and records the banner's pity counter + history in ONE write. Returns false (changing
 * nothing) when the player can't afford it. `entries` are the pulls in order; history keeps the newest first.
 */
export function commitSummon(cost: number, bannerId: string, pityAfter: number, entries: SummonHistoryEntry[]): boolean {
  const economy = getEconomy();
  if (!canAfford(cost, economy.gems)) return false;
  const history = [...[...entries].reverse(), ...economy.summon.history].slice(0, SUMMON_CONFIG.historyLimit);
  const pity = { ...economy.summon.pity, [bannerId]: pityAfter };
  commit({ ...economy, gems: isUnlimitedGems() ? economy.gems : economy.gems - cost, summon: { pity, history } });
  return true;
}

// ---- Dev / test helpers (exposed to the UI only through devTools.ts, dev server only) -----------

export function setGems(amount: number): void {
  commit(sanitizeEconomy({ ...getEconomy(), gems: amount }));
}

export function setPity(bannerId: string, pity: number): void {
  const economy = getEconomy();
  commit(sanitizeEconomy({ ...economy, summon: { ...economy.summon, pity: { ...economy.summon.pity, [bannerId]: pity } } }));
}

/** Clears every banner's pity and the history (Gems are kept). */
export function resetSummonState(): void {
  commit({ ...getEconomy(), summon: { pity: {}, history: [] } });
}

/** Back to a brand-new economy (STARTING_GEMS, no pity, no history). */
export function resetEconomy(): void {
  clearStoredEconomy();
  snapshot = null;
  commit(load());
}

/** Drops the in-memory snapshot so the next read comes from storage (tests, or storage changed externally). */
export function reloadEconomy(): void {
  snapshot = null;
  emit();
}
