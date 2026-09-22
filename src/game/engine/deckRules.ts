import { getCard } from '../cards/index.js';
import { PLAYTEST_ROSTER } from '../cards/roster.js';
import { DEFAULT_DECK_SIZE } from './constants.js';

// Simple deckbuilding rules for Card Set v0.1 (see README "Deck Rules"). Kept as plain configurable
// constants rather than hardcoded literals scattered through the UI, per the brief's "keep these
// values configurable" instruction.
export const DECK_SIZE = DEFAULT_DECK_SIZE;
export const MAX_COPIES = 2;
export const MAX_LEGENDARY_COPIES = 1;

export interface DeckValidation {
  valid: boolean;
  count: number;
  errors: string[];
}

/** Max copies allowed of one card id - Legendary is capped tighter than everything else. */
export function maxCopiesFor(cardId: string): number {
  return getCard(cardId).rarity === 'legendary' ? MAX_LEGENDARY_COPIES : MAX_COPIES;
}

/**
 * Validates a deck (a flat list of card ids, one entry per copy) against Card Set v0.1's rules:
 * exactly `DECK_SIZE` cards, no card over its copy limit, and every card actually in the playtest
 * roster (the deckbuilder should never offer anything else, but this stays defensive).
 */
export function validateDeck(cardIds: string[]): DeckValidation {
  const errors: string[] = [];

  if (cardIds.length !== DECK_SIZE) {
    errors.push(`Deck has ${cardIds.length}/${DECK_SIZE} cards.`);
  }

  const counts = new Map<string, number>();
  for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  for (const [cardId, count] of counts) {
    if (!PLAYTEST_ROSTER.includes(cardId)) {
      errors.push(`${cardId} is not part of the Card Set v0.1 roster.`);
      continue;
    }
    const limit = maxCopiesFor(cardId);
    if (count > limit) {
      const card = getCard(cardId);
      errors.push(`${card.name}: ${count}/${limit} copies allowed${card.rarity === 'legendary' ? ' (Legendary)' : ''}.`);
    }
  }

  return { valid: errors.length === 0, count: cardIds.length, errors };
}
