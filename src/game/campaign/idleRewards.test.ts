import { beforeEach, describe, expect, it } from 'vitest';
import { getEconomy, reloadEconomy } from '../economy/economy';
import { reloadCollection } from '../collection/collection';
import { clearQueuedEvents, getQueuedEvents } from '../../analytics/track';
import { IDLE_CAP_HOURS, IDLE_GOLD_PER_HOUR_BASE, IDLE_GOLD_PER_HOUR_PER_NODE, IDLE_REWARDS_STORAGE_KEY, claimIdleReward, goldPerHour, loadIdleReward } from './idleRewards';

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

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  installLocalStoragePolyfill();
  reloadCollection();
  reloadEconomy();
  clearQueuedEvents();
});

function setLastClaimAt(msAgo: number) {
  localStorage.setItem(IDLE_REWARDS_STORAGE_KEY, JSON.stringify({ lastClaimAt: Date.now() - msAgo }));
}

describe('goldPerHour', () => {
  it('scales with cleared Campaign nodes', () => {
    expect(goldPerHour(0)).toBe(IDLE_GOLD_PER_HOUR_BASE);
    expect(goldPerHour(5)).toBe(IDLE_GOLD_PER_HOUR_BASE + 5 * IDLE_GOLD_PER_HOUR_PER_NODE);
    expect(goldPerHour(-3)).toBe(IDLE_GOLD_PER_HOUR_BASE); // never negative-effective
  });
});

describe('loadIdleReward - elapsed time -> rate -> cap', () => {
  it('a brand-new profile (no prior claim) has nothing to claim yet', () => {
    const state = loadIdleReward(0);
    expect(state.availableGold).toBe(0);
    expect(state.atCap).toBe(false);
  });
  it('accrues linearly with elapsed time at the given rate', () => {
    setLastClaimAt(3 * HOUR);
    const state = loadIdleReward(0);
    expect(state.cappedHours).toBeCloseTo(3, 5);
    expect(state.availableGold).toBe(Math.floor(3 * IDLE_GOLD_PER_HOUR_BASE));
  });
  it('caps at IDLE_CAP_HOURS - waiting longer adds nothing more', () => {
    setLastClaimAt((IDLE_CAP_HOURS + 10) * HOUR);
    const state = loadIdleReward(0);
    expect(state.atCap).toBe(true);
    expect(state.cappedHours).toBe(IDLE_CAP_HOURS);
    expect(state.availableGold).toBe(IDLE_CAP_HOURS * IDLE_GOLD_PER_HOUR_BASE);
  });
  it('higher Campaign progress raises the rate, not just the cap', () => {
    setLastClaimAt(2 * HOUR);
    const low = loadIdleReward(0).availableGold;
    const high = loadIdleReward(10).availableGold;
    expect(high).toBeGreaterThan(low);
  });
  it('never claims negative Gold for a clock that moved backwards', () => {
    localStorage.setItem(IDLE_REWARDS_STORAGE_KEY, JSON.stringify({ lastClaimAt: Date.now() + HOUR })); // "in the future"
    expect(loadIdleReward(0).availableGold).toBe(0);
  });
  it('survives malformed storage without throwing', () => {
    localStorage.setItem(IDLE_REWARDS_STORAGE_KEY, '{nope');
    expect(loadIdleReward(0).availableGold).toBe(0);
  });
});

describe('claimIdleReward', () => {
  it('grants exactly the available Gold and resets the clock', () => {
    setLastClaimAt(2 * HOUR);
    const goldBefore = getEconomy().gold;
    const result = claimIdleReward(0);
    expect(result.gold).toBe(Math.floor(2 * IDLE_GOLD_PER_HOUR_BASE));
    expect(getEconomy().gold).toBe(goldBefore + result.gold);
    expect(loadIdleReward(0).availableGold).toBe(0); // clock reset - nothing left to claim immediately after
  });
  it('a claim with nothing accrued grants 0 and does not emit an analytics event', () => {
    const result = claimIdleReward(0);
    expect(result.gold).toBe(0);
    expect(getQueuedEvents().filter((e) => e.name === 'idle_reward_claimed')).toHaveLength(0);
  });
  it('a real claim emits idle_reward_claimed with the granted amount', () => {
    setLastClaimAt(1 * HOUR);
    const result = claimIdleReward(0);
    const events = getQueuedEvents().filter((e) => e.name === 'idle_reward_claimed');
    expect(events).toHaveLength(1);
    expect(events[0].properties.gold).toBe(result.gold);
  });
  it('repeated immediate claims cannot double-grant', () => {
    setLastClaimAt(5 * HOUR);
    const first = claimIdleReward(0);
    expect(first.gold).toBeGreaterThan(0);
    const second = claimIdleReward(0);
    expect(second.gold).toBe(0);
  });
  it('claiming past the cap only ever grants the capped amount, even after a very long absence', () => {
    setLastClaimAt(1000 * HOUR);
    const result = claimIdleReward(0);
    expect(result.gold).toBe(IDLE_CAP_HOURS * IDLE_GOLD_PER_HOUR_BASE);
  });
  it('resets the clock even when there is nothing to claim, so a player cannot bank partial minutes by polling', () => {
    setLastClaimAt(30 * 1000); // 30 seconds - rounds down to 0 Gold
    const before = localStorage.getItem(IDLE_REWARDS_STORAGE_KEY);
    claimIdleReward(0);
    const after = localStorage.getItem(IDLE_REWARDS_STORAGE_KEY);
    expect(after).not.toBe(before);
  });
});
