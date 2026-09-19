import { beforeEach, describe, expect, it } from 'vitest';
import { STARTER_DECKS } from '../cards/starterDecks';
import { isDeckPlayable } from '../engine/activeDeck';
import { COLLECTION_STORAGE_KEY, sanitizeOwned } from './persistence';
import { buildStarterCollection } from './starterCollection';
import { deckOwnershipShortfalls, describeShortfall } from './deckOwnership';
import { clearCollection, getCollection, getOwnedCount, grantCard, ownsCard, reloadCollection, removeCard, resetCollection, setAllOwned, subscribeCollection, usableCopies } from './collection';

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
  reloadCollection();
});

const stored = () => JSON.parse(localStorage.getItem(COLLECTION_STORAGE_KEY)!);

describe('starter collection', () => {
  it('is deterministic and covers the Kingdom starter deck exactly', () => {
    expect(buildStarterCollection()).toEqual(buildStarterCollection());
    expect(isDeckPlayable(STARTER_DECKS.kingdom)).toBe(true);
    expect(getOwnedCount('kng-paladin')).toBe(1);
    expect(getOwnedCount('kng-archer')).toBe(2);
  });
  it('initialises and persists on first read (clean profile)', () => {
    expect(getCollection()).toEqual(buildStarterCollection());
    expect(stored()).toEqual({ version: 2, owned: { ...buildStarterCollection() } });
  });
  it('does not include cards the player has not earned', () => {
    expect(ownsCard('und-mira')).toBe(false);
    expect(isDeckPlayable(STARTER_DECKS.undead)).toBe(false);
  });
});

describe('persistence', () => {
  it('preserves an existing collection instead of resetting it', () => {
    localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify({ version: 1, owned: { 'und-mira': 3 } }));
    reloadCollection();
    expect(getCollection()).toEqual({ 'und-mira': 3 });
  });
  it('survives a reload (round trip through storage)', () => {
    grantCard('und-mira');
    reloadCollection();
    expect(getOwnedCount('und-mira')).toBe(1);
  });
  it('falls back to the starter collection on malformed JSON without crashing', () => {
    localStorage.setItem(COLLECTION_STORAGE_KEY, '{not json');
    reloadCollection();
    expect(getCollection()).toEqual(buildStarterCollection());
  });
  it('sanitises unknown ids and bad quantities', () => {
    expect(sanitizeOwned({ 'kng-archer': 2, 'fake-card': 5, 'und-mira': -1, 'und-vharos': 0, 'inf-cultist': 'x', 'kng-paladin': 2.9 })).toEqual({ 'kng-archer': 2, 'kng-paladin': 2 });
    expect(sanitizeOwned(null)).toEqual({});
    expect(sanitizeOwned([1, 2])).toEqual({});
    localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify({ version: 1, owned: { 'fake-card': 2, 'und-mira': 1 } }));
    reloadCollection();
    expect(getCollection()).toEqual({ 'und-mira': 1 });
  });
  it('clearCollection re-initialises the starter set', () => {
    grantCard('und-mira');
    clearCollection();
    expect(getCollection()).toEqual(buildStarterCollection());
  });
});

describe('granting cards', () => {
  it('first copy is new, second is a duplicate tracked as quantity', () => {
    const a = grantCard('und-mira');
    expect(a).toMatchObject({ isNew: true, previous: 0, owned: 1, granted: 1 });
    const b = grantCard('und-mira');
    expect(b).toMatchObject({ isNew: false, previous: 1, owned: 2 });
    expect(stored().owned['und-mira']).toBe(2);
  });
  it('rejects unknown card ids and bad counts without changing anything', () => {
    const before = getCollection();
    expect(grantCard('nope')).toBeNull();
    expect(grantCard('und-mira', 0)).toBeNull();
    expect(grantCard('und-mira', -2)).toBeNull();
    expect(grantCard('und-mira', 1.5)).toBeNull();
    expect(getCollection()).toBe(before);
  });
  it('notifies subscribers and returns a new snapshot only on change', () => {
    let calls = 0;
    const off = subscribeCollection(() => calls++);
    const s1 = getCollection();
    expect(getCollection()).toBe(s1);
    grantCard('und-mira');
    expect(calls).toBe(1);
    expect(getCollection()).not.toBe(s1);
    off();
    grantCard('und-mira');
    expect(calls).toBe(1);
  });
  it('dev helpers: remove, set all owned, reset', () => {
    grantCard('und-mira', 2);
    removeCard('und-mira');
    expect(getOwnedCount('und-mira')).toBe(1);
    removeCard('und-mira', 5);
    expect(ownsCard('und-mira')).toBe(false);
    setAllOwned(2);
    expect(getOwnedCount('inf-flame-imp')).toBe(2);
    resetCollection();
    expect(getCollection()).toEqual(buildStarterCollection());
  });
});

describe('usable copies and deck ownership', () => {
  it('usable copies = min(owned, copy limit)', () => {
    grantCard('kng-archer', 3); // owns 5 (2 from starter)
    expect(usableCopies('kng-archer')).toBe(2);
    removeCard('kng-archer', 4);
    expect(usableCopies('kng-archer')).toBe(1);
    expect(usableCopies('kng-paladin')).toBe(1); // Legendary limit
    grantCard('kng-paladin', 2);
    expect(usableCopies('kng-paladin')).toBe(1);
  });
  it('reports shortfalls with player-facing text, never raw ids', () => {
    const deck = ['und-mira', 'kng-archer', 'kng-archer', 'kng-archer'];
    const s = deckOwnershipShortfalls(deck);
    expect(s).toEqual([
      { cardId: 'und-mira', need: 1, have: 0 },
      { cardId: 'kng-archer', need: 3, have: 2 },
    ]);
    expect(describeShortfall(s[0])).toBe('Mira: not owned');
    expect(describeShortfall(s[1])).toBe('You own 2 Archer, deck needs 3');
  });
});
