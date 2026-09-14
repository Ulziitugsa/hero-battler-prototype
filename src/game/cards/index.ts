import type { CardDefinition } from '../types';
import { INFERNAL_CARDS } from './infernal';
import { UNDEAD_CARDS } from './undead';
import { KINGDOM_CARDS } from './kingdom';
import { WILDBORN_CARDS } from './wildborn';
import { INSTANT_SPELL_CARDS, PERSISTENT_SPELL_CARDS } from './spells';

export const ALL_CARDS: CardDefinition[] = [
  ...INFERNAL_CARDS,
  ...UNDEAD_CARDS,
  ...KINGDOM_CARDS,
  ...WILDBORN_CARDS,
  ...INSTANT_SPELL_CARDS,
  ...PERSISTENT_SPELL_CARDS,
];

const CARD_BY_ID = new Map(ALL_CARDS.map((c) => [c.id, c]));

export function getCard(cardId: string): CardDefinition {
  const card = CARD_BY_ID.get(cardId);
  if (!card) throw new Error(`Unknown card id: ${cardId}`);
  return card;
}

/** Copy counts that make up each default 15-card deck. Spells are faction-neutral; each starter deck picks a flavor-appropriate slice. */
function buildDeck(entries: { cardId: string; count: number }[], targetSize: number): string[] {
  const list: string[] = [];
  for (const entry of entries) for (let i = 0; i < entry.count; i++) list.push(entry.cardId);
  const cheapest = entries[0].cardId;
  while (list.length > targetSize) list.pop();
  while (list.length < targetSize) list.push(cheapest);
  return list;
}

const INFERNAL_DECK: { cardId: string; count: number }[] = [
  { cardId: 'inf-flame-imp', count: 5 },
  { cardId: 'inf-hellhound', count: 2 },
  { cardId: 'inf-blood-demon', count: 2 },
  { cardId: 'inf-infernal-lord', count: 1 },
  { cardId: 'spl-weakness', count: 1 },
  { cardId: 'spl-fireball', count: 1 },
  { cardId: 'spl-power-surge', count: 1 },
  { cardId: 'spl-burning-ground', count: 1 },
  { cardId: 'spl-battle-banner', count: 1 },
];

const UNDEAD_DECK: { cardId: string; count: number }[] = [
  { cardId: 'und-bone-soldier', count: 5 },
  { cardId: 'und-dark-priest', count: 2 },
  { cardId: 'und-mira', count: 2 },
  { cardId: 'und-vharos', count: 1 },
  { cardId: 'spl-execute', count: 1 },
  { cardId: 'spl-second-chance', count: 1 },
  { cardId: 'spl-raise-fallen', count: 1 },
  { cardId: 'spl-dispel', count: 1 },
  { cardId: 'spl-grave-totem', count: 1 },
];

const KINGDOM_DECK: { cardId: string; count: number }[] = [
  { cardId: 'kng-common-knight', count: 6 },
  { cardId: 'kng-royal-guard', count: 4 },
  { cardId: 'kng-light-priest', count: 3 },
  { cardId: 'spl-battle-banner', count: 1 },
  { cardId: 'spl-war-cry', count: 1 },
];

const WILDBORN_DECK: { cardId: string; count: number }[] = [
  { cardId: 'wld-forest-wolf', count: 7 },
  { cardId: 'wld-ancient-treant', count: 4 },
  { cardId: 'wld-titanroot', count: 1 },
  { cardId: 'spl-growth-totem', count: 2 },
  { cardId: 'spl-power-surge', count: 1 },
];

export function defaultInfernalDeck(size: number): string[] {
  return buildDeck(INFERNAL_DECK, size);
}

export function defaultUndeadDeck(size: number): string[] {
  return buildDeck(UNDEAD_DECK, size);
}

export function defaultKingdomDeck(size: number): string[] {
  return buildDeck(KINGDOM_DECK, size);
}

export function defaultWildbornDeck(size: number): string[] {
  return buildDeck(WILDBORN_DECK, size);
}
