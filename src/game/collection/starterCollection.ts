import { STARTER_DECKS } from '../cards/starterDecks';
import type { OwnedMap } from './types';

/**
 * The deterministic collection every new profile begins with: exactly the Kingdom starter deck (the
 * player's home faction). Undead and Infernal cards are earned - those starter decks stay defined (the
 * AI plays them) but the player can't field them until they own the cards.
 */
export const STARTER_COLLECTION_DECKS: (keyof typeof STARTER_DECKS)[] = ['kingdom'];

/** One copy count per card: the most copies any starter deck in the set needs. */
export function buildStarterCollection(): OwnedMap {
  const owned: Record<string, number> = {};
  for (const faction of STARTER_COLLECTION_DECKS) {
    const counts = new Map<string, number>();
    for (const id of STARTER_DECKS[faction]) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, n] of counts) owned[id] = Math.max(owned[id] ?? 0, n);
  }
  return owned;
}
