import { beforeEach, describe, expect, it } from 'vitest';
import { getEconomy, reloadEconomy } from '../economy/economy';
import { reloadCollection } from '../collection/collection';
import { clearQueuedEvents, getQueuedEvents, track } from '../../analytics/track';
import { ALL_MISSIONS, DAILY_MISSIONS, WEEKLY_MISSIONS } from './definitions';
import {
  MISSIONS_STORAGE_KEY,
  anyMissionClaimable,
  claimMission,
  dayKey,
  getMissionProgress,
  getMissionsState,
  initMissions,
  isMissionComplete,
  listMissions,
  reloadMissions,
  resetMissions,
  setMissionProgress,
  weekKey,
} from './store';

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
const WEEK_MS = 7 * DAY_MS;

beforeEach(() => {
  installLocalStoragePolyfill();
  reloadCollection();
  reloadEconomy();
  reloadMissions();
  clearQueuedEvents();
  initMissions();
});

describe('definitions', () => {
  it('5 daily, 3 weekly, every metric is a real analytics event name', () => {
    expect(DAILY_MISSIONS).toHaveLength(5);
    expect(WEEKLY_MISSIONS).toHaveLength(3);
    for (const m of ALL_MISSIONS) expect(m.target).toBeGreaterThan(0);
  });
});

describe('dayKey / weekKey', () => {
  it('are deterministic and advance exactly at their boundary', () => {
    const t0 = 10 * DAY_MS;
    expect(dayKey(t0)).toBe(dayKey(t0 + DAY_MS - 1));
    expect(dayKey(t0 + DAY_MS)).toBe(dayKey(t0) + 1);
    const w0 = 3 * WEEK_MS;
    expect(weekKey(w0)).toBe(weekKey(w0 + WEEK_MS - 1));
    expect(weekKey(w0 + WEEK_MS)).toBe(weekKey(w0) + 1);
  });
});

describe('tracking progress via analytics events', () => {
  it('a matching track() call advances every mission sharing that metric, capped at target', () => {
    for (let i = 0; i < 3; i++) track('campaign_won', {});
    const daily = getMissionProgress('daily-campaign-wins');
    expect(daily.count).toBe(2); // target is 2 - capped, not 3
    const weekly = getMissionProgress('weekly-campaign-wins');
    expect(weekly.count).toBe(3); // target is 10 - not yet capped
  });
  it('a non-matching event advances nothing', () => {
    track('session_started', {});
    expect(getMissionsState().daily).toEqual({});
    expect(getMissionsState().weekly).toEqual({});
  });
  it('fires mission_progressed on every advance and mission_completed exactly once at target', () => {
    track('idle_reward_claimed', {}); // daily-idle-claim target 1 - completes immediately
    const progressed = getQueuedEvents().filter((e) => e.name === 'mission_progressed' && e.properties.missionId === 'daily-idle-claim');
    const completed = getQueuedEvents().filter((e) => e.name === 'mission_completed' && e.properties.missionId === 'daily-idle-claim');
    expect(progressed).toHaveLength(1);
    expect(completed).toHaveLength(1);
  });
  it('a claimed mission stops advancing for the rest of its period', () => {
    setMissionProgress('daily-battles', 3);
    claimMission('daily-battles');
    track('battle_completed', {});
    expect(getMissionProgress('daily-battles')).toMatchObject({ count: 3, claimed: true });
  });
  it('only wires up once even if initMissions is called again', () => {
    initMissions();
    initMissions();
    track('campaign_won', {});
    expect(getMissionProgress('daily-campaign-wins').count).toBe(1); // not double-counted
  });
});

