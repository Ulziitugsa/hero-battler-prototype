import { beforeEach, describe, expect, it } from 'vitest';
import { GEM_REWARDS, MAX_GEMS, STARTING_GEMS } from './config';
import { canAfford, commitSummon, getEconomy, getGems, getPity, grantGems, isUnlimitedGems, reloadEconomy, resetEconomy, resetSummonState, setGems, setPity, setUnlimitedGems, spendGems, subscribeEconomy } from './economy';
import { ECONOMY_STORAGE_KEY, sanitizeEconomy } from './persistence';
import { campaignFirstClearGems, chapterCompleteGems, levelGems } from './rewards';

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
  reloadEconomy();
});

const stored = () => JSON.parse(localStorage.getItem(ECONOMY_STORAGE_KEY)!);

describe('fresh economy', () => {
  it('starts with the configured starting Gems, pity 0 and no history, and persists that on first read', () => {
    expect(getEconomy()).toEqual({ version: 2, gems: STARTING_GEMS, summon: { pity: {}, history: [] } });
    expect(stored().gems).toBe(STARTING_GEMS);
  });
});

describe('Gems', () => {
  it('grants, notifies subscribers and persists', () => {
    let calls = 0;
    const off = subscribeEconomy(() => calls++);
    const r = grantGems(50, 'dev');
    expect(r).toEqual({ gained: 50, balance: STARTING_GEMS + 50, source: 'dev' });
    expect(getGems()).toBe(STARTING_GEMS + 50);
    expect(stored().gems).toBe(STARTING_GEMS + 50);
    expect(calls).toBe(1);
    off();
  });
  it('ignores zero, negative and non-finite grants', () => {
    for (const bad of [0, -5, NaN, Infinity]) expect(grantGems(bad, 'dev').gained).toBe(0);
    expect(getGems()).toBe(STARTING_GEMS);
  });
  it('floors fractional grants and caps at MAX_GEMS', () => {
    setGems(0);
    expect(grantGems(10.9, 'dev').gained).toBe(10);
    setGems(MAX_GEMS - 5);
    expect(grantGems(100, 'dev')).toMatchObject({ gained: 5, balance: MAX_GEMS });
  });
  it('spends when affordable', () => {
    setGems(420);
    expect(canAfford(100)).toBe(true);
    expect(spendGems(100)).toBe(true);
    expect(getGems()).toBe(320);
  });
  it('refuses an unaffordable, negative or fractional spend and changes nothing', () => {
    setGems(60);
    expect(canAfford(100)).toBe(false);
    expect(spendGems(100)).toBe(false);
    expect(spendGems(-1)).toBe(false);
    expect(spendGems(1.5)).toBe(false);
    expect(getGems()).toBe(60);
  });
  it('can spend exactly the whole balance', () => {
    setGems(100);
    expect(spendGems(100)).toBe(true);
    expect(getGems()).toBe(0);
  });
  it('survives a reload from storage', () => {
    setGems(777);
    setPity('gravebound', 12);
    reloadEconomy();
    expect(getGems()).toBe(777);
    expect(getPity('gravebound')).toBe(12);
    expect(getPity('royal-vanguard')).toBe(0);
  });
});

describe('malformed storage', () => {
  it('falls back to a fresh economy on unparseable JSON without throwing', () => {
    localStorage.setItem(ECONOMY_STORAGE_KEY, '{nope');
    reloadEconomy();
    expect(getEconomy().gems).toBe(STARTING_GEMS);
  });
  it('falls back on non-object JSON', () => {
    localStorage.setItem(ECONOMY_STORAGE_KEY, '42');
    reloadEconomy();
    expect(getGems()).toBe(STARTING_GEMS);
  });
  it('sanitises impossible values', () => {
    const e = sanitizeEconomy({
      gems: -50,
      summon: { pity: { gravebound: 9999, 'no-such-banner': 5, 'infernal-hunt': -3 }, history: [{ cardId: 'kng-paladin', rarity: 'legendary', at: 5, wasNew: true, bannerId: 'royal-vanguard' }, { cardId: 'ghost', rarity: 'common', at: 1 }, { cardId: 'kng-archer', rarity: 'mythic', at: 1 }, 'junk'] },
    });
    expect(e.gems).toBe(0);
    expect(e.summon.pity).toEqual({ gravebound: 39 });
    expect(e.summon.history).toEqual([{ cardId: 'kng-paladin', rarity: 'legendary', at: 5, wasNew: true, bannerId: 'royal-vanguard' }]);
    expect(sanitizeEconomy({ gems: 'lots', summon: 'x' })).toMatchObject({ gems: 0, summon: { pity: {}, history: [] } });
    expect(sanitizeEconomy(null).gems).toBe(STARTING_GEMS);
  });
});

