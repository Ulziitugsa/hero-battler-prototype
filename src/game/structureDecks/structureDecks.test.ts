import { beforeEach, describe, expect, it } from 'vitest';
import { getOwnedCount, reloadCollection, setCollection } from '../collection/collection';
import { getEconomy, reloadEconomy, setGems } from '../economy/economy';
import { validateDeck } from '../engine/deckRules';
import { loadSavedDecks, upsertSavedDeck } from '../engine/localDecks';
import { getCard } from '../cards';
import { GRAVEBORN_RISING, SD_BONE_LEGION, SD_CRUSADE, SD_HELLFIRE, STRUCTURE_DECKS, STRUCTURE_DECKS_ON_SALE, getStructureDeck } from './definitions';
import { getLaunchDeck, launchDeckList } from '../cards/launchDecks';
import { launchInfo } from '../cards/launchRoster';
import { boxesWithCard } from '../box/archetypeBoxes';
import { STRUCTURE_DECK_GEMS } from '../economy/config';
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

  it('Graveborn Rising is a single-faction Undead deck, retired from sale', () => {
    for (const id of GRAVEBORN_RISING.cardIds) expect(getCard(id).faction).toBe('undead');
    expect(GRAVEBORN_RISING.onSale).toBe(false);
  });

  it('the Shop sells exactly the three approved launch decks: Bone Legion, Hellfire, Crusade', () => {
    expect(STRUCTURE_DECKS_ON_SALE.map((d) => d.id)).toEqual(['sd-bone-legion', 'sd-hellfire', 'sd-crusade']);
    expect([SD_BONE_LEGION.faction, SD_HELLFIRE.faction, SD_CRUSADE.faction]).toEqual(['undead', 'infernal', 'kingdom']);
  });

  it('each launch deck is its fixture list, one per account, at the configurable placeholder price', () => {
    for (const deck of STRUCTURE_DECKS_ON_SALE) {
      expect(deck.cardIds).toEqual(launchDeckList(getLaunchDeck(deck.id)));
      expect(deck.purchaseLimit).toBe(1);
      expect(deck.priceGems).toBe(STRUCTURE_DECK_GEMS);
    }
  });

  it('each launch deck has exactly 2 debut cards: in the deck, sourced to it, and in no Box', () => {
    for (const deck of STRUCTURE_DECKS_ON_SALE) {
      expect(deck.debutCardIds).toHaveLength(2);
      for (const id of deck.debutCardIds) {
        expect(deck.cardIds).toContain(id);
        expect(launchInfo(id)).toMatchObject({ source: 'structure-deck', structureDeck: deck.id });
        expect(boxesWithCard(id)).toEqual([]);
      }
    }
  });
});

describe('buying a Structure Deck', () => {
  it('spends Gems, grants every card and saves a ready-to-play deck', () => {
    setGems(SD_BONE_LEGION.priceGems);
    const result = buyStructureDeck(SD_BONE_LEGION);
    expect(result.ok).toBe(true);
    expect(getEconomy().gems).toBe(0);
    expect(getOwnedCount('und-bone-soldier')).toBe(2);
    expect(getOwnedCount('und-bone-dragon')).toBe(1);
    const saved = loadSavedDecks().find(deck => deck.id === savedStructureDeckId(SD_BONE_LEGION));
    expect(saved?.cardIds).toEqual(SD_BONE_LEGION.cardIds);
    expect(structureDeckPurchases(SD_BONE_LEGION.id)).toBe(1);
  });

  it('a retired deck cannot be bought, and nothing is charged', () => {
    setGems(GRAVEBORN_RISING.priceGems);
    expect(buyStructureDeck(GRAVEBORN_RISING)).toEqual({ ok: false, reason: 'not-on-sale' });
    expect(getEconomy().gems).toBe(GRAVEBORN_RISING.priceGems);
  });

  it('respects the purchase limit and charges nothing past it', () => {
    setGems(SD_BONE_LEGION.priceGems * 3);
    buyStructureDeck(SD_BONE_LEGION);
    expect(buyStructureDeck(SD_BONE_LEGION)).toEqual({ ok: false, reason: 'limit-reached' });
    expect(getEconomy().gems).toBe(SD_BONE_LEGION.priceGems * 2);
  });

  it('charges nothing and grants nothing without enough Gems', () => {
    setGems(SD_BONE_LEGION.priceGems - 1);
    expect(buyStructureDeck(SD_BONE_LEGION)).toEqual({ ok: false, reason: 'not-enough-gems' });
    expect(getOwnedCount('und-bone-dragon')).toBe(0);
    expect(getStructureDeckState().purchased).toEqual({});
  });

  it('never overwrites a saved deck the player already has under the same id', () => {
    upsertSavedDeck({ id: savedStructureDeckId(SD_BONE_LEGION), name: 'My edit', faction: 'undead', cardIds: ['und-bone-soldier'] });
    setGems(SD_BONE_LEGION.priceGems);
    buyStructureDeck(SD_BONE_LEGION);
    expect(loadSavedDecks().find(deck => deck.id === savedStructureDeckId(SD_BONE_LEGION))?.name).toBe('My edit');
  });
});
