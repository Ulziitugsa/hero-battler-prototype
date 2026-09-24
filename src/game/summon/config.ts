// Summon tuning - every rate, cost and threshold lives here, never in UI. PROTOTYPE values, not final economy.

import type { Rarity } from '../types';

export const SUMMON_CONFIG = {
  singleCost: 100,
  /** A small bulk discount (10 pulls for the price of 9); no guaranteed Rare+ - a 10x is just ten normal pulls. */
  tenCost: 900,
  tenCount: 10,
  /**
   * Legendary is guaranteed on this pull number, per banner: 39 pulls without one, then the 40th is forced.
   * Against a 1% base rate that is a generous safety net (effective Legendary chance is roughly 2% per pull).
   */
  pityThreshold: 40,
  historyLimit: 50,
  /** Base percent chance per pull, by rarity (a banner may override). Must sum to 100 (checked by validateSummonPool). */
  rarityRates: { common: 69, rare: 22, epic: 8, legendary: 1 } satisfies Record<Rarity, number>,
  /** Within a rarity, Heroes are this many times likelier than a Spell (Heroes stay the headline). */
  heroWeight: 2,
  spellWeight: 1,
  /** Rate-up: a banner's main / secondary featured card has its in-rarity weight multiplied by this. */
  featuredMainMultiplier: 3,
  featuredSecondaryMultiplier: 2,
  /**
   * Summon Tickets (Commercial Prototype Phase 7): one Ticket = one pull, always, on every banner - no
   * per-banner override like Gem cost has, and deliberately no bulk discount (Tickets are earned, not
   * bought, so there's no "price" to discount off of). Paying with Tickets pulls from the exact same pool
   * and pity as paying with Gems (see summon/summon.ts's `paymentMethod`).
   */
  ticketCost: { single: 1, ten: 10 },
} as const;

export const SUMMON_RARITY_ORDER: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export type Rates = Record<Rarity, number>;
