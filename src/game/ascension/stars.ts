import { getOwnedCount, getCollection } from '../collection/collection';
import type { OwnedMap } from '../collection/types';
import { hasMasteryPath } from './path';
import { MAX_ASCENSION_RANK } from './config';
import { stageFromAscensionRank } from '../cardMastery/model';
import { getAscensionRank, getAscensionState, type AscensionState } from './store';

// Stars - a derived readout of Card Mastery, kept for the summon reveal and the pixel preview. Since every collectible card
// has the Mastery I..V path (ascension/path.ts), a card's stars ARE its Mastery stage: 0 unowned, 1..5 owned. Nothing is
// stored and nothing is spent here; duplicates are spent only by ascension/ascend.ts's ascendCard.

export const MAX_STARS = 5;

export function starsForCard(cardId: string, owned: OwnedMap = getCollection(), ascensionState: AscensionState = getAscensionState()): number {
  if (getOwnedCount(cardId, owned) <= 0) return 0;
  return hasMasteryPath(cardId) ? stageFromAscensionRank(getAscensionRank(cardId, ascensionState)) : 1;
}

/** The stars the NEXT Mastery stage would show. null for a card with no path, or at Mastery V. */
export function starsForNextRank(cardId: string): number | null {
  if (!hasMasteryPath(cardId)) return null;
  const rank = getAscensionRank(cardId);
  return rank >= MAX_ASCENSION_RANK ? null : stageFromAscensionRank(rank + 1);
}
