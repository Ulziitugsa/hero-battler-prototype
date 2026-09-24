import { grantGems, grantGold, grantTickets } from '../economy/economy';
import { grantCard } from '../collection/collection';
import { track } from '../../analytics/track';
import { FIRST_PURCHASE_BONUS, getOfferDef, type OfferId, type OfferReward } from './definitions';

// Simulated purchase flow (Commercial Prototype Phase 10). NO real money is processed - there is no
// Stripe, no App/Play Store billing, nowhere in this file or anywhere it's called from. Every "purchase"
// resolves synchronously and grants its reward through the exact same economy/collection functions every
// other reward source in this codebase already uses (grantGold/grantGems/grantTickets/grantCard) - there
// is no separate "premium economy" code path this could accidentally become trusted production billing
// for. The UI (OffersSheet.tsx) labels every purchase button "(Test)" and never claims otherwise.
//
// This module doubles as the "developer-only mechanism to simulate offer viewed/purchase started/
// completed/cancelled" the brief asks for - there is no meaningful difference between "what a developer
// triggers to test the flow" and "what a player taps", since nothing here is gated behind real payment
// processing to begin with. skyloomDev.simulatePurchase(offerId) (devTools.ts) calls the same function
// the UI's confirm button does.

export const PURCHASE_STORAGE_KEY = 'skyloom:purchases';
export const PURCHASE_VERSION = 1;

export interface PurchaseState {
  version: number;
  hasEverPurchased: boolean;
  purchaseCount: number;
  /** Offer ids purchased, most recent first, capped at 50 - history only, not used for any grant logic. */
  history: string[];
}

function defaultState(): PurchaseState {
  return { version: PURCHASE_VERSION, hasEverPurchased: false, purchaseCount: 0, history: [] };
}

function sanitizeState(raw: unknown): PurchaseState {
  if (!raw || typeof raw !== 'object') return defaultState();
  const r = raw as Partial<PurchaseState>;
  return {
    version: PURCHASE_VERSION,
    hasEverPurchased: r.hasEverPurchased === true,
    purchaseCount: typeof r.purchaseCount === 'number' && Number.isFinite(r.purchaseCount) ? Math.max(0, Math.floor(r.purchaseCount)) : 0,
    history: Array.isArray(r.history) ? r.history.filter((x): x is string => typeof x === 'string').slice(0, 50) : [],
  };
}

let snapshot: PurchaseState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

function persist(state: PurchaseState): void {
  try {
    localStorage.setItem(PURCHASE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort only
  }
}

function commit(next: PurchaseState): void {
  snapshot = Object.freeze({ ...next, history: [...next.history] });
  persist(snapshot);
  emit();
}

function load(): PurchaseState {
  try {
    const raw = localStorage.getItem(PURCHASE_STORAGE_KEY);
    if (raw !== null) return sanitizeState(JSON.parse(raw));
  } catch {
    // malformed or unavailable storage: start clean rather than crash
  }
  return defaultState();
}

export function getPurchaseState(): PurchaseState {
  if (!snapshot) snapshot = load();
  return snapshot;
}

export function subscribePurchases(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function grantReward(reward: OfferReward): { gold: number; gems: number; tickets: number; cardGranted: string | null } {
  const gold = reward.gold ? grantGold(reward.gold, 'offer').gained : 0;
  const gems = reward.gems ? grantGems(reward.gems, 'offer').gained : 0;
  const tickets = reward.tickets ? grantTickets(reward.tickets, 'offer').gained : 0;
  let cardGranted: string | null = null;
  if (reward.cardId) {
    grantCard(reward.cardId, reward.cardCount ?? 1);
    cardGranted = reward.cardId;
  }
  return { gold, gems, tickets, cardGranted };
}

/** An offer card became visible - fire at most once per mount per offer (the UI is responsible for that dedupe). */
export function trackOfferSeen(id: OfferId): void {
  track('offer_seen', { offerId: id });
}

/** The player tapped an offer to open its confirmation. */
export function trackOfferClicked(id: OfferId): void {
  track('offer_clicked', { offerId: id });
}

/** The player backed out at the confirmation step without completing. */
export function cancelPurchase(id: OfferId): void {
  track('purchase_started', { offerId: id, test: true });
  track('purchase_cancelled', { offerId: id, test: true });
}

export interface SimulatedPurchaseResult {
  ok: boolean;
  offerId: OfferId;
  gold: number;
  gems: number;
  tickets: number;
  cardGranted: string | null;
  firstPurchaseBonusApplied: boolean;
  reason: string | null;
}

/** Simulates a completed purchase - TEST ONLY, never real money (see file header). Grants the offer's
 * reward, plus the First-Purchase Bonus exactly once, ever, on top of whichever offer completes first. */
export function simulatePurchase(id: OfferId): SimulatedPurchaseResult {
  const def = getOfferDef(id);
  if (!def || def.comingSoon) {
    return { ok: false, offerId: id, gold: 0, gems: 0, tickets: 0, cardGranted: null, firstPurchaseBonusApplied: false, reason: def?.comingSoon ? 'Not available yet.' : 'Unknown offer.' };
  }
  track('purchase_started', { offerId: id, test: true });

  const state = getPurchaseState();
  const base = grantReward(def.reward);
  const applyBonus = !state.hasEverPurchased;
  const bonus = applyBonus ? grantReward(FIRST_PURCHASE_BONUS) : { gold: 0, gems: 0, tickets: 0, cardGranted: null };

  commit({
    ...state,
    hasEverPurchased: true,
    purchaseCount: state.purchaseCount + 1,
    history: [id, ...state.history].slice(0, 50),
  });

  const gold = base.gold + bonus.gold;
  const gems = base.gems + bonus.gems;
  const tickets = base.tickets + bonus.tickets;
  track('purchase_completed', { offerId: id, test: true, gold, gems, tickets, firstPurchaseBonusApplied: applyBonus });

  return { ok: true, offerId: id, gold, gems, tickets, cardGranted: base.cardGranted, firstPurchaseBonusApplied: applyBonus, reason: null };
}

// ---- Dev / test helpers -------------------------------------------------------------------------

export function resetPurchases(): void {
  try {
    localStorage.removeItem(PURCHASE_STORAGE_KEY);
  } catch {
    // ignore
  }
  commit(defaultState());
}

export function reloadPurchases(): void {
  snapshot = null;
  emit();
}
