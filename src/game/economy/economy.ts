import { MAX_GEMS, MAX_GOLD, MAX_TICKETS, type GemSource, type GoldSource, type TicketSource } from './config';
import { clearStoredEconomy, defaultEconomy, readStoredEconomy, sanitizeEconomy, writeStoredEconomy } from './persistence';
import type { GemGrantResult, GoldGrantResult, PlayerEconomy, SummonHistoryEntry, TicketGrantResult } from './types';
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

// ---- Gold ---------------------------------------------------------------------------------------
// Same shape as Gems, deliberately: a second earn/spend pair rather than a variant of grantGems/spendGems,
// so Gold and Gems can never accidentally share a code path that assumes "the one currency".

export function getGold(): number {
  return getEconomy().gold;
}

export function canAffordGold(amount: number, gold: number = getGold()): boolean {
  if (!Number.isInteger(amount) || amount < 0) return false;
  return isUnlimitedGems() || gold >= amount;
}

/** Adds Gold (whole, positive; balance is capped at MAX_GOLD). Returns what was actually added. */
export function grantGold(amount: number, source: GoldSource): GoldGrantResult {
  const economy = getEconomy();
  const want = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const balance = Math.min(MAX_GOLD, economy.gold + want);
  const gained = balance - economy.gold;
  if (gained > 0) commit({ ...economy, gold: balance });
  return { gained, balance, source };
}

/** Removes Gold. Returns false - changing nothing - for a non-whole/negative amount or one the player can't afford. */
export function spendGold(amount: number): boolean {
  const economy = getEconomy();
  if (!canAffordGold(amount, economy.gold)) return false;
  if (amount > 0 && !isUnlimitedGems()) commit({ ...economy, gold: economy.gold - amount });
  return true;
}

export function setGold(amount: number): void {
  commit(sanitizeEconomy({ ...getEconomy(), gold: amount }));
}

// ---- Summon Tickets (Commercial Prototype Phase 7) -----------------------------------------------
// Same shape as Gold/Gems again. Tickets are earn-only (missions, journey) - there is deliberately no
// "buy Tickets" path anywhere, so unlike Gems there is no future purchase path to keep this shape ready
// for; it exists purely so a Summon can be paid for without touching Gems at all.

export function getTickets(): number {
  return getEconomy().tickets;
}

export function canAffordTickets(amount: number, tickets: number = getTickets()): boolean {
  if (!Number.isInteger(amount) || amount < 0) return false;
  return isUnlimitedGems() || tickets >= amount;
}

/** Adds Tickets (whole, positive; balance is capped at MAX_TICKETS). Returns what was actually added. */
export function grantTickets(amount: number, source: TicketSource): TicketGrantResult {
  const economy = getEconomy();
  const want = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const balance = Math.min(MAX_TICKETS, economy.tickets + want);
  const gained = balance - economy.tickets;
  if (gained > 0) commit({ ...economy, tickets: balance });
  return { gained, balance, source };
}

/** Removes Tickets. Returns false - changing nothing - for a non-whole/negative amount or one the player can't afford. */
export function spendTickets(amount: number): boolean {
  const economy = getEconomy();
  if (!canAffordTickets(amount, economy.tickets)) return false;
  if (amount > 0 && !isUnlimitedGems()) commit({ ...economy, tickets: economy.tickets - amount });
  return true;
}

export function setTickets(amount: number): void {
  commit(sanitizeEconomy({ ...getEconomy(), tickets: amount }));
}

// ---- Summon state -----------------------------------------------------------------------------

export function getSummonState(): PlayerEconomy['summon'] {
  return getEconomy().summon;
}

/** Pulls since the last Legendary on this banner - shared by Gem and Ticket pulls alike (never a second pool). */
export function getPity(bannerId: string): number {
  return getEconomy().summon.pity[bannerId] ?? 0;
}

/**
 * Spends `cost` of either Gems or Tickets and records the banner's pity counter + history in ONE write -
 * both payment methods feed the exact same `summon.pity`/`summon.history`, by construction: this is the
 * single write path either one goes through, and `bannerId` is the only pity key that exists. Returns
 * false (changing nothing) when the player can't afford it. `entries` are the pulls in order; history
 * keeps the newest first.
 */
export function commitSummon(cost: number, bannerId: string, pityAfter: number, entries: SummonHistoryEntry[], currency: 'gems' | 'tickets' = 'gems'): boolean {
  const economy = getEconomy();
  const balance = currency === 'gems' ? economy.gems : economy.tickets;
  const afford = currency === 'gems' ? canAfford(cost, balance) : canAffordTickets(cost, balance);
  if (!afford) return false;
  const history = [...[...entries].reverse(), ...economy.summon.history].slice(0, SUMMON_CONFIG.historyLimit);
  const pity = { ...economy.summon.pity, [bannerId]: pityAfter };
  const spend = isUnlimitedGems() ? balance : balance - cost;
  commit({ ...economy, [currency === 'gems' ? 'gems' : 'tickets']: spend, summon: { pity, history } });
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
