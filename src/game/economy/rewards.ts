import type { CampaignNodeType } from '../campaign/types';
import { getConfig } from '../../config/config';

// What a result is worth in Gems/Gold - pure lookups, now read through the Phase 8 config abstraction
// (config/config.ts) rather than importing economy/config.ts's raw constants directly, so a remote
// provider can retune Campaign/Quick-Battle rewards without a client release. Applying them (grantGems/
// grantGold) is the caller's job, so each reward flow grants once and can report the total.

/** Gems for the FIRST clear of a Campaign node. Replays are worth nothing. */
export function campaignFirstClearGems(nodeType: CampaignNodeType): number {
  return getConfig().economy.campaignFirstClearGems[nodeType] ?? 0;
}

export function chapterCompleteGems(): number {
  return getConfig().economy.chapterCompleteGems;
}

/** Gems awarded by reaching each of the given Account Levels. */
export function levelGems(levels: readonly number[]): number {
  const milestones = getConfig().economy.levelMilestoneGems;
  return levels.reduce((sum, level) => sum + (milestones[level] ?? 0), 0);
}

/** Gold for a Campaign win, cleared or not - unlike Gems, every win pays out, not just the first. */
export function campaignWinGold(nodeType: CampaignNodeType): number {
  return getConfig().economy.campaignWinGold[nodeType] ?? 0;
}

export function quickBattleGold(result: 'win' | 'draw' | 'loss'): number {
  const economy = getConfig().economy;
  return result === 'win' ? economy.quickBattleWinGold : result === 'draw' ? economy.quickBattleDrawGold : 0;
}
