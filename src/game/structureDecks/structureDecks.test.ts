import { beforeEach, describe, expect, it } from 'vitest';
import { getOwnedCount, reloadCollection, setCollection } from '../collection/collection';
import { getEconomy, reloadEconomy, setGems } from '../economy/economy';
import { validateDeck } from '../engine/deckRules';
import { loadSavedDecks, upsertSavedDeck } from '../engine/localDecks';
import { getCard } from '../cards';
import { GRAVEBORN_RISING, STRUCTURE_DECKS, getStructureDeck } from './definitions';
import { buyStructureDeck, getStructureDeckState, resetStructureDecks, savedStructureDeckId, structureDeckPurchases } from './store';

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  reloadEconomy();
  reloadCollection();
  setCollection({});
  resetStructureDecks();
});

describe('Structure Deck definitions', () => {
  it('every deck is a legal deck whose featured cards are in it', () => {
    for (const deck of STRUCTURE_DECKS) {
      expect(validateDeck(deck.cardIds).errors).toEqual([]);
      for (const id of deck.featuredCardIds) expect(deck.cardIds).toContain(id);
      expect(deck.exampleCombo.length).toBeGreaterThan(0);
      expect(getStructureDeck(deck.id)).toBe(deck);
    }
  });

  it('Graveborn Rising is a single-faction Undead deck', () => {
    for (const id of GRAVEBORN_RISING.cardIds) expect(getCard(id).faction).toBe('undead');
  });
});

describe('buying a Structure Deck', () => {
  it('spends Gems, grants every card and saves a ready-to-play deck', () => {
    setGems(GRAVEBORN_RISING.priceGems);
    const result = buyStructureDeck(GRAVEBORN_RISING);
    expect(result.ok).toBe(true);
    expect(getEconomy().gems).toBe(0);
    expect(getOwnedCount('und-bone-soldier')).toBe(2);
    expect(getOwnedCount('und-vharos')).toBe(1);
    const saved = loadSavedDecks().find(deck => deck.id === savedStructureDeckId(GRAVEBORN_RISING));
    expect(saved?.cardIds).toEqual(GRAVEBORN_RISING.cardIds);
    expect(structureDeckPurchases(GRAVEBORN_RISING.id)).toBe(1);
  });

  it('respects the purchase limit and charges nothing past it', () => {
    setGems(GRAVEBORN_RISING.priceGems * 3);
    buyStructureDeck(GRAVEBORN_RISING);
    expect(buyStructureDeck(GRAVEBORN_RISING)).toEqual({ ok: false, reason: 'limit-reached' });
    expect(getEconomy().gems).toBe(GRAVEBORN_RISING.priceGems * 2);
  });

  it('charges nothing and grants nothing without enough Gems', () => {
    setGems(GRAVEBORN_RISING.priceGems - 1);
    expect(buyStructureDeck(GRAVEBORN_RISING)).toEqual({ ok: false, reason: 'not-enough-gems' });
    expect(getOwnedCount('und-vharos')).toBe(0);
    expect(getStructureDeckState().purchased).toEqual({});
  });

  it('never overwrites a saved deck the player already has under the same id', () => {
    upsertSavedDeck({ id: savedStructureDeckId(GRAVEBORN_RISING), name: 'My edit', faction: 'undead', cardIds: ['und-mira'] });
    setGems(GRAVEBORN_RISING.priceGems);
    buyStructureDeck(GRAVEBORN_RISING);
    expect(loadSavedDecks().find(deck => deck.id === savedStructureDeckId(GRAVEBORN_RISING))?.name).toBe('My edit');
  });
});
