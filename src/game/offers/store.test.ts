import { beforeEach, describe, expect, it } from 'vitest';
import { getEconomy, reloadEconomy } from '../economy/economy';
import { reloadCollection, getOwnedCount } from '../collection/collection';
import { clearQueuedEvents, getQueuedEvents } from '../../analytics/track';
import { FIRST_PURCHASE_BONUS, OFFERS } from './definitions';
import { PURCHASE_STORAGE_KEY, cancelPurchase, getPurchaseState, reloadPurchases, resetPurchases, simulatePurchase } from './store';

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
  reloadEconomy();
  reloadPurchases();
  clearQueuedEvents();
});

describe('the catalog', () => {
  it('is deliberately small - not ten packs', () => {
    expect(OFFERS.length).toBeLessThanOrEqual(6);
  });
  it('every non-coming-soon offer grants at least one resource', () => {
    for (const o of OFFERS.filter((x) => !x.comingSoon)) {
      const total = (o.reward.gold ?? 0) + (o.reward.gems ?? 0) + (o.reward.tickets ?? 0) + (o.reward.cardCount ?? 0);
      expect(total, o.id).toBeGreaterThan(0);
    }
  });
});

describe('simulatePurchase - NO real money anywhere', () => {
  it('grants the offer reward through the real economy/collection stores', () => {
    const goldBefore = getEconomy().gold;
    const gemsBefore = getEconomy().gems;
    const r = simulatePurchase('gem-pack-small');
    expect(r.ok).toBe(true);
    expect(getEconomy().gems).toBeGreaterThan(gemsBefore);
    expect(getEconomy().gold).toBe(goldBefore); // this offer has no Gold
  });
  it('grants a card when the offer includes one, through the real collection store', () => {
    const before = getOwnedCount('kng-battle-captain');
    simulatePurchase('starter-pack');
    expect(getOwnedCount('kng-battle-captain')).toBeGreaterThan(before);
  });
  it('applies the First-Purchase Bonus exactly once, on top of the first offer completed', () => {
    const gemsBefore = getEconomy().gems;
    const r1 = simulatePurchase('gem-pack-small');
    expect(r1.firstPurchaseBonusApplied).toBe(true);
    const expectedFirstGain = 100 /* gem-pack-small */ + (FIRST_PURCHASE_BONUS.gems ?? 0);
    expect(getEconomy().gems).toBe(gemsBefore + expectedFirstGain);

    const gemsAfterFirst = getEconomy().gems;
    const r2 = simulatePurchase('gem-pack-small');
    expect(r2.firstPurchaseBonusApplied).toBe(false);
    expect(getEconomy().gems).toBe(gemsAfterFirst + 100); // no bonus the second time
  });
  it('refuses a coming-soon offer and grants nothing', () => {
    const gemsBefore = getEconomy().gems;
    const r = simulatePurchase('season-pass-preview');
    expect(r).toMatchObject({ ok: false, reason: 'Not available yet.' });
    expect(getEconomy().gems).toBe(gemsBefore);
  });
  it('refuses an unknown offer id cleanly', () => {
    // @ts-expect-error deliberately invalid for the runtime check
    const r = simulatePurchase('not-a-real-offer');
    expect(r).toMatchObject({ ok: false, reason: 'Unknown offer.' });
  });
  it('emits purchase_started then purchase_completed, both marked test: true', () => {
    simulatePurchase('gem-pack-small');
    const started = getQueuedEvents().filter((e) => e.name === 'purchase_started');
    const completed = getQueuedEvents().filter((e) => e.name === 'purchase_completed');
    expect(started).toHaveLength(1);
    expect(completed).toHaveLength(1);
    expect(started[0].properties.test).toBe(true);
    expect(completed[0].properties.test).toBe(true);
  });
  it('persists purchase state across a reload', () => {
    simulatePurchase('gem-pack-small');
    reloadPurchases();
    expect(getPurchaseState()).toMatchObject({ hasEverPurchased: true, purchaseCount: 1 });
  });
});

describe('cancelPurchase', () => {
  it('grants nothing and emits purchase_started then purchase_cancelled', () => {
    const gemsBefore = getEconomy().gems;
    cancelPurchase('gem-pack-small');
    expect(getEconomy().gems).toBe(gemsBefore);
    expect(getPurchaseState().hasEverPurchased).toBe(false);
    expect(getQueuedEvents().filter((e) => e.name === 'purchase_started')).toHaveLength(1);
    expect(getQueuedEvents().filter((e) => e.name === 'purchase_cancelled')).toHaveLength(1);
    expect(getQueuedEvents().filter((e) => e.name === 'purchase_completed')).toHaveLength(0);
  });
  it('a cancelled attempt does not consume the First-Purchase Bonus', () => {
    cancelPurchase('gem-pack-small');
    const gemsBefore = getEconomy().gems;
    const r = simulatePurchase('gem-pack-small');
    expect(r.firstPurchaseBonusApplied).toBe(true); // still available - cancelling never counted as a purchase
    expect(getEconomy().gems).toBe(gemsBefore + 100 + (FIRST_PURCHASE_BONUS.gems ?? 0));
  });
});

describe('persistence and reset', () => {
  it('has its own storage key nothing else touches', () => {
    simulatePurchase('gem-pack-small');
    expect(localStorage.getItem(PURCHASE_STORAGE_KEY)).not.toBeNull();
  });
  it('survives malformed storage without throwing', () => {
    localStorage.setItem(PURCHASE_STORAGE_KEY, '{nope');
    reloadPurchases();
    expect(getPurchaseState().hasEverPurchased).toBe(false);
  });
  it('resetPurchases clears everything, including the First-Purchase Bonus eligibility', () => {
    simulatePurchase('gem-pack-small');
    resetPurchases();
    expect(getPurchaseState()).toMatchObject({ hasEverPurchased: false, purchaseCount: 0 });
    const gemsBefore = getEconomy().gems;
    const r = simulatePurchase('gem-pack-small');
    expect(r.firstPurchaseBonusApplied).toBe(true);
    expect(getEconomy().gems).toBe(gemsBefore + 100 + (FIRST_PURCHASE_BONUS.gems ?? 0));
  });
});
