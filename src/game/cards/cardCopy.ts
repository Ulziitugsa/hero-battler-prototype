import { getCard } from './index.js';
import { getCollection, getOwnedCount } from '../collection/collection.js';
import type { OwnedMap } from '../collection/types.js';
import { getAscensionRank, getAscensionState, type AscensionState } from '../ascension/store.js';
import { stageFromAscensionRank } from '../cardMastery/model.js';
import { hpContributionAt, printedStats } from '../cardCombat/stats.js';

/**
 * The player's copy of a card, as every surface outside battle shows it (Collection, Deck Builder, Shop and Box
 * contents, pack results, events, the focus sheet, Card Inspect): owned or not, how many copies, its Card Mastery stage,
 * and the HP Contribution it adds to a deck's Starting HP. An owned Unit's HP Contribution includes its Card Mastery
 * (cardCombat/stats.ts hpContributionAt, the helper the Deck Builder's Starting HP and a card-combat battle use); a card
 * not collected yet shows the printed value. Read-only.
 */
export interface CardCopyView {
  owned: boolean;
  copies: number;
  /** Card Mastery stage, 1..5 for an owned card, 0 when not owned. */
  masteryStage: number;
  /** A Unit's HP Contribution; undefined for a Spell. */
  hpContribution?: number;
}

export function cardCopyView(cardId: string, collection: OwnedMap = getCollection(), ascension: AscensionState = getAscensionState()): CardCopyView {
  const card = getCard(cardId);
  const copies = getOwnedCount(cardId, collection);
  const owned = copies > 0;
  const masteryStage = owned ? stageFromAscensionRank(getAscensionRank(cardId, ascension)) : 0;
  const hpContribution = card.type !== 'hero' ? undefined : owned ? hpContributionAt(card, masteryStage) : printedStats(card)?.hpc;
  return { owned, copies, masteryStage, ...(hpContribution !== undefined ? { hpContribution } : {}) };
}
