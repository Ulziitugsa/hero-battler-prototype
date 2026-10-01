import { PLAYTEST_ROSTER } from '../cards/roster.js';
import { MAX_ASCENSION_RANK } from './config.js';

// Which cards have a Card Mastery path. Every collectible card does - Units and Spells alike - from Mastery I to V.
// A Unit's Mastery raises its HP Contribution; a Spell has no HP Contribution, so its Mastery is a collection mark
// only (the frame and the stage shown in the Collection) and never changes the Spell in battle. Tokens and cards
// outside the collectible roster have none.
//
// The legacy Ascension effect paths (ascension/definitions.ts) are separate: they belong to the historical legacy
// resolver and no card-combat battle reads them.

const COLLECTIBLE = new Set(PLAYTEST_ROSTER);

export function hasMasteryPath(cardId: string): boolean {
  // Tokens (cards/tokens.ts) are battle-only and never in the roster.
  return COLLECTIBLE.has(cardId);
}

/** Highest stored rank for a card: 4 (Mastery V) on a path, 0 otherwise. */
export function maxMasteryRank(cardId: string): number {
  return hasMasteryPath(cardId) ? MAX_ASCENSION_RANK : 0;
}
