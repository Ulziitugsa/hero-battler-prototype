import { ARCHETYPE_DECKS, ARCHETYPE_DECK_NAMES, type ArchetypeDeckId } from '../cards/archetypeDecks.js';
import { STARTER_DECKS, STARTER_DECK_NAMES, type StarterFaction } from '../cards/starterDecks.js';
import type { PolicyId } from './engine.js';

// The decks the simulation plays: the three live starters, the five live archetype reference decks, and
// six decks built for this study from real roster cards (legal 15-card lists: max 2 copies, 1 per
// Legendary). Each deck has a "natural" pilot style used in the archetype matrix.

export interface SimDeck {
  id: string;
  label: string;
  group: 'starter' | 'archetype' | 'study';
  pilot: PolicyId;
  cards: string[];
}

function expand(entries: [string, number][]): string[] {
  const list: string[] = [];
  for (const [cardId, count] of entries) for (let i = 0; i < count; i++) list.push(cardId);
  return list;
}

/** High ATK, low HP Contribution, few Spells. */
export const AGGRESSIVE_DECK = expand([
  ['kng-common-knight', 2],
  ['inf-blood-demon', 2],
  ['inf-pit-fiend', 2],
  ['inf-hellhound', 2],
  ['inf-runebreaker', 2],
  ['inf-infernal-lord', 1],
  ['und-vharos', 1],
  ['spl-power-surge', 2],
  ['spl-weakness', 1],
]);

/** Low ATK, high HP Contribution, protection and healing. */
export const DEFENSIVE_DECK = expand([
  ['kng-light-priest', 2],
  ['und-dark-priest', 2],
  ['inf-cultist', 2],
  ['und-crypt-warden', 2],
  ['und-grave-knight', 2],
  ['kng-paladin', 1],
  ['spl-aegis-ward', 2],
  ['spl-stasis-field', 2],
]);

/** Power 4-5 bodies and flexible Spells. */
export const BALANCED_DECK = expand([
  ['kng-royal-guard', 2],
  ['kng-null-templar', 2],
  ['und-grave-knight', 2],
  ['und-crypt-warden', 2],
  ['inf-packhound', 2],
  ['kng-battle-captain', 1],
  ['spl-power-surge', 1],
  ['spl-weakness', 1],
  ['spl-giants-bane', 1],
  ['spl-blood-pact', 1],
]);

/** 8 Units / 7 Spells: Spell payoffs plus burn and buffs. */
export const SPELL_HEAVY_DECK = expand([
  ['kng-apprentice-mage', 2],
  ['und-grave-sage', 2],
  ['kng-archmage-vael', 1],
  ['kng-light-priest', 2],
  ['kng-archer', 1],
  ['spl-arcane-bolt', 2],
  ['spl-power-surge', 2],
  ['spl-war-cry', 1],
  ['spl-stasis-field', 1],
  ['spl-aegis-ward', 1],
]);

/** Rare/Epic/Legendary only. */
export const HIGH_RARITY_DECK = expand([
  ['kng-battle-captain', 2],
  ['kng-paladin', 1],
  ['inf-blood-demon', 2],
  ['inf-infernal-lord', 1],
  ['und-vharos', 1],
  ['inf-runebreaker', 2],
  ['und-mira', 2],
  ['spl-war-cry', 2],
  ['spl-fortify', 1],
  ['spl-giants-bane', 1],
]);

/** Commons only. */
export const LOW_RARITY_DECK = expand([
  ['kng-common-knight', 2],
  ['inf-pit-fiend', 2],
  ['kng-archer', 2],
  ['und-bone-soldier', 2],
  ['und-crypt-warden', 2],
  ['inf-cultist', 1],
  ['spl-power-surge', 2],
  ['spl-weakness', 2],
]);

const ARCHETYPE_PILOT: Record<ArchetypeDeckId, PolicyId> = { mage: 'balanced', 'mage-slayer': 'balanced', beast: 'aggressive', trickster: 'aggressive', general: 'balanced' };

export const SIM_DECKS: SimDeck[] = [
  { id: 'aggressive', label: 'Aggressive (12U/3S)', group: 'study', pilot: 'aggressive', cards: AGGRESSIVE_DECK },
  { id: 'defensive', label: 'Defensive (11U/4S)', group: 'study', pilot: 'defensive', cards: DEFENSIVE_DECK },
  { id: 'balanced', label: 'Balanced (11U/4S)', group: 'study', pilot: 'balanced', cards: BALANCED_DECK },
  { id: 'spell-heavy', label: 'Spell-heavy (8U/7S)', group: 'study', pilot: 'balanced', cards: SPELL_HEAVY_DECK },
  { id: 'high-rarity', label: 'High rarity (R/E/L)', group: 'study', pilot: 'balanced', cards: HIGH_RARITY_DECK },
  { id: 'low-rarity', label: 'Low rarity (Commons)', group: 'study', pilot: 'balanced', cards: LOW_RARITY_DECK },
  ...(Object.keys(STARTER_DECKS) as StarterFaction[]).map((f): SimDeck => ({ id: `starter-${f}`, label: STARTER_DECK_NAMES[f], group: 'starter', pilot: 'balanced', cards: STARTER_DECKS[f] })),
  ...(Object.keys(ARCHETYPE_DECKS) as ArchetypeDeckId[]).map((a): SimDeck => ({ id: `arch-${a}`, label: ARCHETYPE_DECK_NAMES[a], group: 'archetype', pilot: ARCHETYPE_PILOT[a], cards: ARCHETYPE_DECKS[a] })),
];

export function getSimDeck(id: string): SimDeck {
  const deck = SIM_DECKS.find((d) => d.id === id);
  if (!deck) throw new Error(`Unknown sim deck: ${id}`);
  return deck;
}
