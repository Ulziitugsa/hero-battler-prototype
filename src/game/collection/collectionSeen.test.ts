import { beforeEach, describe, expect, it } from 'vitest';
import { COLLECTION_SEEN_STORAGE_KEY, getCollectionSeenAt, markCollectionSeen, newCardIds, resetCollectionSeen, subscribeCollectionSeen } from './collectionSeen';
import type { CardMarksState } from './cardMarks';

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
};

const marks = (firstObtainedAt: Record<string, number>): CardMarksState => ({ version: 1, favorites: [], obtainedAt: firstObtainedAt, firstObtainedAt });

beforeEach(() => {
  store.clear();
  resetCollectionSeen();
});

describe('the Cards tab "new" marker', () => {
  it('an existing save starts as "seen now": nothing it already owned is announced as new', () => {
    const seen = getCollectionSeenAt(5_000);
    expect(seen).toBe(5_000);
    expect(store.get(COLLECTION_SEEN_STORAGE_KEY)).toBe('5000');
    expect(newCardIds(marks({ a: 1_000, b: 4_999 }), seen)).toEqual([]);
  });

  it('cards obtained after the last visit are new, most recent first', () => {
    const seen = getCollectionSeenAt(5_000);
    expect(newCardIds(marks({ old: 4_000, first: 6_000, latest: 9_000 }), seen)).toEqual(['latest', 'first']);
  });

  it('visiting the collection clears them and tells subscribers', () => {
    getCollectionSeenAt(5_000);
    let calls = 0;
    const unsubscribe = subscribeCollectionSeen(() => calls++);
    markCollectionSeen(10_000);
    unsubscribe();
    expect(calls).toBe(1);
    expect(getCollectionSeenAt()).toBe(10_000);
    expect(newCardIds(marks({ x: 9_000 }), getCollectionSeenAt())).toEqual([]);
  });

  it('another copy of a card already owned is not new; only a first copy is', () => {
    const seen = getCollectionSeenAt(5_000);
    const state: CardMarksState = { version: 1, favorites: [], obtainedAt: { dupe: 9_000, fresh: 8_000 }, firstObtainedAt: { dupe: 1_000, fresh: 8_000 } };
    expect(newCardIds(state, seen)).toEqual(['fresh']);
  });

  it('never moves backwards', () => {
    getCollectionSeenAt(5_000);
    markCollectionSeen(3_000);
    expect(getCollectionSeenAt()).toBe(5_000);
  });

  it('a stored value survives a reload; a corrupt one is replaced, not trusted', () => {
    store.set(COLLECTION_SEEN_STORAGE_KEY, '7000');
    resetCollectionSeen();
    store.set(COLLECTION_SEEN_STORAGE_KEY, '7000');
    expect(getCollectionSeenAt(9_000)).toBe(7_000);
    resetCollectionSeen();
    store.set(COLLECTION_SEEN_STORAGE_KEY, 'garbage');
    expect(getCollectionSeenAt(9_000)).toBe(9_000);
  });
});
