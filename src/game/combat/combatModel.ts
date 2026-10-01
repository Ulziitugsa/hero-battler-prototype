import type { CombatModelId } from '../types/index.js';

// Which resolver plays a battle. Card combat (ATK + HP Contribution, src/game/cardCombat, docs/CARD-COMBAT-DESIGN.md)
// is the production rule set for every mode: Quick Battle, Campaign, Ranked AI, the Lantern trials and Friendly Battle.
//
// The other two engines stay in the codebase, never reachable from normal navigation:
//  - 'legacy' (src/game/engine): historical / compatibility. Power, 20 HP, Legacy Level. Kept so an old Friendly match
//    record can still finish and so the old rules can be compared while debugging. Dev builds only, via ?combat=legacy.
//  - 'v2' (src/game/combatV2): experimental / superseded (per-Unit HP). Dev builds only, via ?combat=v2, and the
//    Profile lab page in dev builds.
// A production build always plays card combat: there is no env list and no URL switch that can route it elsewhere.
// `?combat=card`, which the Quick Battle prototype needed, is accepted and changes nothing.

export type CombatModel = CombatModelId;

/** Every local battle mode. Friendly Battle is built server-side (api/create-match.ts) and always plays card combat. */
export type LocalBattleMode = 'quickBattle' | 'campaign' | 'ranked' | 'story';

/** The production combat model. */
export const PRODUCTION_COMBAT_MODEL: CombatModel = 'card';

/** What each engine is for, for docs, the debug panel and tests. */
export const COMBAT_MODEL_ROLE: Record<CombatModel, 'production' | 'historical' | 'experimental'> = { card: 'production', legacy: 'historical', v2: 'experimental' };

/**
 * Pure resolution of a mode's combat model, for tests. Card combat unless a development build asks for one of the
 * old engines with ?combat=legacy or ?combat=v2. The mode is accepted so a future mode-specific rule has one place to
 * live; today every mode resolves the same way.
 */
export function resolveCombatModel(_mode: LocalBattleMode, env: { dev: boolean; search: string }): CombatModel {
  if (!env.dev) return PRODUCTION_COMBAT_MODEL;
  const override = new URLSearchParams(env.search).get('combat');
  if (override === 'legacy') return 'legacy';
  if (override === 'v2') return 'v2';
  return PRODUCTION_COMBAT_MODEL;
}

/** The combat model a local battle of `mode` plays in this build. */
export function combatModelForMode(mode: LocalBattleMode): CombatModel {
  return resolveCombatModel(mode, { dev: import.meta.env.DEV, search: window.location.search });
}
