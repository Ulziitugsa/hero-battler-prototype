import { MAX_GEMS, MAX_GOLD, MAX_TICKETS, type GemSource, type GoldSource, type TicketSource } from './config';
import { clearStoredEconomy, defaultEconomy, readStoredEconomy, sanitizeEconomy, writeStoredEconomy } from './persistence';
import type { GemGrantResult, GoldGrantResult, PlayerEconomy, TicketGrantResult } from './types';

// The single source of truth for Gems, Gold and Pack Tickets. Same shape as the collection/account
// stores: an in-memory snapshot mirroring localStorage, replaced on every write, with subscribers - so
// any mounted screen updates the moment Gems change. Every mutation goes through this file.
//
// MIGRATION NOTE: a save with no economy state starts with STARTING_GEMS. Previous
// Campaign clears are deliberately NOT converted into retroactive Gems; use skyloomDev.addGems() to test.
// v1 -> v2 (per-banner pity): the old single pity counter is dropped; Gems and history carry over.
//
// The retired Moonwell Summon's per-banner guarantee counters and pull history stay in this document, read-only
// (legacySummon.ts): nothing writes them any more, and they are saved back unchanged.
//
// CRASH-SAFETY NOTE: opening packs spends here first, then writes the Box and the collection (other keys), so a
// crash between the writes could cost the price without delivering the cards. localStorage has no cross-key
// transaction; for a local prototype that window is a few synchronous microseconds.

let snapshot: PlayerEconomy | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

function commit(next: PlayerEconomy): void {
  snapshot = Object.freeze({ ...next, grants: Object.freeze([...next.grants]), summon: Object.freeze({ pity: { ...next.summon.pity }, history: [...next.summon.history] }) }) as PlayerEconomy;
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
// A testing aid so animations can be inspected without earning Gems. The stored switch exists ONLY when
// import.meta.env.DEV is true (the Vite dev server / vitest): a production build can't read it from storage or switch
// it on, and follows UNLIMITED_GEMS_IN_PRODUCTION below instead.

const UNLIMITED_KEY = 'skyloom:dev:unlimitedGems';
let unlimitedGems = false;
if (import.meta.env.DEV) {
  try {
    unlimitedGems = localStorage.getItem(UNLIMITED_KEY) === '1';
  } catch {
    // ignore
  }
}

/**
 * TEMPORARY (ozi, 2026-10-04): production builds play with unlimited Gems while the economy is being tested. Spends pass
 * without deducting and the balance shows as infinite; the stored balance is untouched, so setting this back to false
 * restores every player's real Gems. Turn it off before any real playtest or launch.
 */
export const UNLIMITED_GEMS_IN_PRODUCTION = true;

export function isUnlimitedGems(): boolean {
  if (!import.meta.env.DEV) return UNLIMITED_GEMS_IN_PRODUCTION;
  return unlimitedGems;
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

/** Removes Gems. Returns false - changing nothing - for a non-whole/negative amount or one the player can't afford. (Unlimited Gems succeeds without deducting.) */
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

/** True once the one-time grant `grantId` has been paid. */
export function hasGrant(grantId: string): boolean {
  return getEconomy().grants.includes(grantId);
}

/**
 * Pays a one-time Gold grant (a refund, a migration award) at most once per save: the Gold and the grant id land in the
 * same single-document write, so a crash can't pay it without recording it, and a second call is a no-op. Returns
 * whether this call paid it.
 */
export function grantGoldOnce(grantId: string, amount: number, source: GoldSource): GoldGrantResult & { paid: boolean } {
  const economy = getEconomy();
  if (economy.grants.includes(grantId)) return { gained: 0, balance: economy.gold, source, paid: false };
  const want = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const balance = Math.min(MAX_GOLD, economy.gold + want);
  commit({ ...economy, gold: balance, grants: [...economy.grants, grantId] });
  return { gained: balance - economy.gold, balance, source, paid: true };
}

export function setGold(amount: number): void {
  commit(sanitizeEconomy({ ...getEconomy(), gold: amount }));
}

// ---- Pack Tickets -------------------------------------------------------------------------------
// Same shape as Gold/Gems again. One Pack Ticket opens one pack of a finite Box instead of paying its Gem price
// (box/boxProduct.ts). Tickets are earn-only (missions, journey, offers) - there is deliberately no "buy Tickets"
// path anywhere. (They were Summon Tickets until the Moonwell Summon was retired; a save keeps its balance.)

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

// ---- Retired Summon record (read-only; see legacySummon.ts) -----------------------------------

export function getSummonState(): PlayerEconomy['summon'] {
  return getEconomy().summon;
}

// ---- Dev / test helpers (exposed to the UI only through devTools.ts, dev server only) -----------

export function setGems(amount: number): void {
  commit(sanitizeEconomy({ ...getEconomy(), gems: amount }));
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
