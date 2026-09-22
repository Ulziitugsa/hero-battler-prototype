import type { CardDefinition } from '../types/index.js';

// Token Heroes - created by SUMMON_TOKEN during a battle, never by a player. They are deliberately NOT
// part of ALL_CARDS or any roster: they can't be collected, summoned, deck-built or shown in the Heroes
// list. `getCard` resolves them (so abilities, chits and Card Detail work unchanged), and the engine
// marks the board instance `token: true` so it vanishes when destroyed instead of entering the
// Graveyard, and never triggers death effects. Nothing here summons another token, so there is no
// recursion to guard against beyond the engine's "empty lane only" rule.

export const TOKEN_CARDS: CardDefinition[] = [
  {
    id: 'tok-ward',
    name: 'Ward',
    shortName: 'Ward',
    faction: 'kingdom',
    type: 'hero',
    role: 'Token',
    rarity: 'common',
    cost: 0,
    power: 2,
    tags: ['Token', 'Ward'],
    boardText: 'Token; Overflow -2',
    abilities: [
      {
        trigger: 'PASSIVE',
        actions: [{ type: 'REDUCE_OVERFLOW_DAMAGE', amount: 2, target: 'SELF' }],
        text: 'If this token loses its lane, the overflow damage you take from it is reduced by 2.',
      },
    ],
  },
  {
    id: 'tok-pup',
    name: 'Hound Pup',
    shortName: 'Pup',
    faction: 'infernal',
    type: 'hero',
    role: 'Token',
    rarity: 'common',
    cost: 0,
    power: 2,
    tags: ['Token', 'Beast', 'Demon'],
    boardText: 'Token',
    abilities: [],
  },
];

const TOKEN_BY_ID = new Map(TOKEN_CARDS.map((c) => [c.id, c]));

export function getTokenCard(cardId: string): CardDefinition | undefined {
  return TOKEN_BY_ID.get(cardId);
}

export function isTokenCardId(cardId: string): boolean {
  return TOKEN_BY_ID.has(cardId);
}
