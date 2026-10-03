import { PLAYTEST_ROSTER } from '../cards/roster.js';
import { MAX_ASCENSION_RANK } from './config.js';

// Which cards can carry a historical Card Mastery record (ascension/store.ts keeps their rank and duplicates spent).
// Every collectible card can; tokens and cards outside the collectible roster cannot. A record has no combat effect:
// combat Card Mastery is removed and every card plays at its printed values.
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
