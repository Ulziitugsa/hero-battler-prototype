import { beforeEach, describe, expect, it } from 'vitest';
import { getCollection, reloadCollection } from '../collection/collection';
import { GEM_REWARDS, STARTING_GEMS } from '../economy/config';
import { getGems, reloadEconomy, setGems } from '../economy/economy';
import { getAccount, grantXp, reloadAccount, setLevel } from '../progression/account';
import type { MatchStats } from '../engine/stats';
import { CHAPTER_1 } from './chapter1';
import { clearNonBattleNode, recordBattleResult } from './progress';

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
  reloadAccount();
  reloadEconomy();
  setGems(0);
});

const stats = { roundsPlayed: 4, finalPlayerHp: 20 } as unknown as MatchStats;
const win = (nodeId: string) => recordBattleResult(nodeId, 'PLAYER_WIN', stats, [], 'kingdom');
const nodeOfType = (type: string) => CHAPTER_1.nodes.find((n) => n.type === type && n.encounter)!;

describe('Campaign Gem rewards', () => {
  it('a first clear grants the Gems for its node type, and reports them', () => {
    for (const type of ['battle', 'challenge', 'elite', 'boss'] as const) {
      const node = nodeOfType(type);
      const before = getGems();
      const r = win(node.id);
      expect(r.gems, type).toBe(GEM_REWARDS.campaignFirstClear[type]);
      expect(getGems() - before, type).toBe(GEM_REWARDS.campaignFirstClear[type]);
    }
  });
  it('replays, and losses, grant no Gems', () => {
    const node = nodeOfType('battle');
    win(node.id);
    const after = getGems();
    expect(win(node.id).gems).toBe(0);
    const fresh = nodeOfType('elite');
    expect(recordBattleResult(fresh.id, 'ENEMY_WIN', stats, [], 'kingdom').gems).toBe(0);
    expect(getGems()).toBe(after);
  });
  it('Gems are awarded alongside the card reward, not instead of it', () => {
    const node = nodeOfType('battle');
    const r = win(node.id);
    expect(r.gems).toBeGreaterThan(0);
    expect(r.cardGrant).not.toBeNull();
    expect(getCollection()[node.encounter!.firstClearReward.cardId!]).toBeGreaterThan(0);
  });
  it('clearing the chapter pays the chapter bonus exactly once, on top of each first clear', () => {
    let expected = 0;
    let chapterBonusSeen = 0;
    for (const node of CHAPTER_1.nodes) {
      if (node.encounter) {
        expected += GEM_REWARDS.campaignFirstClear[node.type];
        win(node.id);
      } else {
        const r = clearNonBattleNode(node.id);
        if (r.chapterComplete) {
          chapterBonusSeen += r.gems;
          expected += GEM_REWARDS.chapterComplete;
        }
        expected += GEM_REWARDS.campaignFirstClear[node.type];
      }
    }
    expect(chapterBonusSeen).toBe(GEM_REWARDS.chapterComplete);
    expect(getGems()).toBe(expected);
    // replaying / re-claiming the finished chapter pays nothing more
    const bossId = nodeOfType('boss').id;
    expect(win(bossId).gems).toBe(0);
    expect(getGems()).toBe(expected);
  });
});

describe('Account Level Gem milestones', () => {
  it('paying out only at configured milestone levels, and reporting it', () => {
    const r = grantXp(100_000);
    expect(r.levelsGained.length).toBeGreaterThan(4);
    const expected = r.levelsGained.reduce((n, l) => n + (GEM_REWARDS.levelMilestones[l] ?? 0), 0);
    expect(expected).toBeGreaterThan(0);
    expect(r.gemsGained).toBe(expected);
    expect(getGems()).toBe(expected);
  });
  it('a level-up that crosses no milestone pays nothing', () => {
    const r = grantXp(100); // Level 1 -> 2
    expect(r.levelsGained).toEqual([2]);
    expect(r.gemsGained).toBe(0);
    expect(getGems()).toBe(0);
  });
  it('dev setLevel does not grant Gems', () => {
    setLevel(10);
    expect(getAccount().level).toBe(10);
    expect(getGems()).toBe(0);
  });
});

describe('Quick Battle', () => {
  it('has no Gem reward configured', () => {
    expect(Object.keys(GEM_REWARDS)).toEqual(['campaignFirstClear', 'chapterComplete', 'levelMilestones']);
    expect(STARTING_GEMS).toBeGreaterThanOrEqual(0);
  });
});
