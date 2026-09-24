import { getOwnedCount, getCollection } from '../collection/collection';
import type { OwnedMap } from '../collection/types';
import { getCardAscension } from './definitions';
import { getAscensionRank, getAscensionState, type AscensionState } from './store';

// Stars - the duplicate-progression decision gate (Commercial Prototype Phase 2), resolved as Model B:
// "Duplicates -> Ascension; Stars derived from Ascension milestones." See
// docs/COMMERCIAL-PROTOTYPE-PLAN.md's Phase 2 section for the full comparison against Models A/C/D.
//
// THE RULE THIS FILE ENFORCES BY CONSTRUCTION: there is exactly ONE place duplicates are spent
// (ascension/ascend.ts's ascendCard). Stars never spend anything - this module reads existing state
// (collection copies + Ascension rank) and returns a number. There is no Stars store, nothing to persist,
// nothing that can desync from Ascension, and nothing a second UI could accidentally double-spend.
//
// Two tracks, because only 6 of 52 roster cards have an authored Ascension path (see
// ascension/definitions.ts):
//   - A card WITH a path: stars = round((ascensionRank / maxRank) * 5) - so rank 0/1/2/3 (max rank 3)
//     reads as 0/2/3/5 stars. A duplicate is "worth" a star exactly when it funds the next Ascension rank.
//   - A card with NO path yet: stars = min(5, copiesOwned - 1) - a pure ownership readout (the 2nd copy
//     is worth something the instant it's pulled, without waiting for content that doesn't exist yet),
//     spending nothing, changing nothing else. The moment a path is authored for that card, its Star
//     count simply starts being read off Ascension rank instead - no migration, because nothing was ever
//     stored separately.

export const MAX_STARS = 5;

export function starsForCard(cardId: string, owned: OwnedMap = getCollection(), ascensionState: AscensionState = getAscensionState()): number {
  const count = getOwnedCount(cardId, owned);
  if (count <= 0) return 0;
  const def = getCardAscension(cardId);
  if (def) {
    const rank = getAscensionRank(cardId, ascensionState);
    return Math.round((rank / def.ranks.length) * MAX_STARS);
  }
  return Math.min(MAX_STARS, count - 1);
}

/** What the NEXT Ascension rank is worth in star terms - for the "Ascending gets you to ★N" caption
 * pairing the two readouts on AscensionPanel. null for a card with no path, or already at max stars. */
export function starsForNextRank(cardId: string): number | null {
  const def = getCardAscension(cardId);
  if (!def) return null;
  const rank = getAscensionRank(cardId);
  if (rank >= def.ranks.length) return null;
  return Math.round(((rank + 1) / def.ranks.length) * MAX_STARS);
}
