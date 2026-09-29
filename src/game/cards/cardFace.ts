import type { CardDefinition } from '../types/index.js';
import { ATK_PER_POWER, atkFromPower, deckStartingHp as sharedDeckStartingHp, printedStats } from '../cardCombat/stats.js';

/**
 * The two stats printed on a Unit card: ATK and HP Contribution.
 *
 * HP Contribution is NOT the Unit's own health. It adds to the owner's starting HP, so the deck's
 * starting HP is the sum of its Units' contributions. Spells contribute nothing.
 *
 * The numbers come from the approved card-combat stat model (src/game/cardCombat/stats.ts, the one source the
 * Deck Builder and the card resolver share). Legacy combat still compares Power: in a legacy battle a live
 * Power change shows as 15 ATK per step on top of the printed ATK.
 */
export interface CardFaceStats {
  atk: number;
  hpContribution: number;
}

export { ATK_PER_POWER, atkFromPower };

export const ATK_MEANING = 'Strength in a lane clash. The higher ATK wins the lane.';
export const ATK_HELP = `ATK — ${ATK_MEANING.charAt(0).toLowerCase()}${ATK_MEANING.slice(1)}`;
export const HP_CONTRIBUTION_MEANING = 'Adds this amount to your starting HP.';
export const HP_CONTRIBUTION_HELP = 'HP Contribution — adds this amount to your starting HP.';

/** The ATK change that corresponds to a Power change in the current engine. */
export function atkDelta(powerDelta: number): number {
  return ATK_PER_POWER * powerDelta;
}

/** Printed stats for a Unit; `effectivePower` (a live legacy-battle Power) shifts ATK only, never HP Contribution. */
export function cardFaceStats(card: CardDefinition, effectivePower?: number): CardFaceStats | null {
  const printed = printedStats(card);
  if (!printed) return null;
  const shift = effectivePower === undefined ? 0 : atkDelta(effectivePower - Math.max(1, card.power ?? 1));
  return { atk: printed.atk + shift, hpContribution: printed.hpc };
}

/** Starting HP a deck would have under the card model at Mastery I: the sum of its Units' HP Contributions. */
export function deckStartingHp(cards: readonly CardDefinition[]): number {
  return sharedDeckStartingHp(cards.map((card) => card.id)).total;
}

export function formatStat(value: number): string {
  return value.toLocaleString('en-US');
}
