import type { CardDefinition, Faction } from '../types/index.js';
import { getCard } from '../cards/index.js';
import { cardFaceStats } from '../cards/cardFace.js';
import { type MasteryStages, deckStartingHp } from '../cardCombat/stats.js';

// Deck Builder summary numbers: Starting HP, Unit/Spell split, average ATK and faction mix. Pure and
// deterministic so it can be tested and shown live while cards are added/removed.
//
// Starting HP is the sum of each Unit copy's HP Contribution, computed by cardCombat/stats.ts deckStartingHp:
// the same helper the card-combat resolver starts a match with, so the Deck Builder and a card-combat battle
// always agree. Pass the player's Card Mastery stages to include Mastery's HP bonus; omit them for base values.
// Legacy combat modes still use their own fixed starting HP.

/** A Unit's HP Contribution: the amount it adds to its deck's Starting HP. Spells contribute nothing. */
export function hpContribution(card: CardDefinition): number {
  return cardFaceStats(card)?.hpContribution ?? 0;
}

/** A Unit's printed ATK from base Power. Spells have none. */
export function baseAtk(card: CardDefinition): number | null {
  return cardFaceStats(card)?.atk ?? null;
}

/** Sum of HP Contributions for every copy of every Unit in the deck. */
export function startingHp(cardIds: readonly string[], stages: MasteryStages = {}): number {
  return deckStartingHp(cardIds, stages).total;
}

export interface DeckSummary {
  count: number;
  units: number;
  spells: number;
  startingHp: number;
  /** Mean base ATK across Unit copies, rounded; null when the deck has no Units. */
  averageAtk: number | null;
  /** Unit copies per faction, largest first. Spells are faction-neutral for deck legality and are left out. */
  factions: { faction: Faction; units: number }[];
}

export function deckSummary(cardIds: readonly string[], stages: MasteryStages = {}): DeckSummary {
  let units = 0;
  let spells = 0;
  let atkTotal = 0;
  const byFaction = new Map<Faction, number>();
  for (const id of cardIds) {
    const card = getCard(id);
    if (card.type !== 'hero') {
      spells += 1;
      continue;
    }
    units += 1;
    atkTotal += baseAtk(card) ?? 0;
    byFaction.set(card.faction, (byFaction.get(card.faction) ?? 0) + 1);
  }
  const factions = [...byFaction.entries()].map(([faction, n]) => ({ faction, units: n })).sort((a, b) => b.units - a.units || a.faction.localeCompare(b.faction));
  return { count: cardIds.length, units, spells, startingHp: startingHp(cardIds, stages), averageAtk: units > 0 ? Math.round(atkTotal / units) : null, factions };
}
