import type { Rarity } from '../types';

/** v2: pity is per banner (a Record keyed by banner id); history entries carry their banner. v1's single pity counter is not carried over. v3: adds Gold (Commercial Prototype Phase 1) - a save with no `gold` field is treated as 0, never backfilled retroactively. v4: adds Summon Tickets (Commercial Prototype Phase 7) - same treatment, a save with no `tickets` field is 0. */
export const ECONOMY_VERSION = 4;

export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** One remembered pull. Card data is looked up from the card definitions, never stored. */
export interface SummonHistoryEntry {
  cardId: string;
  rarity: Rarity;
  /** Epoch ms. */
  at: number;
  wasNew: boolean;
  /** Banner id ('' for entries saved before banners existed). */
  bannerId: string;
}

/**
 * Everything the player-economy owns, persisted as ONE document so a Summon's spend + pity + history
 * land in a single write. Cards are not here - they live in the collection store.
 */
export interface PlayerEconomy {
  version: number;
  gems: number;
  /** Soft currency - Campaign wins and idle rewards. Spent on Hero Level (see game/heroLevel). */
  gold: number;
  /** Earn-only Summon currency (missions, journey) - performs a Summon exactly like Gems, sharing the
   * same per-banner pity/history (see summon/summon.ts's `paymentMethod`). Never purchasable. */
  tickets: number;
  summon: {
    /** Pulls since the last Legendary, per banner id (0 .. pityThreshold - 1). A missing banner is 0. */
    pity: Record<string, number>;
    /** Most recent first, capped at SUMMON_CONFIG.historyLimit. */
    history: SummonHistoryEntry[];
  };
}

export interface GemGrantResult {
  gained: number;
  balance: number;
  source: string;
}

export interface GoldGrantResult {
  gained: number;
  balance: number;
  source: string;
}

export interface TicketGrantResult {
  gained: number;
  balance: number;
  source: string;
}
