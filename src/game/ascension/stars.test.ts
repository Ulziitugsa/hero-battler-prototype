import { beforeEach, describe, expect, it } from 'vitest';
import { getOwnedCount, reloadCollection, setCollection } from '../collection/collection';
import { ascendCard } from './ascend';
import { reloadAscension, setAscensionRank } from './store';
import { PLAYTEST_ROSTER } from '../cards/roster';
import { MAX_STARS, starsForCard, starsForNextRank } from './stars';

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
  reloadAscension();
});

// Stars are a pure readout of Card Mastery: 0 unowned, then the Mastery stage (1..5). Never a second store, never a spend.

describe('Stars read Card Mastery', () => {
  it('is 0 unowned and the Mastery stage once owned', () => {
    setCollection({});
    expect(starsForCard('und-bone-soldier')).toBe(0);
    setCollection({ 'und-bone-soldier': 1 });
    expect(starsForCard('und-bone-soldier')).toBe(1);
    setAscensionRank('und-bone-soldier', 2);
    expect(starsForCard('und-bone-soldier')).toBe(3);
    setAscensionRank('und-bone-soldier', 4);
    expect(starsForCard('und-bone-soldier')).toBe(MAX_STARS);
  });
  it('spends nothing of its own and a pulled duplicate does not change it', () => {
    setCollection({ 'und-bone-soldier': 2 });
    expect(starsForCard('und-bone-soldier')).toBe(1);
    setCollection({ 'und-bone-soldier': 5 });
    expect(starsForCard('und-bone-soldier')).toBe(1);
    expect(getOwnedCount('und-bone-soldier')).toBe(5);
    expect(ascendCard('und-bone-soldier').ok).toBe(true);
    expect(starsForCard('und-bone-soldier')).toBe(2);
  });
  it('starsForNextRank previews the next stage and is null at Mastery V', () => {
    setCollection({ 'und-bone-soldier': 1 });
    expect(starsForNextRank('und-bone-soldier')).toBe(2);
    setAscensionRank('und-bone-soldier', 4);
    expect(starsForNextRank('und-bone-soldier')).toBeNull();
    expect(starsForNextRank('wld-forest-wolf')).toBeNull();
  });
  it('every roster card reads the same rule', () => {
    setCollection(Object.fromEntries(PLAYTEST_ROSTER.map((id) => [id, 1])));
    expect(PLAYTEST_ROSTER.every((id) => starsForCard(id) === 1)).toBe(true);
  });
});
