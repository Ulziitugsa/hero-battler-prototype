import { deckOwnershipShortfalls } from '../collection/deckOwnership';
import { getCollection } from '../collection/collection';
import type { OwnedMap } from '../collection/types';
import { listDeckOptions, type DeckOption } from './deckOptions';
import { validateDeck } from './deckRules';
import { loadPreferences, savePreferences } from './preferences';

/** A deck can be fielded only if it is legal under the game's rules AND the player owns every copy it uses. */
export function isDeckPlayable(cardIds: string[], owned: OwnedMap = getCollection()): boolean {
  return validateDeck(cardIds).valid && deckOwnershipShortfalls(cardIds, owned).length === 0;
}

/**
 * The deck Home, Campaign and Quick Battle should use. It is always playable: when the stored active
 * deck is missing or no longer playable (e.g. a custom deck built before ownership was real), this falls
 * back to the first playable deck (the Kingdom starter always is) and remembers that choice. The
 * invalid deck itself is never touched - it stays saved, just flagged in Decks.
 */
export function getActiveDeck(): DeckOption {
  const decks = listDeckOptions();
  const prefs = loadPreferences();
  const stored = decks.find((d) => d.id === prefs.selectedDeckId);
  if (stored && isDeckPlayable(stored.cardIds)) return stored;
  const fallback = decks.find((d) => isDeckPlayable(d.cardIds)) ?? decks[0];
  if (fallback.id !== prefs.selectedDeckId) savePreferences({ ...prefs, selectedDeckId: fallback.id });
  return fallback;
}
