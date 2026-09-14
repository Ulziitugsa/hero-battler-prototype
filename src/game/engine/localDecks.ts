import type { StarterFaction } from '../cards/starterDecks';

// Player-saved decks, localStorage only (README "Deckbuilder UI" - "no account/backend"). A saved
// deck is a name + faction (flavor, for the deck-select screen) + a flat list of card ids (one entry
// per copy) - exactly what `validateDeck` and `createMatch` already expect, so no translation layer.

const STORAGE_KEY = 'skyloom:decks';

export interface SavedDeck {
  id: string;
  name: string;
  faction: StarterFaction;
  cardIds: string[];
}

export function loadSavedDecks(): SavedDeck[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(decks: SavedDeck[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  } catch {
    // localStorage can throw (private browsing, quota) - losing a saved deck locally isn't worth crashing over.
  }
}

/** Inserts a new deck or overwrites an existing one with the same id. */
export function upsertSavedDeck(deck: SavedDeck): void {
  const decks = loadSavedDecks();
  const idx = decks.findIndex((d) => d.id === deck.id);
  if (idx >= 0) decks[idx] = deck;
  else decks.push(deck);
  persist(decks);
}

export function deleteSavedDeck(id: string): void {
  persist(loadSavedDecks().filter((d) => d.id !== id));
}

export function makeDeckId(): string {
  return `deck-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
