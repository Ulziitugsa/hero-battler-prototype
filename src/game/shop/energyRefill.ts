import { track } from '../../analytics/track';
import { spendGems } from '../economy/economy';
import { loadEnergy, restoreEnergy, type EnergyState } from '../campaign/energy';

// The Shop's Gem Energy refill - the one remaining "Resource exchange" in the Shop. Gold is not sold for Gems
// (the 50 Gems -> 500 Gold exchange was removed, ozi 2026-10-04): Gold is an earn-only soft currency and the
// future Card Trader currency. The refill stays on purpose: choosing to refill Energy is a fair player choice.
//
// TODO(energy pacing, design note - not a rebalance): Energy pacing will be studied separately. It may later move
// toward a higher capacity, a slower recharge, and a refill that restores a meaningful chunk, without the refill
// becoming a dominant Gems -> Gold farming route (Campaign wins pay Gold, so cheap Energy is indirectly Gold).
// The capacity, recharge rate and refill price/amount below and in campaign/energy.ts are unchanged for now.

export const ENERGY_REFILL_GEMS = 35;
export const ENERGY_REFILL_AMOUNT = 20;

export type EnergyRefillResult =
  | { ok: true; restored: number; energy: EnergyState }
  | { ok: false; reason: 'full' | 'not-enough-gems'; energy: EnergyState };

/** Spends ENERGY_REFILL_GEMS to restore up to ENERGY_REFILL_AMOUNT Campaign Energy. Nothing is spent at full Energy. */
export function refillEnergyWithGems(): EnergyRefillResult {
  const before = loadEnergy();
  if (before.current >= before.max) return { ok: false, reason: 'full', energy: before };
  if (!spendGems(ENERGY_REFILL_GEMS)) return { ok: false, reason: 'not-enough-gems', energy: before };
  const energy = restoreEnergy(ENERGY_REFILL_AMOUNT);
  const restored = energy.current - before.current;
  track('energy_refilled', { amount: restored, gems: ENERGY_REFILL_GEMS, source: 'shop' });
  track('shop_purchase_simulated', { productId: 'energy-refill', productType: 'energy', simulated: false, gems: ENERGY_REFILL_GEMS, energy: restored });
  return { ok: true, restored, energy };
}
