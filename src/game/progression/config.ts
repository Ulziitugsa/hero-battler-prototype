// Account progression tuning - every number the XP / Level / Mastery-point systems use lives here so
// balancing is a one-file change. Prototype values; nothing else in the codebase hard-codes them.

export const MAX_LEVEL = 20;

/** XP needed to go from `level` to `level + 1`: 100, 150, 200, 250... (linear on purpose - easy to reason about and test). */
export function xpToNextLevel(level: number): number {
  return 100 + 50 * (Math.max(1, level) - 1);
}

/** Account Levels that award one Mastery Point (spent on Mastery ranks). */
export const MASTERY_POINT_LEVELS: readonly number[] = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];

/** Points needed per Mastery rank-up. */
export const MASTERY_RANK_UP_COST = 1;

/** The Mastery equipped on a brand-new profile (it is unlocked from Level 1, so the system is visible from the first battle). */
export const STARTING_MASTERY = 'fortification';

export const XP_REWARDS = {
  /** First clear of a Campaign stage, by node type. */
  campaignFirstClear: { battle: 40, challenge: 50, elite: 70, boss: 120, story: 0, reward: 0 },
  /** Winning a Campaign stage that was already cleared. */
  campaignReplayWin: 10,
  /** Losing a Campaign stage. */
  campaignLoss: 5,
  quickBattleWin: 15,
  quickBattleLoss: 5,
  quickBattleDraw: 5,
} as const;
