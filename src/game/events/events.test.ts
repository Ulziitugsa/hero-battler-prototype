import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventPage } from '../../pages/EventPage';
import { clearQueuedEvents, getQueuedEvents, track } from '../../analytics/track';
import { getEconomy, reloadEconomy } from '../economy/economy';
import { clearCollection, getCollection, getOwnedCount, grantCard, reloadCollection } from '../collection/collection';
import { backgroundIsUnlocked, getBackground } from '../backgrounds/definitions';
import { THE_LONG_VIGIL, daysRemaining, eventPhase, getLiveEvent, EVENTS } from './definitions';
import { isEventCosmeticUnlocked, resetEventCosmetics } from './cosmetics';
import {
  EVENTS_STORAGE_KEY,
  claimEventMilestone,
  claimEventMission,
  claimLoginReward,
  claimableCount,
  completionRatio,
  isMilestoneDone,
  isMissionDone,
  getEventProgress,
  initEvents,
  reloadEvents,
  requirementProgress,
  resetEvents,
} from './store';
import { summarizeBattle } from './battleSummary';
import { hasDirectReward, type EventDefinition } from './types';
import { getCard } from '../cards';
import { PLAYTEST_ROSTER } from '../cards/roster';

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
const EVENT = THE_LONG_VIGIL;
const START = Date.parse(EVENT.startsAt);
const INSIDE = START + DAY_MS + 3_600_000;

function win(overrides: Record<string, number | string> = {}) {
  track('battle_completed', { mode: 'quick', result: 'win', rounds: 5, unitsPlayed: 0, spellsPlayed: 0, damageDealt: 0, undeadUnitsPlayed: 0, ...overrides });
}

