export const STARTING_HP = 20;
/**
 * Hand refill target. Every round (round 1 included - it starts from an empty hand) each side draws
 * until its hand holds this many cards. A hand at or above the target draws nothing; the target is a
 * FLOOR for drawing, never a hand-size cap, and nothing is ever discarded down to it. So playing cards
 * is what earns next round's draws, and hoarding above the target delays them.
 */
export const HAND_REFILL_TARGET = 3;
export const DEFAULT_DECK_SIZE = 15;
export const SUPPORTED_DECK_SIZES = [15, 18, 21] as const;

// Energy/cost was tested and removed for this prototype (see README). CardDefinition.cost is kept
// in the data model and this constant stays defined so a cost system can be reintroduced later
// without a schema change - nothing currently reads it. Unrelated to Campaign Energy
// (game/campaign/energy.ts), a real-time meta-progression resource that gates starting a Campaign
// stage - the two are different systems that happen to share a name.
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
