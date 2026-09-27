import { beforeEach, describe, expect, it } from 'vitest';
import { clearQueuedEvents, getQueuedEvents } from '../../analytics/track';
import { getEconomy, reloadEconomy } from '../economy/economy';
import { DAILY_SHOP_GIFT_GOLD, DAILY_SHOP_GIFT_STORAGE_KEY, claimDailyShopGift, dailyShopGiftResetsAt, getDailyShopGiftState, resetDailyShopGiftForTests } from './dailyGift';

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
  localStorage.clear();
  resetDailyShopGiftForTests();
  reloadEconomy();
  clearQueuedEvents();
});

describe('daily Shop gift', () => {
  it('grants 100 Gold once per shared daily UTC period and persists the claim', () => {
    const before = getEconomy().gold;
    expect(claimDailyShopGift()).toBe(true);
    expect(getEconomy().gold - before).toBe(DAILY_SHOP_GIFT_GOLD);
    expect(claimDailyShopGift()).toBe(false);
    expect(JSON.parse(localStorage.getItem(DAILY_SHOP_GIFT_STORAGE_KEY)!).claimed).toBe(true);
    expect(getQueuedEvents().some((event) => event.name === 'shop_free_claimed')).toBe(true);
  });

  it('rolls to a new gift at the next UTC day boundary', () => {
    const beforeMidnight = Date.UTC(2026, 8, 26, 23, 59, 59);
    expect(claimDailyShopGift(beforeMidnight)).toBe(true);
    const state = getDailyShopGiftState(beforeMidnight);
    expect(dailyShopGiftResetsAt(state)).toBe(Date.UTC(2026, 8, 27));
    expect(getDailyShopGiftState(Date.UTC(2026, 8, 27)).claimed).toBe(false);
    expect(claimDailyShopGift(Date.UTC(2026, 8, 27))).toBe(true);
  });
});
