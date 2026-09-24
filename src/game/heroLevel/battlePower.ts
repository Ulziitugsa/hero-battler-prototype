// The engine-safe half of Hero Level tuning, split out from config.ts (Commercial Prototype Phase 8) so
// the battle engine's module graph (engine/abilities.ts imports battlePowerBonusForLevel, and is reachable
// from api/ for Friendly Battle) never depends on config/config.ts - a combat-balance invariant must not
// be able to drift via a remote config value, so it isn't wired to one at all. See config.ts's own header
// note and docs/COMMERCIAL-PROTOTYPE-PLAN.md Phase 8 for the full reasoning.
//
// THE CORE CONSTRAINT (see docs/COMMERCIAL-PROTOTYPE-PLAN.md Section 5): the live roster's Hero Power
// spans exactly 3-7 in the playtest set (see docs/game/CARD-SYSTEM.md - rarity is a design lens, not a
// Power tier). Levelling must never dominate that spread - it should be able to narrow a close gap, never
// invert a wide one.

export const MAX_HERO_LEVEL = 60;

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
