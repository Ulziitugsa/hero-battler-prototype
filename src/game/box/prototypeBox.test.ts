import { beforeEach, describe, expect, it } from 'vitest';
import { getCollection, reloadCollection, setCollection } from '../collection/collection';
import { getPrototypeBoxState, openPrototypeBox, prototypeBoxPacksRemaining, prototypeBoxRarityCounts, PROTOTYPE_BOX, resetPrototypeBox } from './prototypeBox';

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  reloadCollection();
  setCollection({});
  resetPrototypeBox();
});

describe('finite prototype Box', () => {
  it('has a complete, explicit rarity pool and no silent reset', () => {
    expect(prototypeBoxRarityCounts()).toEqual(PROTOTYPE_BOX.cardCounts);
    expect(prototypeBoxPacksRemaining()).toBe(100);
    openPrototypeBox(10);
    expect(prototypeBoxPacksRemaining()).toBe(90);
  });

  it('draws repeatably from a fixed seed and consumes exactly five cards per pack', () => {
    const first = openPrototypeBox(1).packs.flat().map(pull => pull.cardId);
    resetPrototypeBox();
    const second = openPrototypeBox(1).packs.flat().map(pull => pull.cardId);
    expect(first).toEqual(second);
    expect(first).toHaveLength(PROTOTYPE_BOX.cardsPerPack);
    expect(prototypeBoxPacksRemaining()).toBe(99);
  });

  it('adds new cards and duplicates to the existing collection', () => {
    const result = openPrototypeBox(10);
    const pulls = result.packs.flat();
    expect(pulls).toHaveLength(50);
    expect(pulls.some(pull => pull.isNew)).toBe(true);
    expect(pulls.some(pull => !pull.isNew)).toBe(true);
    expect(Object.values(getCollection()).reduce((sum, count) => sum + count, 0)).toBe(50);
  });

  it('resets only the Box pool while preserving opened card ownership', () => {
    openPrototypeBox(1);
    const collectionBefore = { ...getCollection() };
    expect(Object.values(collectionBefore).reduce((sum, count) => sum + count, 0)).toBe(5);
    resetPrototypeBox();
    expect(prototypeBoxPacksRemaining()).toBe(100);
    expect(getCollection()).toEqual(collectionBefore);
    expect(getPrototypeBoxState().openedPacks).toBe(0);
  });
});
