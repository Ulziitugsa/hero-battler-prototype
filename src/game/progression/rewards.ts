import type { GameState } from '../types';
import type { CampaignNodeType } from '../campaign/types';
import { XP_REWARDS } from './config';
import { grantXp } from './account';
import type { XpGrantResult } from './types';

// How much XP a finished match is worth, and the one function that applies it. Kept apart from the
// account store so the tuning lives in config.ts and the "what is this result worth" rules read in one place.

export function campaignXp(nodeType: CampaignNodeType, outcome: { won: boolean; isFirstClear: boolean }): number {
  if (!outcome.won) return XP_REWARDS.campaignLoss;
  return outcome.isFirstClear ? XP_REWARDS.campaignFirstClear[nodeType] : XP_REWARDS.campaignReplayWin;
}

export function quickBattleXp(status: GameState['status']): number {
  if (status === 'PLAYER_WIN') return XP_REWARDS.quickBattleWin;
  if (status === 'DRAW') return XP_REWARDS.quickBattleDraw;
  return XP_REWARDS.quickBattleLoss;
}

export function grantCampaignXp(nodeType: CampaignNodeType, outcome: { won: boolean; isFirstClear: boolean }): XpGrantResult {
  return grantXp(campaignXp(nodeType, outcome));
}

export function grantQuickBattleXp(status: GameState['status']): XpGrantResult {
  return grantXp(quickBattleXp(status));
}
