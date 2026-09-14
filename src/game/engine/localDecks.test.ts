import { beforeEach, describe, expect, it } from 'vitest';
import { deleteSavedDeck, loadSavedDecks, makeDeckId, upsertSavedDeck } from './localDecks';

// Vitest's default (Node) environment has no `localStorage` global - install a minimal in-memory
// polyfill so this file can exercise the real save/load code path instead of just its try/catch fallback.
function installLocalStoragePolyfill() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  installLocalStoragePolyfill();
});

describe('saving/loading custom decks', () => {
  it('round-trips a saved deck through localStorage', () => {
    const deck = { id: makeDeckId(), name: 'My Kingdom Mix', faction: 'kingdom' as const, cardIds: ['kng-common-knight'] };
    upsertSavedDeck(deck);
    const loaded = loadSavedDecks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(deck);
  });

  it('overwrites an existing deck with the same id instead of duplicating it', () => {
    const id = makeDeckId();
    upsertSavedDeck({ id, name: 'V1', faction: 'undead', cardIds: ['und-bone-soldier'] });
    upsertSavedDeck({ id, name: 'V2', faction: 'undead', cardIds: ['und-bone-soldier', 'und-bone-soldier'] });
    const loaded = loadSavedDecks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe('V2');
    expect(loaded[0].cardIds).toHaveLength(2);
  });

  it('deletes a saved deck by id', () => {
    const id = makeDeckId();
    upsertSavedDeck({ id, name: 'Temp', faction: 'infernal', cardIds: [] });
    expect(loadSavedDecks()).toHaveLength(1);
    deleteSavedDeck(id);
    expect(loadSavedDecks()).toHaveLength(0);
  });

  it('makeDeckId produces unique ids', () => {
    const ids = new Set(Array.from({ length: 20 }, () => makeDeckId()));
    expect(ids.size).toBe(20);
  });
});
