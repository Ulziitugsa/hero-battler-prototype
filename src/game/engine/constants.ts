export const STARTING_HP = 20;
/**
 * Round 1 only: each side draws this many cards to form its opening hand, instead of DRAW_PER_ROUND.
 * (Rich-effects pass - see docs/game/CORE-RULES.md "Deck and hand".)
 */
export const INITIAL_HAND_SIZE = 3;
/**
 * Every round AFTER round 1, each side draws exactly this many cards from their Deck, regardless of
 * current hand size - never a refill/clamp back up to a target. Playing many cards leaves fewer
 * options next round; holding cards banks flexibility instead.
 */
export const DRAW_PER_ROUND = 1;
export const DEFAULT_DECK_SIZE = 15;
export const SUPPORTED_DECK_SIZES = [15, 18, 21] as const;

// Energy/cost was tested and removed for this prototype (see README). CardDefinition.cost is kept
// in the data model and this constant stays defined so a cost system can be reintroduced later
// without a schema change - nothing currently reads it.
export const ENERGY_ENABLED = false;

// How much direct damage an unopposed Hero deals to the enemy player. FULL_POWER is the brief's
// starting assumption and may prove too lethal, especially from a Hero that has been growing for
// several rounds (Ancient Treant, Titanroot) - see the README's open questions. Not tuned yet.
export type DirectDamageMode = 'FULL_POWER' | 'HALF_POWER' | 'CAPPED';
export const DIRECT_DAMAGE_MODE: DirectDamageMode = 'FULL_POWER';
export const DIRECT_DAMAGE_CAP = 6; // only read when DIRECT_DAMAGE_MODE === 'CAPPED'

export function directDamageAmount(power: number): number {
  switch (DIRECT_DAMAGE_MODE) {
    case 'HALF_POWER':
      return Math.ceil(power / 2);
    case 'CAPPED':
      return Math.min(power, DIRECT_DAMAGE_CAP);
    case 'FULL_POWER':
    default:
      return power;
  }
}
