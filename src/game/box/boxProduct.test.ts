import { beforeEach, describe, expect, it } from 'vitest';
import { getCollection, reloadCollection, setCollection } from '../collection/collection';
import { getEconomy, reloadEconomy, setGems } from '../economy/economy';
import { getCard } from '../cards';
import { boxPackPrice, buyBoxPacks, getBoxProduct, MOONFALL_BOX } from './boxProduct';
import { canResetPrototypeBox, getPrototypeBoxState, prototypeBoxContents, prototypeBoxNextCardOdds, prototypeBoxPacksRemaining, PROTOTYPE_BOX, PROTOTYPE_BOX_STORAGE_KEY, reloadPrototypeBox, resetPrototypeBox } from './prototypeBox';

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  reloadEconomy();
  reloadCollection();
  setCollection({});
  reloadPrototypeBox();
  resetPrototypeBox();
});

describe('Moonfall Box product', () => {
  it('is reachable by its stable id and headlines only real Legendaries from the pool', () => {
    expect(getBoxProduct(PROTOTYPE_BOX.id)).toBe(MOONFALL_BOX);
    expect(MOONFALL_BOX.chaseCardIds.length).toBeGreaterThan(0);
    const inPool = new Set(prototypeBoxContents().map(line => line.cardId));
    for (const id of [...MOONFALL_BOX.chaseCardIds, ...MOONFALL_BOX.bannerCardIds]) expect(inPool.has(id)).toBe(true);
    for (const id of MOONFALL_BOX.chaseCardIds) expect(getCard(id).rarity).toBe('legendary');
  });

  it('prices Open 10 at exactly ten single packs', () => {
    expect(boxPackPrice(MOONFALL_BOX, 10)).toBe(boxPackPrice(MOONFALL_BOX, 1) * 10);
  });

  it('spends Gems and opens packs from the finite pool', () => {
    setGems(MOONFALL_BOX.gemsPerPack * 10);
    const result = buyBoxPacks(10);
    expect(result.ok).toBe(true);
    expect(getEconomy().gems).toBe(0);
    expect(prototypeBoxPacksRemaining()).toBe(90);
    expect(Object.values(getCollection()).reduce((sum, count) => sum + count, 0)).toBe(10 * PROTOTYPE_BOX.cardsPerPack);
  });

  it('charges nothing when the player cannot afford it', () => {
    setGems(MOONFALL_BOX.gemsPerPack - 1);
    expect(buyBoxPacks(1)).toEqual({ ok: false, reason: 'not-enough-gems' });
    expect(getEconomy().gems).toBe(MOONFALL_BOX.gemsPerPack - 1);
    expect(prototypeBoxPacksRemaining()).toBe(100);
  });

  it('charges nothing when the Box cannot supply the packs', () => {
    setGems(999_999);
    for (let i = 0; i < 9; i += 1) buyBoxPacks(10);
    for (let i = 0; i < 5; i += 1) buyBoxPacks(1);
    expect(prototypeBoxPacksRemaining()).toBe(5);
    const gems = getEconomy().gems;
    expect(buyBoxPacks(10)).toEqual({ ok: false, reason: 'sold-out' });
    expect(getEconomy().gems).toBe(gems);
  });
});

describe('Box composition and reset rules', () => {
  it('lists exact per-card contents that add up to the advertised rarity totals', () => {
    const contents = prototypeBoxContents();
    const totals = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (const line of contents) { totals[line.rarity] += line.total; expect(line.remaining).toBe(line.total); }
    expect(totals).toEqual(PROTOTYPE_BOX.cardCounts);
  });

  it('reports exact next-card odds from what is left', () => {
    const odds = prototypeBoxNextCardOdds();
    expect(odds.legendary).toBeCloseTo(PROTOTYPE_BOX.cardCounts.legendary / 500);
    expect(odds.common + odds.rare + odds.epic + odds.legendary).toBeCloseTo(1);
  });

  it('only offers a reset once a pack has been opened, and counts resets', () => {
    expect(canResetPrototypeBox()).toBe(false);
    setGems(1_000);
    buyBoxPacks(1);
    expect(canResetPrototypeBox()).toBe(true);
    const before = getPrototypeBoxState().resetCount ?? 0;
    resetPrototypeBox();
    expect(getPrototypeBoxState().resetCount).toBe(before + 1);
    expect(canResetPrototypeBox()).toBe(false);
  });

  it('gives rarer cards fewer copies each, so Mastery never comes faster for a rarer card', () => {
    const perCard = (rarity: string) => prototypeBoxContents().filter(line => line.rarity === rarity).map(line => line.total);
    expect(Math.min(...perCard('common'))).toBeGreaterThan(Math.max(...perCard('rare')));
    expect(Math.min(...perCard('rare'))).toBeGreaterThan(Math.max(...perCard('epic')));
    expect(Math.min(...perCard('epic'))).toBeGreaterThan(Math.max(...perCard('legendary')));
  });

  it('keeps a save without a reset count readable', () => {
    localStorage.setItem(PROTOTYPE_BOX_STORAGE_KEY, JSON.stringify({ version: 1, openedPacks: 3, randomState: 7, remaining: { 'kng-paladin': 2 } }));
    reloadPrototypeBox();
    const state = getPrototypeBoxState();
    expect(state.openedPacks).toBe(3);
    expect(state.remaining['kng-paladin']).toBe(2);
    expect(canResetPrototypeBox(state)).toBe(true);
  });
});
