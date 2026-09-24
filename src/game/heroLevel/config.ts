// Hero Level tuning (Commercial Prototype Phase 1) - every number lives here, same convention as
// economy/config.ts, ascension/config.ts, progression/config.ts. PROTOTYPE values, not final balance.
//
// Commercial Prototype Phase 8 split: MAX_HERO_LEVEL and battlePowerBonusForLevel moved to
// battlePower.ts, which has NO dependency on config/config.ts, because engine/abilities.ts (reachable
// from api/ for Friendly Battle) imports battlePowerBonusForLevel directly - a combat-balance invariant
// must never be able to drift via a remote config value. Re-exported below so every existing import of
// `./config` keeps working unchanged. heroLevelCapForAccount and goldCostForLevelUp stay here and ARE
// routed through config/config.ts - account-level pacing and Gold cost are economy tuning, not game rules.

import { getConfig } from '../../config/config.js';
import { MAX_HERO_LEVEL, battlePowerBonusForLevel, MAX_BATTLE_POWER_BONUS } from './battlePower.js';

export { MAX_HERO_LEVEL, battlePowerBonusForLevel, MAX_BATTLE_POWER_BONUS };

/** A hero can never be levelled past what the player's own Account Level allows - Level 1 caps a hero at
 * 3, Level 20 (max account level) allows the full 60. Ties hero progression to the "staged unlock" ladder
 * (see progression/config.ts's MASTERY_POINT_LEVELS for the same pattern applied to Mastery). */
export function heroLevelCapForAccount(accountLevel: number): number {
  const cfg = getConfig().heroLevel;
  return Math.max(1, Math.min(cfg.maxHeroLevel, accountLevel * cfg.accountLevelCapMultiplier));
}

/** Gold cost to raise a hero from `fromLevel` to `fromLevel + 1`. Rising linear curve - deliberately a
 * long-tail Gold sink (see docs/COMMERCIAL-PROTOTYPE-PLAN.md's "always a reason to keep playing" note). */
export function goldCostForLevelUp(fromLevel: number): number {
  const cfg = getConfig().heroLevel;
  return cfg.levelUpCostBase + fromLevel * cfg.levelUpCostPerLevel;
}

// ---- Roster Power (first proposal - NOT approved as final balance, see plan Section 5) -----------
// A large, satisfying, purely virtual number for UI/gating/Campaign recommendations. Never read by the
// battle engine (engine/power.ts's effectivePower() has no knowledge this file exists).

export const ROSTER_POWER_WEIGHTS = {
  basePower: 10,
  level: 5,
  ascensionRank: 40,
  /** Flat, once per deck (not per hero) - "you as a commander" contribution. */
  accountLevel: 10,
} as const;
