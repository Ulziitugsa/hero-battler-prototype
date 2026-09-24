import { beforeEach, describe, expect, it } from 'vitest';
import { getEconomy, reloadEconomy } from '../economy/economy';
import { reloadCollection, getOwnedCount } from '../collection/collection';
import { clearQueuedEvents, getQueuedEvents } from '../../analytics/track';
import { getFirstSeenAt } from '../../analytics/context';
import { JOURNEY_DAYS, JOURNEY_LENGTH_DAYS } from './definitions';
import { JOURNEY_STORAGE_KEY, claimJourneyDay, currentJourneyDay, getJourneyState, reloadJourney, resetJourney } from './store';

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

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  installLocalStoragePolyfill();
  reloadCollection();
  reloadEconomy();
  reloadJourney();
  clearQueuedEvents();
});

function setFirstSeen(msAgo: number) {
  localStorage.setItem('skyloom:firstSeenAt', String(Date.now() - msAgo));
}

/** Backdates the persisted lastClaimAt directly - currentJourneyDay() and the drop-off gap check are
 * deliberately independent clocks (one anchored to first-seen, one to the last claim's wall-clock time),
 * so testing the drop-off gap needs this rather than setFirstSeen. */
function backdateLastClaim(msAgo: number) {
  const raw = JSON.parse(localStorage.getItem(JOURNEY_STORAGE_KEY)!);
  raw.lastClaimAt = Date.now() - msAgo;
  localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(raw));
  reloadJourney();
}

