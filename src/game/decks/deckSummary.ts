import type { CardDefinition, Faction } from '../types/index.js';
import { getCard } from '../cards/index.js';
import { cardStatsPreview } from '../cards/cardStatsPreview.js';

// Deck Builder summary numbers: Starting HP, Unit/Spell split, average ATK and faction mix. Pure and
// deterministic so it can be tested and shown live while cards are added/removed.
//
// Starting HP is the INTENDED collectible-card value (sum of each Unit's HP Contribution) from the
// current card-model prototype in cards/cardStatsPreview.ts. Production combat still uses its own
// starting HP until the card-combat migration is approved - this module never feeds the resolver.
// Values use base card stats (no Level/Ascension), so a deck's number is the same for every player.

/** A Unit's HP Contribution: the amount it adds to its deck's Starting HP. Spells contribute nothing. */
export function hpContribution(card: CardDefinition): number {
  return cardStatsPreview(card)?.lp ?? 0;
}

/** A Unit's printed ATK from base Power. Spells have none. */
export function baseAtk(card: CardDefinition): number | null {
  return cardStatsPreview(card)?.atk ?? null;
}

/** Sum of HP Contributions for every copy of every Unit in the deck. */
export function startingHp(cardIds: readonly string[]): number {
  return cardIds.reduce((hp, id) => hp + hpContribution(getCard(id)), 0);
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

export function deckSummary(cardIds: readonly string[]): DeckSummary {
  let units = 0;
  let spells = 0;
  let hp = 0;
  let atkTotal = 0;
  const byFaction = new Map<Faction, number>();
  for (const id of cardIds) {
    const card = getCard(id);
    if (card.type !== 'hero') {
      spells += 1;
      continue;
    }
    units += 1;
    hp += hpContribution(card);
    atkTotal += baseAtk(card) ?? 0;
    byFaction.set(card.faction, (byFaction.get(card.faction) ?? 0) + 1);
  }
  const factions = [...byFaction.entries()].map(([faction, n]) => ({ faction, units: n })).sort((a, b) => b.units - a.units || a.faction.localeCompare(b.faction));
  return { count: cardIds.length, units, spells, startingHp: hp, averageAtk: units > 0 ? Math.round(atkTotal / units) : null, factions };
}
