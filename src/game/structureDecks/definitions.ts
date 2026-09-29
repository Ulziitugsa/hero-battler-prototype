import type { StarterFaction } from '../cards/starterDecks';

// Structure Decks: fixed, ready-to-play 15-card decks sold whole in the Shop. Each one teaches an
// archetype - it says what the deck is trying to do, which cards carry it and one concrete line of play -
// so a new player can buy a working strategy instead of assembling one from random pulls.
// Content lives here (not in UI) so an event page can feature a deck by id.

export interface StructureDeckDef {
  /** Stable id - also the saved-deck id suffix and the purchase-state key. */
  id: string;
  name: string;
  faction: StarterFaction;
  /** One-line archetype label, e.g. "Attrition / recursion". */
  style: string;
  tagline: string;
  howItPlays: string;
  /** Three cards shown as the deck's headline, headline card first. */
  featuredCardIds: string[];
  /** One entry per copy, exactly what validateDeck and saved decks expect. */
  cardIds: string[];
  exampleCombo: string[];
  /** In-game Gem price. PROTOTYPE tuning, not final economy. */
  priceGems: number;
  /** How many times one account can buy it. */
  purchaseLimit: number;
}

function expand(entries: [string, number][]): string[] {
  const list: string[] = [];
  for (const [cardId, count] of entries) for (let i = 0; i < count; i++) list.push(cardId);
  return list;
}

export const GRAVEBORN_RISING: StructureDeckDef = {
  id: 'graveborn-rising',
  name: 'Graveborn Rising',
  faction: 'undead',
  style: 'Attrition / recursion',
  tagline: 'Lose a lane, keep the card. Undead that come back stronger.',
  howItPlays: 'Trade Units freely. Most of this deck returns to your hand or Deck when it falls, and every card that reaches your Graveyard makes the rest of the deck stronger. Survive the early rounds, then out-last the opponent.',
  featuredCardIds: ['und-vharos', 'und-mira', 'spl-grave-totem'],
  cardIds: expand([
    ['und-bone-soldier', 2],
    ['und-cursed-warrior', 2],
    ['und-crypt-warden', 2],
    ['und-dark-priest', 2],
    ['und-grave-knight', 2],
    ['und-mira', 1],
    ['und-vharos', 1],
    ['spl-grave-totem', 1],
    ['spl-raise-fallen', 1],
    ['spl-second-chance', 1],
  ]),
  exampleCombo: [
    'Put Grave Totem into a lane. The first ally that dies there each round returns to your hand.',
    'Trade Cursed Warrior and Crypt Warden into that lane. Cursed Warrior comes back to your hand, and Crypt Warden gains a Shield once your Graveyard holds 2 cards.',
    'With 3 Undead Units in your Graveyard, cast Raise Fallen to revive one. Dark Priest now gains +2 Power each round.',
    'Close with Vharos. When it dies it revives with 4 Power and returns another Undead Unit to your hand.',
  ],
  priceGems: 600,
  purchaseLimit: 1,
};

export const STRUCTURE_DECKS: readonly StructureDeckDef[] = [GRAVEBORN_RISING];

export function getStructureDeck(id: string): StructureDeckDef | undefined {
  return STRUCTURE_DECKS.find(deck => deck.id === id);
}