beforeEach(() => {
  installLocalStoragePolyfill();
  vi.useFakeTimers();
  vi.setSystemTime(INSIDE);
  reloadEconomy();
  reloadCollection();
  resetEventCosmetics();
  resetEvents();
  initEvents();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('event definitions', () => {
  it('every event references real cards, backgrounds and a sane window', () => {
    for (const event of EVENTS) {
      expect(Date.parse(event.endsAt)).toBeGreaterThan(Date.parse(event.startsAt));
      const rewards = [...event.loginRewards.map((d) => d.reward), ...event.missions.map((m) => m.reward), ...event.milestones.map((m) => m.reward), event.finalReward.reward].filter(hasDirectReward);
      for (const reward of rewards) {
        for (const id of reward.cardIds ?? []) expect(() => getCard(id)).not.toThrow();
        if (reward.backgroundId) expect(getBackground(reward.backgroundId).id).toBe(reward.backgroundId);
        if (reward.backgroundId) expect(getBackground(reward.backgroundId).unlockType).toBe('event');
      }
      for (const id of event.featuredProduct?.featuredCardIds ?? []) expect(PLAYTEST_ROSTER).toContain(id);
      expect(new Set(event.missions.map((m) => m.id)).size).toBe(event.missions.length);
      expect(event.loginRewards.map((d) => d.day)).toEqual(event.loginRewards.map((_, i) => i + 1));
    }
  });

  it('knows its phase and live event from the clock', () => {
    expect(eventPhase(EVENT, START - 1)).toBe('upcoming');
    expect(eventPhase(EVENT, START)).toBe('active');
    expect(eventPhase(EVENT, Date.parse(EVENT.endsAt))).toBe('ended');
    expect(getLiveEvent(INSIDE)?.id).toBe(EVENT.id);
    expect(getLiveEvent(Date.parse(EVENT.endsAt))).toBeNull();
    expect(daysRemaining(EVENT, Date.parse(EVENT.endsAt) - 1)).toBe(1);
  });

  it('picks the most recently started event when windows overlap', () => {
    const later: EventDefinition = { ...EVENT, id: 'later', startsAt: new Date(INSIDE - 1000).toISOString() };
    expect(getLiveEvent(INSIDE, [EVENT, later])?.id).toBe('later');
  });
});

describe('event missions', () => {
  it('count wins and sum numeric properties from the analytics stream', () => {
    win({ undeadUnitsPlayed: 4, damageDealt: 6_000 });
    win({ undeadUnitsPlayed: 3, damageDealt: 9_000 });
    track('battle_completed', { mode: 'quick', result: 'loss', undeadUnitsPlayed: 5, damageDealt: 4_000 });
    const progress = getEventProgress(EVENT.id);
    expect(progress.missions['vigil-win-battles'].count).toBe(2);
    expect(progress.missions['vigil-undead-units'].count).toBe(10);
    expect(progress.missions['vigil-damage'].count).toBe(18_000); // card-combat scale, capped at target
  });

  it('counts cards pulled from any Box toward "Pull 5 cards", one per card', () => {
    track('box_pulled', { boxId: 'vanguard', pullCount: 1 });
    expect(getEventProgress(EVENT.id).missions['vigil-open-packs'].count).toBe(1);
    track('box_pulled', { boxId: 'hellfire', pullCount: 10 });
    expect(getEventProgress(EVENT.id).missions['vigil-open-packs'].count).toBe(5); // capped at the target
  });

  it('respects property filters', () => {
    track('battle_completed', { mode: 'quick', result: 'loss' });
    expect(getEventProgress(EVENT.id).missions['vigil-win-battles']).toBeUndefined();
    win();
    expect(getEventProgress(EVENT.id).missions['vigil-win-battles'].count).toBe(1);
  });

  it('does not count anything outside the event window', () => {
    vi.setSystemTime(Date.parse(EVENT.endsAt) + 1000);
    win();
    expect(getEventProgress(EVENT.id).missions['vigil-win-battles']).toBeUndefined();
  });

  it('claims once, only when complete, through the existing economy', () => {
    win();
    expect(claimEventMission(EVENT.id, 'vigil-win-battles').ok).toBe(false);
    win(); win();
    const goldBefore = getEconomy().gold;
    const result = claimEventMission(EVENT.id, 'vigil-win-battles');
    expect(result.ok).toBe(true);
    expect(getEconomy().gold - goldBefore).toBe(80);
    expect(claimEventMission(EVENT.id, 'vigil-win-battles').reason).toBe('Already claimed.');
    win();
    expect(getEventProgress(EVENT.id).missions['vigil-win-battles']).toEqual({ count: 3, claimed: true });
  });
});

describe('login rewards', () => {
  it('grant one day per calendar day, in order', () => {
    expect(claimLoginReward(EVENT.id).ok).toBe(true);
    expect(claimLoginReward(EVENT.id).ok).toBe(false);
    expect(getEventProgress(EVENT.id).loginClaims).toBe(1);
    vi.setSystemTime(INSIDE + DAY_MS);
    const gemsBefore = getEconomy().gems;
    expect(claimLoginReward(EVENT.id).ok).toBe(true);
    expect(getEconomy().gems - gemsBefore).toBe(20);
  });

  it('stop once every day is claimed and after the event ends', () => {
    for (let day = 0; day < EVENT.loginRewards.length; day += 1) {
      vi.setSystemTime(INSIDE + day * DAY_MS);
      expect(claimLoginReward(EVENT.id).ok).toBe(true);
    }
    expect(getOwnedCount('und-grave-sage')).toBeGreaterThan(0);
    vi.setSystemTime(INSIDE + 10 * DAY_MS);
    expect(claimLoginReward(EVENT.id).reason).toBe('Every login reward is claimed.');
    resetEvents();
    vi.setSystemTime(Date.parse(EVENT.endsAt));
    expect(claimLoginReward(EVENT.id).reason).toBe('This event has ended.');
  });
});

describe('milestones and final reward', () => {
  function completeAllMissions() {
    for (const mission of EVENT.missions) {
      const o = mission.objective;
      const props: Record<string, string | number> = { ...(o.where ?? {}) } as Record<string, string | number>;
      if (o.kind === 'sum') props[o.property] = mission.target;
      const times = o.kind === 'count' ? mission.target : 1;
      for (let i = 0; i < times; i += 1) track(o.event, props);
    }
  }

  it('mission-count milestones unlock as missions complete', () => {
    win(); win(); win();
    expect(claimEventMilestone(EVENT.id, 'vigil-missions-3').ok).toBe(false);
    completeAllMissions();
    expect(claimEventMilestone(EVENT.id, 'vigil-missions-3').ok).toBe(true);
    expect(claimEventMilestone(EVENT.id, 'vigil-missions-5').ok).toBe(true);
  });

  it('collection milestone reads owned cards (a progress-only objective: done, nothing to claim)', () => {
    clearCollection();
    const milestone = EVENT.milestones.find((m) => m.id === 'vigil-collect-4')!;
    expect(requirementProgress(EVENT, milestone.requirement, getEventProgress(EVENT.id)).current).toBe(0);
    for (const id of ['und-wraith-prince', 'und-grave-sage', 'und-grave-knight']) grantCard(id);
    expect(isMilestoneDone(EVENT, milestone, getEventProgress(EVENT.id))).toBe(false);
    grantCard('und-dark-priest');
    expect(isMilestoneDone(EVENT, milestone, getEventProgress(EVENT.id))).toBe(true);
    expect(claimEventMilestone(EVENT.id, 'vigil-collect-4').ok).toBe(false);
  });

  it('the final reward grants its card and unlocks the event background permanently', () => {
    const violet = getBackground('violet-grove');
    expect(backgroundIsUnlocked(violet, 0)).toBe(false);
    expect(claimEventMilestone(EVENT.id, EVENT.finalReward.id).ok).toBe(false);
    completeAllMissions();
    const before = getOwnedCount('und-wraith-prince');
    expect(claimEventMilestone(EVENT.id, EVENT.finalReward.id).ok).toBe(true);
    expect(getOwnedCount('und-wraith-prince')).toBe(before + 1);
    expect(isEventCosmeticUnlocked('violet-grove')).toBe(true);
    vi.setSystemTime(Date.parse(EVENT.endsAt) + DAY_MS);
    expect(backgroundIsUnlocked(violet, 0)).toBe(true);
  });

  it('claimable count and completion reflect state', () => {
    expect(claimableCount(EVENT, getEventProgress(EVENT.id))).toBe(1); // today's login reward
    claimLoginReward(EVENT.id);
    expect(claimableCount(EVENT, getEventProgress(EVENT.id))).toBe(0);
    win(); win(); win();
    expect(claimableCount(EVENT, getEventProgress(EVENT.id))).toBe(1);
    claimEventMission(EVENT.id, 'vigil-win-battles');
    const total = EVENT.loginRewards.length + EVENT.missions.length + EVENT.milestones.length + 1;
    expect(completionRatio(EVENT, getEventProgress(EVENT.id))).toBeCloseTo(2 / total);
    expect(claimableCount(EVENT, getEventProgress(EVENT.id), Date.parse(EVENT.endsAt))).toBe(0);
  });
});

describe('progress-only objectives and the login checkpoint (Ticket cleanup, 2026-10-04)', () => {
  const PROGRESS_ONLY = ['vigil-ranked-wins', 'vigil-shop-gift'];
  const wallet = () => { const e = getEconomy(); return { gold: e.gold, gems: e.gems, tickets: e.tickets }; };
  const checkInDays = (n: number) => { const results = []; for (let d = 0; d < n; d += 1) { vi.setSystemTime(INSIDE + d * DAY_MS); results.push(claimLoginReward(EVENT.id)); } return results; };
  const render = () => renderToStaticMarkup(createElement(EventPage, { onBack: () => {}, onOpenShop: () => {} }));

  it('the Long Vigil grants exactly one Pack Ticket, from login Day 6; Day 3 is a checkpoint that grants nothing', () => {
    const grants = [...EVENT.loginRewards.map((d) => d.reward), ...EVENT.missions.map((m) => m.reward), ...EVENT.milestones.map((m) => m.reward), EVENT.finalReward.reward];
    expect(grants.reduce((n, r) => n + (r?.tickets ?? 0), 0)).toBe(1);
    expect(EVENT.loginRewards.find((d) => d.reward?.tickets)?.day).toBe(6);
    expect(EVENT.loginRewards[2]).toEqual({ day: 3 });
    checkInDays(2);
    const before = { wallet: wallet(), cards: { ...getCollection() } };
    clearQueuedEvents();
    vi.setSystemTime(INSIDE + 2 * DAY_MS);
    const day3 = claimLoginReward(EVENT.id);
    expect(day3).toEqual({ ok: true, reason: null, granted: {}, checkpoint: true });
    expect({ wallet: wallet(), cards: { ...getCollection() } }).toEqual(before);
    const tracked = getQueuedEvents().find((e) => e.name === 'event_login_claimed')?.properties ?? {};
    expect(tracked).toMatchObject({ eventId: EVENT.id, day: 3, checkpoint: true });
    for (const key of ['cards', 'backgroundId']) expect(tracked).not.toHaveProperty(key); // no reward payload is reported
    expect(getEventProgress(EVENT.id).loginClaims).toBe(3);
    const ticketsBefore = getEconomy().tickets;
    const [day4, day5, day6] = [3, 4, 5].map((d) => { vi.setSystemTime(INSIDE + d * DAY_MS); return claimLoginReward(EVENT.id); });
    expect([day4.checkpoint, day5.checkpoint, day6.checkpoint]).toEqual([undefined, undefined, undefined]);
    expect(day6.granted).toEqual({ tickets: 1 });
    expect(getEconomy().tickets).toBe(ticketsBefore + 1);
  });

  it('progress-only objectives complete, persist and count toward Complete N missions without granting anything', () => {
    const before = wallet();
    clearQueuedEvents();
    track('ranked_match_won', {}); track('ranked_match_won', {});
    for (let i = 0; i < 3; i += 1) track('shop_free_claimed', {});
    for (const id of PROGRESS_ONLY) {
      const mission = EVENT.missions.find((m) => m.id === id)!;
      expect(mission.reward).toBeUndefined();
      expect(isMissionDone(mission, getEventProgress(EVENT.id))).toBe(true);
      expect(claimEventMission(EVENT.id, id)).toMatchObject({ ok: false, granted: {} });
    }
    expect(wallet()).toEqual(before);
    expect(getQueuedEvents().some((e) => e.name === 'event_reward_claimed')).toBe(false);
    expect(requirementProgress(EVENT, { kind: 'missionsCompleted', count: 3 }, getEventProgress(EVENT.id)).current).toBe(2);
    expect(claimableCount(EVENT, getEventProgress(EVENT.id))).toBe(1); // only today's login reward: nothing to claim here
    reloadEvents();
    for (const id of PROGRESS_ONLY) expect(isMissionDone(EVENT.missions.find((m) => m.id === id)!, getEventProgress(EVENT.id))).toBe(true);
    win(); win(); win();
    expect(claimEventMilestone(EVENT.id, 'vigil-missions-3').ok).toBe(true); // two objectives + one reward mission
    expect(completionRatio(EVENT, getEventProgress(EVENT.id))).toBeGreaterThan(0);
  });

  it('the final reward unlocks once every mission is complete, progress-only objectives included', () => {
    for (const mission of EVENT.missions) {
      const o = mission.objective;
      const props: Record<string, string | number> = { ...(o.where ?? {}) } as Record<string, string | number>;
      if (o.kind === 'sum') props[o.property] = mission.target;
      for (let i = 0; i < (o.kind === 'count' ? mission.target : 1); i += 1) track(o.event, props);
    }
    // Nothing claimed at all: the final reward reads completion, not claims.
    const result = claimEventMilestone(EVENT.id, EVENT.finalReward.id);
    expect(result.ok).toBe(true);
    expect(result.granted.cardIds).toEqual(['und-wraith-prince']);
  });

  it('the page shows checkpoints and objectives as progress: no empty reward chips, no Claim on nothing', () => {
    vi.setSystemTime(INSIDE + 2 * DAY_MS);
    checkInDays(2); // Day 3 is today's entry
    vi.setSystemTime(INSIDE + 2 * DAY_MS);
    track('ranked_match_won', {}); track('ranked_match_won', {});
    let html = render();
    expect(html).not.toMatch(/<span class="event-reward-chips"><\/span>/);
    const day3 = html.match(/<li class="ready checkpoint">.*?<\/li>/)?.[0] ?? '';
    expect(day3.replace(/<[^>]+>/g, ' ')).toMatch(/Day\s+3/);
    expect(day3).toContain('Check in');
    expect(day3).not.toContain('Claim');
    expect(html).toMatch(/<li class="reward-day"><small>Day 6<\/small><span class="event-reward-chips"><span[^>]*><svg class="ticket-icon"[^]*?<\/svg>1<\/span>/);
    const ranked = html.match(/<li class="event-row objective done">.*?<\/li>/)?.[0] ?? '';
    expect(ranked).toContain('Win 2 Ranked matches');
    expect(ranked).toContain('Objective');
    expect(ranked).toContain('Complete');
    expect(ranked).not.toMatch(/Claim|event-reward-chips/);
    expect(html).toContain('<h2 id="event-login-title">Daily login</h2>');
    claimLoginReward(EVENT.id);
    html = render();
    expect(html).toMatch(/<li class="claimed checkpoint">/);
  });
});

describe('persistence', () => {
  it('survives a reload and ignores malformed or unknown data', () => {
    win();
    claimLoginReward(EVENT.id);
    reloadEvents();
    expect(getEventProgress(EVENT.id).missions['vigil-win-battles'].count).toBe(1);
    expect(getEventProgress(EVENT.id).loginClaims).toBe(1);

    localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify({ version: 1, events: { 'gone-event': { loginClaims: 3 }, [EVENT.id]: { loginClaims: 99, missions: { 'vigil-win-battles': { count: 999, claimed: 'yes' }, bogus: { count: 1 } }, claimed: ['vigil-final', 'nope', 7] } } }));
    reloadEvents();
    const progress = getEventProgress(EVENT.id);
    expect(progress.loginClaims).toBe(EVENT.loginRewards.length);
    expect(progress.missions).toEqual({ 'vigil-win-battles': { count: 3, claimed: false } });
    expect(progress.claimed).toEqual(['vigil-final']);

    localStorage.setItem(EVENTS_STORAGE_KEY, '{not json');
    reloadEvents();
    expect(getEventProgress(EVENT.id).loginClaims).toBe(0);
  });

  it('an old save with no event data starts with empty progress', () => {
    localStorage.removeItem(EVENTS_STORAGE_KEY);
    reloadEvents();
    expect(getEventProgress(EVENT.id)).toEqual({ loginClaims: 0, lastLoginDay: null, missions: {}, claimed: [] });
  });
});

describe('summarizeBattle', () => {
  it('counts the player side only: units by faction, spells and damage to the opponent', () => {
    const summary = summarizeBattle('PLAYER_WIN', [
      { type: 'ROUND_START', round: 1 },
      { type: 'REVEAL', handRemovals: [], placements: [
        { side: 'player', lane: 'left', zone: 'hero', instanceId: 'a', cardId: 'und-bone-soldier' },
        { side: 'player', lane: 'center', zone: 'hero', instanceId: 'b', cardId: 'kng-archer' },
        { side: 'enemy', lane: 'left', zone: 'hero', instanceId: 'c', cardId: 'und-bone-soldier' },
      ] },
      { type: 'ON_PLAY', side: 'player', instanceId: 'd', cardId: 'spl-grave-totem', name: 'Grave Totem', lane: 'right', zone: 'spell' },
      { type: 'SPELL_RESOLVED', side: 'player', lane: 'left', cardId: 'spl-fireball', name: 'Fireball', fizzled: false },
      { type: 'SPELL_RESOLVED', side: 'enemy', lane: 'left', cardId: 'spl-fireball', name: 'Fireball', fizzled: false },
      { type: 'ROUND_START', round: 2 },
      { type: 'DIRECT_DAMAGE', side: 'enemy', amount: 30, from: 100, to: 70, sourceName: 'x' },
      { type: 'DIRECT_DAMAGE', side: 'player', amount: 25, from: 100, to: 75, sourceName: 'y' },
      { type: 'OVERFLOW_DAMAGE', side: 'enemy', lane: 'left', amount: 12, from: 70, to: 58, winnerName: 'a', loserName: 'c', winnerInstanceId: 'a', loserInstanceId: 'c' },
    ], 'ranked');
    expect(summary).toMatchObject({ mode: 'ranked', result: 'win', rounds: 2, unitsPlayed: 2, undeadUnitsPlayed: 1, kingdomUnitsPlayed: 1, spellsPlayed: 2, damageDealt: 42 });
    expect(summarizeBattle('DRAW', [], 'quick').result).toBe('draw');
    expect(summarizeBattle('ENEMY_WIN', [], 'quick').result).toBe('loss');
  });
});