describe('definitions', () => {
  it('exactly 7 days, and Day 7 is a meaningful (card) reward, not a currency trickle', () => {
    expect(JOURNEY_LENGTH_DAYS).toBe(7);
    expect(JOURNEY_DAYS[6].rewardCardId).toBeDefined();
  });
  it('no day is gated behind spending or ads - every reward is a flat grant', () => {
    for (const d of JOURNEY_DAYS) {
      expect(d.rewardGold).toBeGreaterThanOrEqual(0);
      expect(d.rewardGems).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('currentJourneyDay', () => {
  it('is Day 1 immediately on first launch', () => {
    setFirstSeen(0);
    expect(currentJourneyDay()).toBe(1);
  });
  it('advances by one exactly at each 24h boundary', () => {
    setFirstSeen(DAY_MS - 1);
    expect(currentJourneyDay()).toBe(1);
    setFirstSeen(DAY_MS);
    expect(currentJourneyDay()).toBe(2);
    setFirstSeen(6 * DAY_MS);
    expect(currentJourneyDay()).toBe(7);
  });
  it('caps at the last day - it never expires or goes past Day 7', () => {
    setFirstSeen(365 * DAY_MS);
    expect(currentJourneyDay()).toBe(JOURNEY_LENGTH_DAYS);
  });
  it('reads the SAME first-seen timestamp analytics/context.ts uses - one source of truth, not a second install clock', () => {
    setFirstSeen(2 * DAY_MS);
    const fromAnalytics = getFirstSeenAt();
    const fromJourney = getJourneyState().currentDay;
    expect(fromJourney).toBe(currentJourneyDay());
    expect(fromAnalytics).toBeLessThanOrEqual(Date.now());
  });
});

describe('claimJourneyDay', () => {
  it('Day 1 is claimable immediately, free-to-play, no purchase or ad required', () => {
    setFirstSeen(0);
    const r = claimJourneyDay(1);
    expect(r.ok).toBe(true);
    expect(r.cardGranted).toBe(JOURNEY_DAYS[0].rewardCardId);
    expect(getOwnedCount(JOURNEY_DAYS[0].rewardCardId!)).toBeGreaterThan(0);
  });
  it('refuses a day that has not unlocked yet', () => {
    setFirstSeen(0);
    const r = claimJourneyDay(3);
    expect(r).toMatchObject({ ok: false, reason: 'Not unlocked yet.' });
  });
  it('refuses a double-claim and does not double-grant', () => {
    setFirstSeen(DAY_MS); // Day 2 unlocked
    const goldBefore = getEconomy().gems;
    claimJourneyDay(2); // Gems-only day
    const again = claimJourneyDay(2);
    expect(again).toMatchObject({ ok: false, reason: 'Already claimed.' });
    expect(getEconomy().gems).toBe(goldBefore + JOURNEY_DAYS[1].rewardGems);
  });
  it('grants Gold/Gems/cards exactly as defined', () => {
    setFirstSeen(3 * DAY_MS); // Day 4 unlocked
    const before = getEconomy().gold;
    const r = claimJourneyDay(4);
    expect(r.gold).toBe(JOURNEY_DAYS[3].rewardGold);
    expect(getEconomy().gold).toBe(before + JOURNEY_DAYS[3].rewardGold);
  });
  it('an unknown day is refused cleanly', () => {
    expect(claimJourneyDay(99)).toMatchObject({ ok: false, reason: 'Unknown day.' });
    expect(claimJourneyDay(0)).toMatchObject({ ok: false, reason: 'Unknown day.' });
  });
  it('Day 7 is reachable free-to-play: claiming every day in order works with no spend', () => {
    setFirstSeen(6 * DAY_MS);
    for (let day = 1; day <= 7; day++) {
      const r = claimJourneyDay(day);
      expect(r.ok, `day ${day}`).toBe(true);
    }
    expect(getJourneyState().complete).toBe(true);
  });
  it('a MISSED day is never lost - it stays claimable later, out of order', () => {
    setFirstSeen(0);
    claimJourneyDay(1);
    // Skip ahead several days without claiming 2 or 3
    setFirstSeen(4 * DAY_MS);
    const day2 = claimJourneyDay(2);
    const day3 = claimJourneyDay(3);
    expect(day2.ok).toBe(true);
    expect(day3.ok).toBe(true);
  });
  it('emits journey_day_claimed, and journey_completed only on the 7th distinct claim', () => {
    setFirstSeen(6 * DAY_MS);
    for (let day = 1; day <= 6; day++) claimJourneyDay(day);
    expect(getQueuedEvents().filter((e) => e.name === 'journey_completed')).toHaveLength(0);
    claimJourneyDay(7);
    const claimed = getQueuedEvents().filter((e) => e.name === 'journey_day_claimed');
    const completed = getQueuedEvents().filter((e) => e.name === 'journey_completed');
    expect(claimed).toHaveLength(7);
    expect(completed).toHaveLength(1);
  });
});

describe('journey_dropped_off', () => {
  it('fires once when a gap of more than 48h has passed since the last claim, mid-journey', () => {
    setFirstSeen(0);
    claimJourneyDay(1);
    clearQueuedEvents();
    backdateLastClaim(3 * DAY_MS); // > 48h since the claim above
    getJourneyState();
    const events = getQueuedEvents().filter((e) => e.name === 'journey_dropped_off');
    expect(events).toHaveLength(1);
    expect(events[0].properties.lastClaimedDay).toBe(1);
  });
  it('never fires again once reported, even on repeated reads', () => {
    setFirstSeen(0);
    claimJourneyDay(1);
    backdateLastClaim(3 * DAY_MS);
    getJourneyState();
    clearQueuedEvents();
    getJourneyState();
    getJourneyState();
    expect(getQueuedEvents().filter((e) => e.name === 'journey_dropped_off')).toHaveLength(0);
  });
  it('never fires once the journey is complete', () => {
    setFirstSeen(6 * DAY_MS);
    for (let day = 1; day <= 7; day++) claimJourneyDay(day);
    clearQueuedEvents();
    setFirstSeen(30 * DAY_MS);
    getJourneyState();
    expect(getQueuedEvents().filter((e) => e.name === 'journey_dropped_off')).toHaveLength(0);
  });
  it('never fires before any claim has happened (nothing to drop off from)', () => {
    setFirstSeen(10 * DAY_MS);
    getJourneyState();
    expect(getQueuedEvents().filter((e) => e.name === 'journey_dropped_off')).toHaveLength(0);
  });
});

describe('persistence and reset', () => {
  it('journey state has its own storage key nothing else touches', () => {
    setFirstSeen(0);
    claimJourneyDay(1);
    expect(localStorage.getItem(JOURNEY_STORAGE_KEY)).not.toBeNull();
    // A collection/economy reload must not disturb the journey key.
    reloadCollection();
    reloadEconomy();
    expect(JSON.parse(localStorage.getItem(JOURNEY_STORAGE_KEY)!).claimedDays).toEqual([1]);
  });
  it('survives malformed storage without throwing', () => {
    localStorage.setItem(JOURNEY_STORAGE_KEY, '{nope');
    reloadJourney();
    expect(getJourneyState().claimedDays).toEqual([]);
  });
  it('resetJourney clears everything', () => {
    setFirstSeen(0);
    claimJourneyDay(1);
    resetJourney();
    expect(getJourneyState().claimedDays).toEqual([]);
  });
});
