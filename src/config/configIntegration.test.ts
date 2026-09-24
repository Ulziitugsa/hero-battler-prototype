import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalProvider, setConfigProvider } from './config';
import { DEFAULT_CONFIG } from './defaults';
import { campaignFirstClearGems, campaignWinGold, chapterCompleteGems } from '../game/economy/rewards';
import { goldCostForLevelUp, heroLevelCapForAccount } from '../game/heroLevel/config';
import { goldPerHour } from '../game/campaign/idleRewards';
import { summonCost } from '../game/summon/summon';
import { getPool } from '../game/summon/pool';
import { recommendedPowerFor } from '../game/campaign/progress';
import { CHAPTER_1 } from '../game/campaign/chapter1';
import { claimMission, setMissionProgress } from '../game/missions/store';
import { claimJourneyDay } from '../game/journey/store';
import { reloadCollection } from '../game/collection/collection';
import { reloadEconomy, getEconomy } from '../game/economy/economy';
import { reloadMissions } from '../game/missions/store';
import { reloadJourney } from '../game/journey/store';

// Proves the Phase 8 abstraction actually flows end-to-end into the systems that were rewired, not just
// that getConfig() itself works (see config.test.ts for that). Each of these functions read config LIVE
// (inside the function body), so a provider swap mid-test takes effect on the very next call - no reload
// or remount needed.

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
  setConfigProvider(null);
  reloadCollection();
  reloadEconomy();
  reloadMissions();
  reloadJourney();
});

describe('economy/rewards.ts reads live config', () => {
  it('campaignFirstClearGems, chapterCompleteGems and campaignWinGold all respond to a provider swap', () => {
    expect(campaignFirstClearGems('battle')).toBe(DEFAULT_CONFIG.economy.campaignFirstClearGems.battle);
    setConfigProvider(createLocalProvider({ economy: { campaignFirstClearGems: { battle: 500 }, chapterCompleteGems: 777, campaignWinGold: { battle: 111 } } }));
    expect(campaignFirstClearGems('battle')).toBe(500);
    expect(chapterCompleteGems()).toBe(777);
    expect(campaignWinGold('battle')).toBe(111);
  });
});

describe('heroLevel/config.ts reads live config for economy tuning ONLY', () => {
  it('heroLevelCapForAccount and goldCostForLevelUp respond to a provider swap', () => {
    setConfigProvider(createLocalProvider({ heroLevel: { accountLevelCapMultiplier: 10, levelUpCostBase: 1000 } }));
    expect(heroLevelCapForAccount(1)).toBe(10); // 1 * 10, not the default 1 * 3
    expect(goldCostForLevelUp(0)).toBe(1000);
  });
});

describe('idleRewards.ts goldPerHour reads live config', () => {
  it('responds to a provider swap', () => {
    setConfigProvider(createLocalProvider({ idle: { goldPerHourBase: 1000, goldPerHourPerNode: 0 } }));
    expect(goldPerHour(0)).toBe(1000);
    expect(goldPerHour(50)).toBe(1000); // per-node contribution zeroed out too
  });
});

describe('summon/summon.ts summonCost reads live config for Tickets', () => {
  it('ticket cost responds to a provider swap; Gem cost stays banner-authored', () => {
    const pool = getPool('royal-vanguard');
    setConfigProvider(createLocalProvider({ summon: { ticketCostSingle: 7 } }));
    expect(summonCost(pool, 'single', 'tickets')).toBe(7);
    expect(summonCost(pool, 'single', 'gems')).toBe(pool.cost.single); // unaffected - per-banner content, not config
  });
});

describe('Campaign recommendedPowerFor - config override map', () => {
  it('an override replaces a specific node\'s recommendation without touching chapter1.ts', () => {
    const node = CHAPTER_1.nodes.find((n) => n.encounter?.recommendedRosterPower !== undefined)!;
    const authored = node.encounter!.recommendedRosterPower!;
    expect(recommendedPowerFor(node)).toBe(authored);
    setConfigProvider(createLocalProvider({ campaign: { recommendedPowerOverrides: { [node.id]: authored + 500 } } }));
    expect(recommendedPowerFor(node)).toBe(authored + 500);
  });
  it('a node with no override and no authored value stays undefined', () => {
    const storyNode = CHAPTER_1.nodes.find((n) => n.type === 'story')!;
    expect(recommendedPowerFor(storyNode)).toBeUndefined();
  });
});

describe('Missions - config reward override map', () => {
  it('claimMission grants the override amount instead of the definition\'s own reward', () => {
    setMissionProgress('daily-hero-level', 1);
    setConfigProvider(createLocalProvider({ missions: { rewardOverrides: { 'daily-hero-level': { gold: 5000 } } } }));
    const before = getEconomy().gold;
    const r = claimMission('daily-hero-level');
    expect(r.gold).toBe(5000);
    expect(getEconomy().gold).toBe(before + 5000);
  });
});

describe('Journey - config reward override map', () => {
  it('claimJourneyDay grants the override amount instead of the day\'s own reward', () => {
    // Day 2 needs to be unlocked (24h+ since first launch) - backdate first-seen directly, same as journey/store.test.ts.
    localStorage.setItem('skyloom:firstSeenAt', String(Date.now() - 24 * 60 * 60 * 1000));
    setConfigProvider(createLocalProvider({ journey: { rewardOverrides: { 2: { tickets: 42 } } } }));
    const before = getEconomy().tickets;
    const r = claimJourneyDay(2);
    expect(r.ok).toBe(true);
    expect(r.tickets).toBe(42);
    expect(getEconomy().tickets).toBe(before + 42);
  });
});