describe('claimMission', () => {
  it('refuses an incomplete mission', () => {
    const r = claimMission('daily-idle-claim');
    expect(r).toMatchObject({ ok: false, gold: 0, gems: 0 });
  });
  it('grants the reward exactly once and marks claimed', () => {
    setMissionProgress('daily-battles', 3);
    const goldBefore = getEconomy().gold;
    const r = claimMission('daily-battles');
    expect(r.ok).toBe(true);
    expect(r.gold).toBeGreaterThan(0);
    expect(getEconomy().gold).toBe(goldBefore + r.gold);
    expect(isMissionComplete('daily-battles')).toBe(true);
    const again = claimMission('daily-battles');
    expect(again).toMatchObject({ ok: false, reason: 'Already claimed.' });
    expect(getEconomy().gold).toBe(goldBefore + r.gold); // not double-granted
  });
  it('emits mission_claimed with the granted amounts', () => {
    setMissionProgress('daily-ranked-win', 1);
    const r = claimMission('daily-ranked-win');
    const events = getQueuedEvents().filter((e) => e.name === 'mission_claimed');
    expect(events).toHaveLength(1);
    expect(events[0].properties).toMatchObject({ missionId: 'daily-ranked-win', gems: r.gems });
  });
  it('an unknown mission id is refused cleanly', () => {
    expect(claimMission('not-a-real-mission')).toMatchObject({ ok: false, reason: 'Unknown mission.' });
  });
});

describe('anyMissionClaimable / listMissions', () => {
  it('reflects ready-but-unclaimed missions only', () => {
    expect(anyMissionClaimable()).toBe(false);
    setMissionProgress('daily-battles', 3);
    expect(anyMissionClaimable()).toBe(true);
    claimMission('daily-battles');
    expect(anyMissionClaimable()).toBe(false);
  });
  it('listMissions filters by period and pairs every def with live progress', () => {
    setMissionProgress('weekly-daily-missions', 2);
    const weekly = listMissions('weekly');
    expect(weekly).toHaveLength(3);
    expect(weekly.find((r) => r.def.id === 'weekly-daily-missions')?.progress.count).toBe(2);
    const daily = listMissions('daily');
    expect(daily).toHaveLength(5);
  });
});

describe('period reset', () => {
  it('a stored day in the past resets the daily bucket but preserves the weekly one within the same week', () => {
    const now = 100 * DAY_MS + 60 * 60 * 1000; // well inside week 100/7's span, not at a boundary
    localStorage.setItem(
      MISSIONS_STORAGE_KEY,
      JSON.stringify({ version: 1, dayKey: dayKey(now) - 1, weekKey: weekKey(now), daily: { 'daily-battles': { count: 1, claimed: true } }, weekly: { 'weekly-daily-missions': { count: 3, claimed: false } } }),
    );
    reloadMissions();
    const state = getMissionsState(now);
    expect(state.daily).toEqual({}); // rolled over
    expect(state.weekly).toEqual({ 'weekly-daily-missions': { count: 3, claimed: false } }); // untouched
  });
  it('a stored week in the past resets the weekly bucket regardless of the daily one', () => {
    const now = 100 * WEEK_MS + 60 * 60 * 1000;
    localStorage.setItem(
      MISSIONS_STORAGE_KEY,
      JSON.stringify({ version: 1, dayKey: dayKey(now), weekKey: weekKey(now) - 1, daily: { 'daily-battles': { count: 1, claimed: false } }, weekly: { 'weekly-daily-missions': { count: 3, claimed: true } } }),
    );
    reloadMissions();
    const state = getMissionsState(now);
    expect(state.daily).toEqual({ 'daily-battles': { count: 1, claimed: false } }); // untouched
    expect(state.weekly).toEqual({}); // rolled over
  });
  it('a claimed daily mission is claimable again after the day rolls over', () => {
    setMissionProgress('daily-battles', 3);
    claimMission('daily-battles');
    expect(isMissionComplete('daily-battles')).toBe(true);
    const tomorrow = Date.now() + DAY_MS + 1000;
    getMissionsState(tomorrow); // triggers the rollover
    expect(getMissionProgress('daily-battles', getMissionsState(tomorrow))).toEqual({ count: 0, claimed: false });
  });
});

