import { describe, expect, it } from 'vitest';
import { getCard } from '../cards';
import { STARTER_DECKS } from '../cards/starterDecks';
import { boxChase, deckChampion } from './featuredCard';
import { getArchetypeBox } from '../box/archetypeBoxes';

const RANK = { common: 0, rare: 1, epic: 2, legendary: 3 } as const;

describe('Home featured card', () => {
  it("features the deck's rarest Unit, never a card outside the deck", () => {
    for (const cardIds of Object.values(STARTER_DECKS)) {
      const champion = deckChampion(cardIds, getCard)!;
      expect(cardIds).toContain(champion);
      const best = Math.max(...cardIds.map(getCard).filter((c) => c.type === 'hero').map((c) => RANK[c.rarity]));
      expect(RANK[getCard(champion).rarity]).toBe(best);
      expect(getCard(champion).type).toBe('hero');
    }
  });

  it('is stable for the same deck and handles an empty one', () => {
    const ids = STARTER_DECKS.kingdom;
    expect(deckChampion(ids, getCard)).toBe(deckChampion([...ids], getCard));
    expect(deckChampion([], getCard)).toBeNull();
  });

  it("points at the Box's Legendary only while it is inside and not yet owned", () => {
    const box = getArchetypeBox('vanguard');
    expect(boxChase(box, 1, 0)).toBe(box.flagshipId);
    expect(boxChase(box, 0, 0)).toBeNull();
    expect(boxChase(box, 1, 1)).toBeNull();
  });
});
