/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearQueuedEvents, getQueuedEvents } from '../../analytics/track';
import { ShopPage } from '../../pages/ShopPage';
import { PLAYTEST_ROSTER } from '../cards/roster';
import { ASCENSION_STORAGE_KEY, getAscensionRank, getAscensionState, reloadAscension } from '../ascension/store';
import { reloadAccount, setLevel } from '../progression/account';
import { getEconomy, reloadEconomy, setGems, setGold } from '../economy/economy';
import { CAMPAIGN_ENERGY_MAX, loadEnergy, spendEnergy } from '../campaign/energy';
import { boxPullPrice, buyBoxPulls } from '../box/boxProduct';
import { clearArchetypeBoxes } from '../box/boxPool';
import { reloadCollection, setCollection } from '../collection/collection';
import { GROWTH_PACK_MIN_ACCOUNT_LEVEL, isGrowthPackVisible, isStarterPackVisible } from '../offers/eligibility';
import { ENERGY_REFILL_AMOUNT, ENERGY_REFILL_GEMS, refillEnergyWithGems } from './energyRefill';

// The small economy cleanup (ozi, 2026-10-04): Gold can't be bought with Gems, the Gem Energy refill stays, and the
// Growth Pack no longer reads historical Ascension/Mastery ranks.

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  reloadEconomy();
  reloadAccount();
  reloadAscension();
  reloadCollection();
  setCollection({});
  clearArchetypeBoxes();
  clearQueuedEvents();
});

describe('Gems -> Gold exchange is gone', () => {
  it('the Shop no longer offers Gold for Gems', () => {
    setGems(1000);
    const shop = text(renderToStaticMarkup(createElement(ShopPage)));
    expect(shop).not.toMatch(/Gold exchange/);
    expect(shop).not.toMatch(/500 Gold/);
    expect(shop).toMatch(/Energy refill/); // the refill is still the Shop's one Gem exchange
    const source = read('../../pages/ShopPage.tsx');
    expect(source).not.toMatch(/gold-for-gems|GOLD_EXCHANGE|grantGold/);
  });
  it('no code path that spends Gems also grants Gold', () => {
    const src = new URL('../../', import.meta.url);
    const spenders = (readdirSync(src, { recursive: true }) as string[])
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith('economy/economy.ts'))
      .filter((f) => /spendGems\(/.test(readFileSync(new URL(f, src), 'utf8')));
    expect(spenders.length).toBeGreaterThan(0);
    for (const f of spenders) expect(readFileSync(new URL(f, src), 'utf8'), f).not.toMatch(/grantGold\(/);
  });
});

describe('Gem Energy refill still works', () => {
  it('spends 35 Gems to restore up to 20 Energy, and tracks it', () => {
    expect([ENERGY_REFILL_GEMS, ENERGY_REFILL_AMOUNT]).toEqual([35, 20]); // unchanged in this pass
    spendEnergy(CAMPAIGN_ENERGY_MAX); // empty
    setGems(100);
    setGold(0);
    const result = refillEnergyWithGems();
    expect(result).toMatchObject({ ok: true, restored: 20 });
    expect(loadEnergy().current).toBe(20);
    expect(getEconomy()).toMatchObject({ gems: 65, gold: 0 }); // no Gold changes hands
    expect(getQueuedEvents().map((e) => e.name)).toContain('energy_refilled');
  });
  it('caps at max Energy, refuses at full Energy and without enough Gems, spending nothing', () => {
    spendEnergy(CAMPAIGN_ENERGY_MAX);
    setGems(1000);
    while (loadEnergy().current < CAMPAIGN_ENERGY_MAX) expect(refillEnergyWithGems().ok).toBe(true);
    spendEnergy(5);
    expect(refillEnergyWithGems()).toMatchObject({ ok: true, restored: 5 }); // capped, overflow discarded
    expect(loadEnergy().current).toBe(CAMPAIGN_ENERGY_MAX);
    const gems = getEconomy().gems;
    expect(refillEnergyWithGems()).toMatchObject({ ok: false, reason: 'full' });
    expect(getEconomy().gems).toBe(gems);
    spendEnergy(CAMPAIGN_ENERGY_MAX);
    setGems(ENERGY_REFILL_GEMS - 1);
    expect(refillEnergyWithGems()).toMatchObject({ ok: false, reason: 'not-enough-gems' });
    expect(getEconomy().gems).toBe(ENERGY_REFILL_GEMS - 1);
    expect(loadEnergy().current).toBe(0);
  });
  it('keeps the Energy pacing design note', () => {
    expect(read('./energyRefill.ts')).toMatch(/TODO\(energy pacing/);
  });
});

describe('Growth Pack visibility no longer depends on historical Mastery', () => {
  const openOnePack = () => {
    setGems(boxPullPrice(1));
    expect(buyBoxPulls('vanguard', 1).ok).toBe(true);
  };
  const shopText = () => text(renderToStaticMarkup(createElement(ShopPage)));

  it('reads only current pack and Account Level state', () => {
    expect(isGrowthPackVisible({ openedPacks: false, accountLevel: 20 })).toBe(false);
    expect(isGrowthPackVisible({ openedPacks: true, accountLevel: GROWTH_PACK_MIN_ACCOUNT_LEVEL - 1 })).toBe(false);
    expect(isGrowthPackVisible({ openedPacks: true, accountLevel: GROWTH_PACK_MIN_ACCOUNT_LEVEL })).toBe(true);
    expect(isStarterPackVisible({ openedPacks: true, accountLevel: 1 })).toBe(true);
    expect(isStarterPackVisible({ openedPacks: false, accountLevel: 20 })).toBe(false);
  });
  it('a save with historical Ascension ranks but no current progress does not see it', () => {
    clearArchetypeBoxes();
    localStorage.setItem(ASCENSION_STORAGE_KEY, JSON.stringify({ version: 1, cards: Object.fromEntries(PLAYTEST_ROSTER.map((id) => [id, { rank: 4, duplicatesSpent: 10 }])) }));
    reloadAscension();
    expect(getAscensionRank(PLAYTEST_ROSTER[0], getAscensionState())).toBe(4); // the record is preserved, untouched
    expect(shopText()).not.toMatch(/Growth Pack|Starter Pack/);
  });
  it('appears once the player has pulled a card and reached the Account Level, with no Ascension history', () => {
    localStorage.removeItem(ASCENSION_STORAGE_KEY);
    reloadAscension();
    openOnePack();
    setLevel(GROWTH_PACK_MIN_ACCOUNT_LEVEL - 1);
    expect(shopText()).not.toMatch(/Growth Pack/);
    expect(shopText()).toMatch(/Starter Pack/);
    setLevel(GROWTH_PACK_MIN_ACCOUNT_LEVEL);
    expect(shopText()).toMatch(/Growth Pack/);
  });
  it('neither offer surface imports the Ascension store any more', () => {
    for (const rel of ['../../pages/ShopPage.tsx', '../../components/OffersSheet.tsx']) expect(read(rel), rel).not.toMatch(/ascension/i);
  });
});
