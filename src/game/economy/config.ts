// Player-economy tuning - every Gem number lives here so balancing is a one-file change. These are
// PROTOTYPE values, not final economy. Gems are earn-only: there is no purchase path of any kind.

import type { CampaignNodeType } from '../campaign/types';

/**
 * Gems a brand-new economy starts with (also applied once to an existing save that has no economy yet -
 * previous Campaign clears are deliberately NOT converted into retroactive Gems). Exactly one single
 * Summon, so a new player can try the loop right away. Set to 0 to disable.
 */
export const STARTING_GEMS = 100;

export const MAX_GEMS = 999_999;

export const GEM_REWARDS = {
  /** First clear of a Campaign node, by type. Replays give nothing - no farming before there is balance. */
  campaignFirstClear: { battle: 20, challenge: 30, elite: 40, boss: 60, story: 0, reward: 0 } satisfies Record<CampaignNodeType, number>,
  /** Completing a Campaign chapter (once). */
  chapterComplete: 100,
  /** Account Levels that award Gems. Quick Battle has no Gem reward of its own. */
  levelMilestones: { 5: 100, 10: 100, 15: 100, 20: 150 } as Readonly<Record<number, number>>,
} as const;

/** Where a grant came from (for the record returned to callers / future analytics; not persisted). */
export type GemSource = 'campaign' | 'chapter' | 'level' | 'starting' | 'mission' | 'journey' | 'dev';

// ---- Gold (Commercial Prototype Phase 1) --------------------------------------------------------
// Gold is the everyday soft currency: it funds Hero Level (game/heroLevel) and nothing else yet. Unlike
// Gems, Gold is earned on EVERY win, not just a node's first clear - the point is a currency the player
// always has a reason to keep playing for, even on a fully-cleared Campaign. PROTOTYPE values.

export const STARTING_GOLD = 0;

export const MAX_GOLD = 99_999_999;

export const GOLD_REWARDS = {
  /** Every Campaign win, cleared or not - replays are Gold's main source once a chapter is cleared. */
  campaignWin: { battle: 30, challenge: 40, elite: 55, boss: 90, story: 0, reward: 0 } satisfies Record<CampaignNodeType, number>,
  quickBattleWin: 20,
  quickBattleDraw: 8,
} as const;

export type GoldSource = 'campaign' | 'quickBattle' | 'idle' | 'mission' | 'journey' | 'dev';
