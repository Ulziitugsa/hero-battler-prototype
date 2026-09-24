import { getAccount } from '../progression/account';
import { getGold, spendGold } from '../economy/economy';
import { ownsCard } from '../collection/collection';
import { track } from '../../analytics/track';
import { MAX_HERO_LEVEL, goldCostForLevelUp, heroLevelCapForAccount } from './config';
import { getHeroLevel, getHeroLevelState, recordHeroLevel } from './store';
import type { LevelUpResult } from './types';

// Hero Level rules, in one place - mirrors ascension/ascend.ts's shape: a status query the UI renders
// from, and a single mutating action that re-validates everything itself rather than trusting the caller.

export type LevelUpBlock = 'not-owned' | 'max-level' | 'account-cap' | 'no-gold';

export interface HeroLevelStatus {
  owned: boolean;
  level: number;
  maxLevel: number;
  /** The Account-Level-gated ceiling right now (see heroLevelCapForAccount). */
  accountCap: number;
  nextLevel: number | null;
  cost: number | null;
  canLevelUp: boolean;
  blocked: LevelUpBlock | null;
  reason: string | null;
}

export function getHeroLevelStatus(cardId: string, gold: number = getGold(), accountLevel: number = getAccount().level): HeroLevelStatus {
  const owned = ownsCard(cardId);
  const level = getHeroLevel(cardId);
  const accountCap = heroLevelCapForAccount(accountLevel);
  const nextLevel = level < MAX_HERO_LEVEL ? level + 1 : null;
  const cost = nextLevel !== null ? goldCostForLevelUp(level) : null;

  const base = { owned, level, maxLevel: MAX_HERO_LEVEL, accountCap, nextLevel, cost };
  const blocked = (b: LevelUpBlock, reason: string): HeroLevelStatus => ({ ...base, canLevelUp: false, blocked: b, reason });

  if (!owned) return blocked('not-owned', 'Collect this hero to level it.');
  if (nextLevel === null) return blocked('max-level', 'Max level.');
  if (nextLevel > accountCap) return blocked('account-cap', `Reach Account Level ${Math.ceil(nextLevel / 3)} to raise this hero further.`);
  if (cost === null || gold < cost) return blocked('no-gold', `Needs ${cost ?? 0} Gold.`);
  return { ...base, canLevelUp: true, blocked: null, reason: null };
}

/** Spends the Gold and raises the level by exactly one step - only if getHeroLevelStatus passes (re-checked here, never trusts the UI). */
export function levelUpHero(cardId: string): LevelUpResult {
  const status = getHeroLevelStatus(cardId);
  if (!status.canLevelUp || status.nextLevel === null || status.cost === null) {
    return { ok: false, cardId, levelBefore: status.level, levelAfter: status.level, goldSpent: 0, reason: status.reason };
  }
  if (!spendGold(status.cost)) {
    return { ok: false, cardId, levelBefore: status.level, levelAfter: status.level, goldSpent: 0, reason: 'Needs more Gold.' };
  }
  recordHeroLevel(cardId, status.nextLevel);
  track('hero_levelled', { cardId, levelBefore: status.level, levelAfter: status.nextLevel, goldSpent: status.cost });
  return { ok: true, cardId, levelBefore: status.level, levelAfter: status.nextLevel, goldSpent: status.cost, reason: null };
}

/** Every owned, levelled hero - for account-level-cap re-validation display etc. */
export function allLevelledCardIds(): string[] {
  return Object.keys(getHeroLevelState().levels);
}
