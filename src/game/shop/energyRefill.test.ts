import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { getEconomy, reloadEconomy, setGems } from '../economy/economy';
import { CAMPAIGN_ENERGY_MAX, loadEnergy, spendEnergy } from '../campaign/energy';
import { ENERGY_REFILL_AMOUNT, ENERGY_REFILL_GEMS, refillEnergyWithGems } from './energyRefill';

function installLocalStorage() {
  const values = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

beforeEach(() => {
  installLocalStorage();
  reloadEconomy();
});

describe('Gem Energy refill (kept, not rebalanced)', () => {
  it('keeps its current price and amount', () => {
    expect([ENERGY_REFILL_GEMS, ENERGY_REFILL_AMOUNT]).toEqual([35, 20]);
  });
  it('spends 35 Gems and restores 20 Energy', () => {
    setGems(100);
    spendEnergy(CAMPAIGN_ENERGY_MAX);
    const before = loadEnergy().current;
    const result = refillEnergyWithGems();
    expect(result).toMatchObject({ ok: true, restored: ENERGY_REFILL_AMOUNT });
    expect(loadEnergy().current).toBe(before + ENERGY_REFILL_AMOUNT);
    expect(getEconomy().gems).toBe(100 - ENERGY_REFILL_GEMS);
  });
  it('stops at the Energy cap', () => {
    setGems(100);
    spendEnergy(loadEnergy().current - (CAMPAIGN_ENERGY_MAX - 5));
    expect(refillEnergyWithGems()).toMatchObject({ ok: true, restored: 5 });
    expect(loadEnergy().current).toBe(CAMPAIGN_ENERGY_MAX);
  });
  it('charges nothing when Energy is full or Gems are short', () => {
    setGems(100);
    spendEnergy(loadEnergy().current - (CAMPAIGN_ENERGY_MAX - ENERGY_REFILL_AMOUNT));
    refillEnergyWithGems(); // exactly full
    expect(loadEnergy().current).toBe(CAMPAIGN_ENERGY_MAX);
    setGems(100);
    expect(refillEnergyWithGems()).toMatchObject({ ok: false, reason: 'energy-full' });
    expect(getEconomy().gems).toBe(100);
    spendEnergy(CAMPAIGN_ENERGY_MAX);
    setGems(ENERGY_REFILL_GEMS - 1);
    expect(refillEnergyWithGems()).toMatchObject({ ok: false, reason: 'not-enough-gems' });
    expect(getEconomy().gems).toBe(ENERGY_REFILL_GEMS - 1);
    expect(loadEnergy().current).toBe(0);
  });
});

describe('Gems -> Gold exchange is removed (Gold is earn-only)', () => {
  const shop = readFileSync(new URL('../../pages/ShopPage.tsx', import.meta.url), 'utf8');
  it('the Shop has no Gold exchange and grants no Gold for Gems', () => {
    expect(shop).not.toMatch(/Gold exchange|gold-for-gems|GOLD_EXCHANGE/);
    expect(shop).not.toMatch(/grantGold\(/);
    expect(shop).not.toMatch(/kind: 'gold'/);
  });
  it('the Energy refill is still offered in the Shop', () => {
    expect(shop).toMatch(/refillEnergyWithGems\(\)/);
    expect(shop).toMatch(/<h3>Energy refill<\/h3>/);
  });
});
