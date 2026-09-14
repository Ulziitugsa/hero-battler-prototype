import { describe, expect, it } from 'vitest';
import { DECK_SIZE, MAX_COPIES, MAX_LEGENDARY_COPIES, maxCopiesFor, validateDeck } from './deckRules';
import { KINGDOM_STARTER, UNDEAD_STARTER, INFERNAL_STARTER, STARTER_DECKS } from '../cards/starterDecks';
import { getCard } from '../cards';

describe('deck size enforcement', () => {
  it('rejects a deck that is not exactly DECK_SIZE cards', () => {
    expect(validateDeck(Array(DECK_SIZE - 1).fill('kng-common-knight')).valid).toBe(false);
    expect(validateDeck(Array(DECK_SIZE + 1).fill('kng-common-knight')).valid).toBe(false);
  });
});

describe('duplicate copy limits', () => {
  it('rejects more than MAX_COPIES of a non-Legendary card', () => {
    const deck = [...Array(MAX_COPIES + 1).fill('kng-common-knight'), ...Array(DECK_SIZE - MAX_COPIES - 1).fill('kng-archer')];
    const result = validateDeck(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Common Knight'))).toBe(true);
  });

  it('allows exactly MAX_COPIES of a non-Legendary card', () => {
    expect(maxCopiesFor('kng-common-knight')).toBe(MAX_COPIES);
  });
});

describe('Legendary copy limit', () => {
  it('caps Legendary cards at MAX_LEGENDARY_COPIES even though MAX_COPIES is higher', () => {
    expect(getCard('kng-paladin').rarity).toBe('legendary');
    expect(maxCopiesFor('kng-paladin')).toBe(MAX_LEGENDARY_COPIES);

    const deck = [...Array(MAX_LEGENDARY_COPIES + 1).fill('kng-paladin'), ...Array(DECK_SIZE - MAX_LEGENDARY_COPIES - 1).fill('kng-archer')];
    const result = validateDeck(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Legendary'))).toBe(true);
  });
});

describe('starter deck validity', () => {
  it('all three starter decks are exactly DECK_SIZE cards and pass validation', () => {
    for (const [faction, deck] of Object.entries(STARTER_DECKS)) {
      const result = validateDeck(deck);
      expect(result.valid, `${faction}: ${result.errors.join(', ')}`).toBe(true);
      expect(deck.length).toBe(DECK_SIZE);
    }
  });

  it('Kingdom starter includes its Legendary at exactly 1 copy', () => {
    expect(KINGDOM_STARTER.filter((id) => id === 'kng-paladin').length).toBe(1);
  });

  it('Undead starter includes its Legendary at exactly 1 copy', () => {
    expect(UNDEAD_STARTER.filter((id) => id === 'und-vharos').length).toBe(1);
  });

  it('Infernal starter includes its Legendary at exactly 1 copy', () => {
    expect(INFERNAL_STARTER.filter((id) => id === 'inf-infernal-lord').length).toBe(1);
  });
});

describe('deck roster membership', () => {
  it('rejects a card that is not part of the Card Set v0.1 roster', () => {
    // wld-forest-wolf exists in the game (Wild faction) but is deliberately excluded from the roster.
    const deck = [...Array(DECK_SIZE - 1).fill('kng-common-knight'), 'wld-forest-wolf'];
    const result = validateDeck(deck);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('roster'))).toBe(true);
  });
});
