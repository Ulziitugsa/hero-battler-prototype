import { beforeEach, describe, expect, it } from 'vitest';
import { grantCard, reloadCollection, setCollection } from '../collection/collection';
import { ascendCard } from './ascend';
import { reloadAscension } from './store';
import { CARD_ASCENSIONS } from './definitions';
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

// This is the duplicate-progression decision gate's Model B, verified: Stars are a pure readout over
// Ascension state, never a second store, never a second spend. See
// docs/COMMERCIAL-PROTOTYPE-PLAN.md's Phase 2 section for the reasoning.

describe('Stars for a card WITH an Ascension path (6 of 52 cards)', () => {
  it('is 0 unowned, and tracks Ascension rank 1:1 in star terms once owned', () => {
    expect(starsForCard('und-bone-soldier')).toBe(0);
    setCollection({ 'und-bone-soldier': 1 });
    expect(starsForCard('und-bone-soldier')).toBe(0); // owned, Base rank - zero stars until Ascended
    setCollection({ 'und-bone-soldier': 1 + 1 + 2 + 3 }); // enough for all three ranks
    ascendCard('und-bone-soldier');
    expect(starsForCard('und-bone-soldier')).toBe(2); // rank 1 of 3 -> round(1/3*5)
    ascendCard('und-bone-soldier');
    expect(starsForCard('und-bone-soldier')).toBe(3); // rank 2 of 3 -> round(2/3*5)
    ascendCard('und-bone-soldier');
    expect(starsForCard('und-bone-soldier')).toBe(MAX_STARS); // rank 3 of 3 -> full 5 stars
  });
  it('spends nothing of its own - Ascending is the only spend, Stars just reads the result', () => {
    setCollection({ 'und-bone-soldier': 2 });
    const before = starsForCard('und-bone-soldier');
    expect(before).toBe(0);
    // Reading stars repeatedly changes nothing
    starsForCard('und-bone-soldier');
    starsForCard('und-bone-soldier');
    expect(starsForCard('und-bone-soldier')).toBe(before);
  });
  it('starsForNextRank previews what Ascending would be worth, without spending', () => {
    setCollection({ 'und-bone-soldier': 2 });
    expect(starsForNextRank('und-bone-soldier')).toBe(2); // Base -> rank 1 is worth 2 stars
    expect(starsForCard('und-bone-soldier')).toBe(0); // unspent - the preview did not apply anything
  });
  it('starsForNextRank is null at max rank', () => {
    setCollection({ 'und-bone-soldier': 1 + 1 + 2 + 3 });
    ascendCard('und-bone-soldier');
    ascendCard('und-bone-soldier');
    ascendCard('und-bone-soldier');
    expect(starsForNextRank('und-bone-soldier')).toBeNull();
  });
});

describe('Stars for a card with NO Ascension path yet (46 of 52 cards)', () => {
  // inf-flame-imp: Infernal, so it is never part of the default Kingdom-only starter collection - a
  // clean "genuinely unowned" starting point (see collection/starterCollection.ts).
  it('is a pure ownership readout: 2nd copy = 1 star, capped at MAX_STARS, spending nothing', () => {
    expect(starsForCard('inf-flame-imp')).toBe(0);
    grantCard('inf-flame-imp', 1); // 1 copy
    expect(starsForCard('inf-flame-imp')).toBe(0);
    grantCard('inf-flame-imp', 1); // 2 copies
    expect(starsForCard('inf-flame-imp')).toBe(1);
    grantCard('inf-flame-imp', 10); // 12 copies - capped, not unbounded
    expect(starsForCard('inf-flame-imp')).toBe(MAX_STARS);
  });
  it('starsForNextRank is null (nothing to preview - there is no Ascension path to spend into)', () => {
    grantCard('inf-flame-imp', 3);
    expect(starsForNextRank('inf-flame-imp')).toBeNull();
  });
});

describe('the two tracks never overlap', () => {
  it('every card in the roster either has a path (rank-derived stars) or does not (copy-derived stars), never both rules at once', () => {
    for (const def of CARD_ASCENSIONS) {
      // A card with a path never falls back to the copy-derived formula, even with many spare copies.
      setCollection({ [def.cardId]: 20 });
      const withManyCopiesButBaseRank = starsForCard(def.cardId);
      expect(withManyCopiesButBaseRank).toBe(0); // Base rank -> 0 stars, regardless of 20 copies sitting unspent
    }
  });
});
