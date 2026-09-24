// Hero Level tuning (Commercial Prototype Phase 1) - every number lives here, same convention as
// economy/config.ts, ascension/config.ts, progression/config.ts. PROTOTYPE values, not final balance.
//
// THE CORE CONSTRAINT (see docs/COMMERCIAL-PROTOTYPE-PLAN.md Section 5): the live roster's Hero Power
// spans exactly 3-7 in the playtest set (see docs/game/CARD-SYSTEM.md - rarity is a design lens, not a
// Power tier; a Common can already legitimately out-power a Legendary, e.g. kng-common-knight at 6 vs.
// kng-archmage-vael at 4). Levelling must never dominate that spread - it should be able to narrow a
// close gap, never invert a wide one. Roster Power (rosterPower.ts) is a separate, much larger, purely
// virtual number used for UI/gating/Campaign recommendations; it is NEVER read by the battle engine.

export const MAX_HERO_LEVEL = 60;

/** A hero can never be levelled past what the player's own Account Level allows - Level 1 caps a hero at
 * 3, Level 20 (max account level) allows the full 60. Ties hero progression to the "staged unlock" ladder
 * (see progression/config.ts's MASTERY_POINT_LEVELS for the same pattern applied to Mastery). */
export function heroLevelCapForAccount(accountLevel: number): number {
  return Math.max(1, Math.min(MAX_HERO_LEVEL, accountLevel * 3));
}

/**
 * The ONLY numeric contribution Hero Level makes to real lane combat, added once at Hero placement
 * (see engine/abilities.ts's makeHeroInstance). Two breakpoints, not a continuous curve, so the number is
 * always a small whole integer the player can reason about at a glance: +0 below Level 30, +1 from Level
 * 30, +2 from Level 60 (max). +2 is deliberately smaller than the roster's narrowest meaningful gaps
 * (e.g. 3 between a Power-3 Common and a Power-6/7 Hero) - see heroLevel.test.ts's engine-safety cases.
 */
export function battlePowerBonusForLevel(level: number): number {
  if (level >= 60) return 2;
  if (level >= 30) return 1;
  return 0;
}
export const MAX_BATTLE_POWER_BONUS = 2;

/** Gold cost to raise a hero from `fromLevel` to `fromLevel + 1`. Rising linear curve - deliberately a
 * long-tail Gold sink (see docs/COMMERCIAL-PROTOTYPE-PLAN.md's "always a reason to keep playing" note). */
export function goldCostForLevelUp(fromLevel: number): number {
  return 20 + fromLevel * 12;
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
