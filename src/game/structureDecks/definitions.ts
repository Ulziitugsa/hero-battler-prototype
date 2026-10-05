import { atkDelta, atkFromPower } from '../cards/cardFace';
import type { StarterFaction } from '../cards/starterDecks';
import { getLaunchDeck, launchDeckList } from '../cards/launchDecks';
import { LAUNCH_ATK, LAUNCH_ROSTER, type LaunchStructureDeckId } from '../cards/launchRoster';
import { STRUCTURE_DECK_GEMS } from '../economy/config';

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
  /** False for a deck no longer sold: its purchase state and saved deck stay, the Shop stops listing it. */
  onSale: boolean;
  /** Cards that debut in this deck (launchRoster.ts source 'structure-deck'): not in any Box at launch. */
  debutCardIds: string[];
}

function expand(entries: [string, number][]): string[] {
  const list: string[] = [];
  for (const [cardId, count] of entries) for (let i = 0; i < count; i++) list.push(cardId);
  return list;
}

/**
 * The pre-launch Undead deck. Retired from sale with the launch set (the Bone Legion Structure Deck replaces it): an
 * account that bought it keeps its cards, its saved deck and its purchase record.
 */
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
    `With 3 Undead Units in your Graveyard, cast Raise Fallen to revive one. Dark Priest now gains +${atkDelta(2)} ATK each round.`,
    `Close with Vharos. When it dies it revives with ${atkFromPower(4)} ATK and returns another Undead Unit to your hand.`,
  ],
  priceGems: 600,
  purchaseLimit: 1,
  onSale: false,
  debutCardIds: [],
};

/** The debut cards of a launch Structure Deck, from the roster's source metadata. */
function debutCards(id: LaunchStructureDeckId): string[] {
  return LAUNCH_ROSTER.filter((c) => c.source === 'structure-deck' && c.structureDeck === id).map((c) => c.id);
}

/** The launch Structure Decks (approved: Bone Legion, Hellfire, Crusade). Lists come from launchDecks.ts. */
function launchStructureDeck(id: LaunchStructureDeckId, def: Omit<StructureDeckDef, 'id' | 'cardIds' | 'priceGems' | 'purchaseLimit' | 'onSale' | 'debutCardIds'>): StructureDeckDef {
  return { id, ...def, cardIds: launchDeckList(getLaunchDeck(id)), priceGems: STRUCTURE_DECK_GEMS, purchaseLimit: 1, onSale: true, debutCardIds: debutCards(id) };
}

export const SD_BONE_LEGION = launchStructureDeck('sd-bone-legion', {
  name: 'Bone Legion',
  faction: 'undead',
  style: 'Recursion / Graveyard',
  tagline: 'The dead come back, again and again.',
  howItPlays: 'Trade Units freely. Your fallen Undead fill the Graveyard, and a full Graveyard makes Bone Dragon hit harder and lets Raise Fallen bring the best of them back. Out-last the opponent.',
  featuredCardIds: ['und-bone-dragon', 'und-barrow-knight', 'spl-grave-totem'],
  exampleCombo: [
    'Trade Bone Soldiers and Cursed Warriors early. Cursed Warrior returns to your hand when it falls.',
    'Barrow Knight leaves a Skeleton in an empty lane when it is destroyed.',
    `With Units in your Graveyard, Bone Dragon gains +${atkDelta(1)} ATK per Unit in the Clash, up to +${atkDelta(3)}.`,
    'With 2 or more Undead in your Graveyard, Raise Fallen revives the weakest one.',
  ],
});

export const SD_HELLFIRE = launchStructureDeck('sd-hellfire', {
  name: 'Hellfire',
  faction: 'infernal',
  style: 'Burn',
  tagline: 'Burn that lands every round, whoever wins the clash.',
  howItPlays: 'Your Units deal damage to the opponent directly, even when they lose their lane. Keep the board busy, chip the opponent down each round and finish with Meteor.',
  featuredCardIds: ['inf-flame-herald', 'spl-meteor', 'inf-ember-witch'],
  exampleCombo: [
    'Flame Herald deals 45 damage every Clash.',
    'Cinder Imp deals 45 damage when it would lose its lane, so a lost lane still costs the opponent.',
    'Ember Witch deals 45 more damage each round you cast a Spell.',
    'Meteor destroys a weakened enemy Unit and deals 90 damage.',
  ],
});

export const SD_CRUSADE = launchStructureDeck('sd-crusade', {
  name: 'Crusade',
  faction: 'kingdom',
  style: 'Attached Spells',
  tagline: 'One great Unit, armed with Attached Spells.',
  howItPlays: 'Arm a Unit with Battle Banner or Reliquary Blade and build the lane around it. Banner Knight grows while your Continuous Spell is in its lane, and Standard Bearer lifts the Units beside it.',
  featuredCardIds: ['kng-banner-knight', 'spl-reliquary-blade', 'kng-standard-bearer'],
  exampleCombo: [
    `Attach Battle Banner to a Unit for +${atkDelta(1)} ATK.`,
    `Put Banner Knight in that lane. It gains +${atkDelta(1)} ATK each Round End, up to +${atkDelta(3)}.`,
    `Standard Bearer gives adjacent allies +${atkDelta(1)} ATK while your Continuous Spell is in its lane.`,
    `Reliquary Blade gives the attached Unit +${atkDelta(2)} ATK. Close with Dawnshield Paladin (${LAUNCH_ATK['kng-paladin']} ATK).`,
  ],
});

/** Every Structure Deck ever sold, retired ones included (purchase state and saved decks still read them). */
export const STRUCTURE_DECKS: readonly StructureDeckDef[] = [SD_BONE_LEGION, SD_HELLFIRE, SD_CRUSADE, GRAVEBORN_RISING];

/** The decks the Shop sells right now. */
export const STRUCTURE_DECKS_ON_SALE: readonly StructureDeckDef[] = STRUCTURE_DECKS.filter((deck) => deck.onSale);

export function getStructureDeck(id: string): StructureDeckDef | undefined {
  return STRUCTURE_DECKS.find(deck => deck.id === id);
}
