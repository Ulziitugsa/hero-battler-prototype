import type { CardDefinition, Rarity } from '../types';

// Which cards Home puts in its spotlight. Pure and read-only: it ranks cards that already exist in the player's
// deck or the Box they are pulling from - it never invents a card, a sale or a timer.

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

/**
 * The active deck's champion: its rarest Unit, the strongest of those on a tie, first in the list after that. Falls back
 * to the deck's first card (a Spell-only list) and to null for an empty deck.
 */
export function deckChampion(deckCardIds: readonly string[], getCard: (id: string) => CardDefinition): string | null {
  const units = [...new Set(deckCardIds)].map(getCard).filter((card) => card.type === 'hero');
  const best = units.sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || (b.power ?? 0) - (a.power ?? 0))[0];
  return best?.id ?? deckCardIds[0] ?? null;
}

/**
 * The card worth chasing in the Box the player pulls from: its Legendary, but only while it is still inside the Box
 * and the player does not own a copy yet. Null otherwise - Home never advertises a card that cannot be pulled.
 */
export function boxChase(box: { flagshipId: string }, copiesLeftInBox: number, ownedCopies: number): string | null {
  return copiesLeftInBox > 0 && ownedCopies === 0 ? box.flagshipId : null;
}
