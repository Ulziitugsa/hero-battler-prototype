import { type AscensionState, ascensionRanksFor, getAscensionState } from '../ascension/store.js';
import { stageFromAscensionRank } from '../cardMastery/model.js';
import type { MasteryStages } from './stats.js';

// Card Mastery stages as card combat reads them. Mastery is still stored as the legacy Ascension rank
// (cardMastery/model.ts: rank 0..3 = Mastery I..IV), and saves are not migrated. The Deck Builder and the
// Quick Battle setup both convert through this one function, so their Starting HP can't drift apart.

/** Mastery stage per card id from legacy Ascension ranks (missing = rank 0 = Mastery I). */
export function stagesFromAscensionRanks(ranks: Readonly<Record<string, number>> | undefined): MasteryStages {
  const out: Record<string, number> = {};
  for (const [id, rank] of Object.entries(ranks ?? {})) out[id] = stageFromAscensionRank(rank);
  return out;
}

/** The local player's Mastery stages for a deck, read from the Ascension store. */
export function playerMasteryStages(cardIds: string[], state: AscensionState = getAscensionState()): MasteryStages {
  return stagesFromAscensionRanks(ascensionRanksFor(cardIds, state));
}