describe('schema migration', () => {
  it('a v1 save (single numeric pity, history without banners) keeps Gems and history and drops the old pity', () => {
    localStorage.setItem(ECONOMY_STORAGE_KEY, JSON.stringify({ version: 1, gems: 640, summon: { pity: 17, history: [{ cardId: 'kng-archer', rarity: 'common', at: 9, wasNew: true }] } }));
    reloadEconomy();
    expect(getGems()).toBe(640);
    expect(getEconomy().summon.pity).toEqual({});
    expect(getEconomy().summon.history).toEqual([{ cardId: 'kng-archer', rarity: 'common', at: 9, wasNew: true, bannerId: '' }]);
  });
});

describe('per-banner pity', () => {
  it('each banner keeps its own counter', () => {
    setPity('royal-vanguard', 17);
    setPity('gravebound', 4);
    setPity('infernal-hunt', 31);
    expect([getPity('royal-vanguard'), getPity('gravebound'), getPity('infernal-hunt')]).toEqual([17, 4, 31]);
    commitSummon(0, 'gravebound', 5, []);
    expect([getPity('royal-vanguard'), getPity('gravebound'), getPity('infernal-hunt')]).toEqual([17, 5, 31]);
  });
  it('resetSummonState clears every banner', () => {
    setPity('gravebound', 9);
    resetSummonState();
    expect(getPity('gravebound')).toBe(0);
  });
});

describe('dev-only Unlimited Gems', () => {
  it('is off by default and never changes real balances while off', () => {
    expect(isUnlimitedGems()).toBe(false);
    setGems(50);
    expect(canAfford(100)).toBe(false);
    expect(spendGems(100)).toBe(false);
    expect(commitSummon(100, 'gravebound', 1, [])).toBe(false);
  });
  it('when on (dev/test only) summons pass affordability without deducting, and turning it off restores the real check', () => {
    setGems(50);
    setUnlimitedGems(true);
    expect(isUnlimitedGems()).toBe(true);
    expect(canAfford(900)).toBe(true);
    expect(commitSummon(900, 'gravebound', 3, [])).toBe(true);
    expect(getGems()).toBe(50);
    expect(getPity('gravebound')).toBe(3);
    setUnlimitedGems(false);
    expect(isUnlimitedGems()).toBe(false);
    expect(canAfford(900)).toBe(false);
  });
});

describe('commitSummon', () => {
  const entry = (n: number) => ({ cardId: 'kng-archer', rarity: 'common' as const, at: n, wasNew: false, bannerId: 'royal-vanguard' });
  it('spends, sets pity and records history newest-first in one write', () => {
    setGems(1000);
    expect(commitSummon(900, 'royal-vanguard', 7, [entry(1), entry(2)])).toBe(true);
    expect(getGems()).toBe(100);
    expect(getPity('royal-vanguard')).toBe(7);
    expect(getEconomy().summon.history.map((h) => h.at)).toEqual([2, 1]);
  });
  it('changes nothing when unaffordable', () => {
    setGems(50);
    expect(commitSummon(100, 'royal-vanguard', 5, [entry(1)])).toBe(false);
    expect(getEconomy()).toMatchObject({ gems: 50, summon: { pity: {}, history: [] } });
  });
  it('caps history at 50', () => {
    setGems(100000);
    for (let i = 0; i < 70; i++) commitSummon(0, 'royal-vanguard', 0, [entry(i)]);
    expect(getEconomy().summon.history).toHaveLength(50);
    expect(getEconomy().summon.history[0].at).toBe(69);
  });
  it('resetSummonState clears pity + history but keeps Gems; resetEconomy restores the start', () => {
    setGems(500);
    commitSummon(0, 'royal-vanguard', 9, [entry(1)]);
    resetSummonState();
    expect(getEconomy()).toMatchObject({ gems: 500, summon: { pity: {}, history: [] } });
    resetEconomy();
    expect(getGems()).toBe(STARTING_GEMS);
  });
});

describe('Gem reward config', () => {
  it('is data-driven by node type and gives nothing for story/reward nodes', () => {
    expect(campaignFirstClearGems('battle')).toBe(20);
    expect(campaignFirstClearGems('challenge')).toBe(30);
    expect(campaignFirstClearGems('elite')).toBe(40);
    expect(campaignFirstClearGems('boss')).toBe(60);
    expect(campaignFirstClearGems('story')).toBe(0);
    expect(campaignFirstClearGems('reward')).toBe(0);
    expect(chapterCompleteGems()).toBe(100);
  });
  it('level milestones sum only the configured levels', () => {
    expect(levelGems([2, 3, 4])).toBe(0);
    expect(levelGems([5])).toBe(GEM_REWARDS.levelMilestones[5]);
    expect(levelGems([4, 5, 6, 10])).toBe(GEM_REWARDS.levelMilestones[5] + GEM_REWARDS.levelMilestones[10]);
  });
});
