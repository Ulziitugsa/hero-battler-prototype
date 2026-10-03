import { getCard } from './index.js';
import { getCollection, getOwnedCount } from '../collection/collection.js';
import type { OwnedMap } from '../collection/types.js';
import { hpContribution as printedHpContribution } from '../cardCombat/stats.js';

/**
 * The player's copy of a card, as every surface outside battle shows it (Collection, Deck Builder, Shop and Box
 * contents, pack results, events, the focus sheet, Card Inspect): owned or not, how many copies, and the HP Contribution
 * it adds to a deck's Starting HP. Every card shows its printed values: there is no combat Card Mastery, so a stored
 * Mastery / Ascension rank never changes what a copy shows or plays (cardCombat/stats.ts). Read-only.
 */
export interface CardCopyView {
  owned: boolean;
  copies: number;
  /** A Unit's HP Contribution (printed); undefined for a Spell. */
  hpContribution?: number;
}

export function cardCopyView(cardId: string, collection: OwnedMap = getCollection()): CardCopyView {
  const card = getCard(cardId);
  const copies = getOwnedCount(cardId, collection);
  const owned = copies > 0;
  return { owned, copies, ...(card.type === 'hero' ? { hpContribution: printedHpContribution(card) } : {}) };
}
