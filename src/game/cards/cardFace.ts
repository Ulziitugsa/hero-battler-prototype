import type { CardDefinition } from '../types/index.js';

/**
 * The two stats printed on a Unit card: ATK and HP Contribution.
 *
 * HP Contribution is NOT the Unit's own health. It adds to the owner's starting HP, so the deck's
 * starting HP is the sum of its Units' contributions. Spells contribute nothing.
 *
 * Values are a linear translation of the existing Power bands (see docs/CARD-COMBAT-DESIGN.md). They are
 * the card-facing numbers only: the production resolver still compares Power and uses the fixed match HP.
 * Because the ATK mapping is linear and increasing, comparing two ATK values always gives the same lane
 * winner as comparing their Power, and every Power change converts exactly (1 Power = 15 ATK).
 */
export interface CardFaceStats {
  atk: number;
  hpContribution: number;
}

export const ATK_PER_POWER = 15;
const ATK_BASE = 40;
const HP_CONTRIBUTION_CEILING = 145;
const HP_CONTRIBUTION_FLOOR = 45;

export const ATK_MEANING = 'Strength in a lane clash. The higher ATK wins the lane.';
export const ATK_HELP = `ATK — ${ATK_MEANING.charAt(0).toLowerCase()}${ATK_MEANING.slice(1)}`;
export const HP_CONTRIBUTION_MEANING = 'Adds this amount to your starting HP.';
export const HP_CONTRIBUTION_HELP = 'HP Contribution — adds this amount to your starting HP.';

export function atkFromPower(power: number): number {
  return ATK_BASE + ATK_PER_POWER * Math.max(1, power);
}

/** The ATK change that corresponds to a Power change in the current engine. */
export function atkDelta(powerDelta: number): number {
  return ATK_PER_POWER * powerDelta;
}

/** Printed stats for a Unit; `effectivePower` (a live battle value) changes ATK only, never HP Contribution. */
export function cardFaceStats(card: CardDefinition, effectivePower?: number): CardFaceStats | null {
  if (card.type !== 'hero') return null;
  const basePower = Math.max(1, card.power ?? 1);
  return {
    atk: atkFromPower(effectivePower ?? basePower),
    hpContribution: Math.max(HP_CONTRIBUTION_FLOOR, HP_CONTRIBUTION_CEILING - 10 * basePower),
  };
}

/** Starting HP a deck would have under the card model: the sum of its Units' HP Contributions. */
export function deckStartingHp(cards: readonly CardDefinition[]): number {
  return cards.reduce((hp, card) => hp + (cardFaceStats(card)?.hpContribution ?? 0), 0);
}

export function formatStat(value: number): string {
  return value.toLocaleString('en-US');
}
