import type { CampaignNodeType } from '../campaign/types';
import { GEM_REWARDS, GOLD_REWARDS } from './config';

// What a result is worth in Gems - pure lookups over config.ts. Applying them (grantGems) is the caller's
// job, so each reward flow grants once and can report the total.

/** Gems for the FIRST clear of a Campaign node. Replays are worth nothing. */
export function campaignFirstClearGems(nodeType: CampaignNodeType): number {
  return GEM_REWARDS.campaignFirstClear[nodeType];
}

export function chapterCompleteGems(): number {
  return GEM_REWARDS.chapterComplete;
}

/** Gems awarded by reaching each of the given Account Levels. */
export function levelGems(levels: readonly number[]): number {
  return levels.reduce((sum, level) => sum + (GEM_REWARDS.levelMilestones[level] ?? 0), 0);
}

/** Gold for a Campaign win, cleared or not - unlike Gems, every win pays out, not just the first. */
export function campaignWinGold(nodeType: CampaignNodeType): number {
  return GOLD_REWARDS.campaignWin[nodeType];
}

export function quickBattleGold(result: 'win' | 'draw' | 'loss'): number {
  return result === 'win' ? GOLD_REWARDS.quickBattleWin : result === 'draw' ? GOLD_REWARDS.quickBattleDraw : 0;
}
