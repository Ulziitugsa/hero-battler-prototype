import { spendGems } from '../economy/economy';
import { loadEnergy, restoreEnergy, type EnergyState } from '../campaign/energy';

// The Shop's Gem Energy refill: a player choice to keep playing, and the only Gem -> resource exchange left in the
// Shop. The old 50 Gems -> 500 Gold exchange was removed: Gold is an earn-only soft currency (docs/ECONOMY-BASELINE.md).
//
// TODO(energy pacing): Energy pacing is being studied separately; nothing here is rebalanced yet. It may later move
// toward a higher capacity, a slower recharge and a refill that restores a meaningful chunk, but must never become a
// dominant Gems -> Gold farming route (Energy -> Campaign wins -> Gold).
export const ENERGY_REFILL_GEMS = 35;
export const ENERGY_REFILL_AMOUNT = 20;

export type EnergyRefillResult =
  | { ok: true; restored: number; energy: EnergyState }
  | { ok: false; reason: 'energy-full' | 'not-enough-gems'; energy: EnergyState };

/** Spends ENERGY_REFILL_GEMS and restores up to ENERGY_REFILL_AMOUNT Energy (capped at the max). Charges nothing
 * when Energy is already full or the player cannot afford it. */
export function refillEnergyWithGems(): EnergyRefillResult {
  const before = loadEnergy();
  if (before.current >= before.max) return { ok: false, reason: 'energy-full', energy: before };
  if (!spendGems(ENERGY_REFILL_GEMS)) return { ok: false, reason: 'not-enough-gems', energy: before };
  const energy = restoreEnergy(ENERGY_REFILL_AMOUNT);
  return { ok: true, restored: energy.current - before.current, energy };
}