describe('malformed storage', () => {
  it('falls back cleanly without throwing', () => {
    localStorage.setItem(MISSIONS_STORAGE_KEY, '{nope');
    reloadMissions();
    expect(getMissionsState().daily).toEqual({});
  });
  it('drops entries for unknown ids or the wrong period', () => {
    localStorage.setItem(
      MISSIONS_STORAGE_KEY,
      JSON.stringify({ version: 1, dayKey: dayKey(), weekKey: weekKey(), daily: { 'ghost-mission': { count: 1, claimed: false }, 'weekly-daily-missions': { count: 1, claimed: false } }, weekly: {} }),
    );
    reloadMissions();
    expect(getMissionsState().daily).toEqual({}); // ghost id dropped, weekly-daily-missions is the wrong period for the daily bucket
  });
});

describe('resetMissions', () => {
  it('clears everything', () => {
    setMissionProgress('daily-battles', 3);
    claimMission('daily-battles');
    resetMissions();
    expect(getMissionsState().daily).toEqual({});
  });
});

describe('no recurring mission is pack-gated (PR #15)', () => {
  it('"Open a pack" and "Open 5 packs" are retired; nothing counts pack_opened', () => {
    expect(ALL_MISSIONS.map((m) => m.title)).not.toContain('Open a pack');
    expect(ALL_MISSIONS.map((m) => m.title)).not.toContain('Open 5 packs');
    expect(ALL_MISSIONS.filter((m) => m.metric === 'pack_opened' || m.metric === 'pack_ticket_used')).toEqual([]);
  });
  it('the replacements keep the old rewards', () => {
    expect(DAILY_MISSIONS.find((m) => m.id === 'daily-ranked-win')).toMatchObject({ title: 'Win a Ranked battle', metric: 'ranked_match_won', target: 1, rewardGold: 0, rewardGems: 20, rewardTickets: 0 });
    expect(WEEKLY_MISSIONS.find((m) => m.id === 'weekly-daily-missions')).toMatchObject({ title: 'Complete 5 daily missions', metric: 'daily_mission_completed', target: 5, rewardGold: 0, rewardGems: 100, rewardTickets: 1 });
  });
  it('the weekly Pack Ticket has exactly one recurring source', () => {
    expect(ALL_MISSIONS.filter((m) => m.rewardTickets > 0).map((m) => [m.id, m.rewardTickets])).toEqual([['weekly-daily-missions', 1]]);
  });
  it('a Ranked win completes "Win a Ranked battle"', () => {
    track('ranked_match_won', {});
    expect(isMissionComplete('daily-ranked-win')).toBe(true);
    expect(claimMission('daily-ranked-win')).toMatchObject({ ok: true, gems: 20 });
  });
  it('each completed daily mission advances "Complete 5 daily missions" once, and five complete it', () => {
    track('ranked_match_won', {}); // daily-ranked-win
    track('ranked_match_won', {}); // already complete: no second count
    track('idle_reward_claimed', {}); // daily-idle-claim
    track('ranked_match_started', {}); // daily-ranked
    expect(getMissionProgress('weekly-daily-missions').count).toBe(3);
    track('campaign_won', {}); // one of two: daily-campaign-wins not complete yet
    expect(getMissionProgress('weekly-daily-missions').count).toBe(3);
    track('campaign_won', {}); // daily-campaign-wins
    expect(isMissionComplete('weekly-daily-missions')).toBe(false);
    for (let i = 0; i < 3; i += 1) track('battle_completed', {}); // daily-battles
    expect(isMissionComplete('weekly-daily-missions')).toBe(true);
    const before = getEconomy();
    expect(claimMission('weekly-daily-missions')).toMatchObject({ ok: true, gems: 100, tickets: 1 });
    expect(getEconomy().tickets).toBe(before.tickets + 1);
    // Daily progress the nested weekly update ran alongside was kept, not overwritten.
    expect(DAILY_MISSIONS.every((m) => isMissionComplete(m.id))).toBe(true);
    expect(getQueuedEvents().filter((e) => e.name === 'daily_set_completed')).toHaveLength(1);
  });
});
