import { beforeEach, describe, expect, it } from 'vitest';
import { canUpgradeMastery, equipMastery, getAccount, getEquippedLoadout, grantXp, masteryPointsAvailable, masteryPointsEarned, reloadAccount, resetProgression, setLevel, subscribeAccount, unlockMastery, upgradeMastery } from './account';
import { ACCOUNT_STORAGE_KEY, defaultAccount, sanitizeAccount } from './persistence';
import { MAX_LEVEL, XP_REWARDS, xpToNextLevel } from './config';
import { campaignXp, grantCampaignXp, grantQuickBattleXp, quickBattleXp } from './rewards';

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
  reloadAccount();
});

const stored = () => JSON.parse(localStorage.getItem(ACCOUNT_STORAGE_KEY)!);

describe('fresh profile', () => {
  it('starts at Level 1, 0 XP, with Fortification unlocked and equipped', () => {
    expect(getAccount()).toMatchObject({ version: 1, level: 1, xp: 0, totalXp: 0, unlockedMasteries: { fortification: 1 }, equippedMasteryId: 'fortification' });
    expect(getEquippedLoadout()).toEqual({ id: 'fortification', rank: 1 });
    expect(stored().level).toBe(1); // persisted on first read
  });
});

describe('granting XP', () => {
  it('adds XP below the threshold without levelling', () => {
    const r = grantXp(40);
    expect(r).toMatchObject({ gained: 40, levelBefore: 1, levelAfter: 1, levelsGained: [], xpAfter: 40 });
    expect(getAccount().xp).toBe(40);
  });
  it('levels up exactly at the threshold with 0 XP left', () => {
    const r = grantXp(xpToNextLevel(1));
    expect(r).toMatchObject({ levelAfter: 2, levelsGained: [2], xpAfter: 0 });
  });
  it('carries excess XP into the next level', () => {
    grantXp(90);
    const r = grantXp(30); // 120 total: level 2 with 20 left
    expect(r).toMatchObject({ levelAfter: 2, xpAfter: 20 });
  });
  it('handles multiple level-ups from one grant and never loses XP', () => {
    // Level 1 -> 2 needs 100, 2 -> 3 needs 150, 3 -> 4 needs 200: 100+150+200 = 450, +30 left
    const r = grantXp(480);
    expect(r).toMatchObject({ levelBefore: 1, levelAfter: 4, levelsGained: [2, 3, 4], xpAfter: 30 });
    expect(getAccount().totalXp).toBe(480);
  });
  it('ignores non-positive / non-finite amounts', () => {
    expect(grantXp(0).gained).toBe(0);
    expect(grantXp(-50).gained).toBe(0);
    expect(grantXp(NaN).gained).toBe(0);
    expect(getAccount()).toMatchObject({ level: 1, xp: 0 });
  });
  it('stops at the max level', () => {
    setLevel(MAX_LEVEL);
    const r = grantXp(10_000);
    expect(r.levelAfter).toBe(MAX_LEVEL);
    expect(getAccount().xp).toBe(0);
  });
  it('persists across a reload and notifies subscribers', () => {
    let calls = 0;
    const off = subscribeAccount(() => calls++);
    grantXp(120);
    expect(calls).toBe(1);
    off();
    reloadAccount();
    expect(getAccount()).toMatchObject({ level: 2, xp: 20 });
  });
});

describe('malformed storage', () => {
  it('falls back to a fresh profile on unparseable JSON', () => {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, '{nope');
    reloadAccount();
    expect(getAccount()).toMatchObject({ level: 1, xp: 0, equippedMasteryId: 'fortification' });
  });
  it('sanitises impossible values instead of trusting them', () => {
    const a = sanitizeAccount({ level: 9999, xp: -5, totalXp: 'x', unlockedMasteries: { necromancy: 99, ghost: 3, fortification: 0 }, equippedMasteryId: 'blood-pact' });
    expect(a.level).toBe(MAX_LEVEL);
    expect(a.xp).toBe(0);
    expect(a.totalXp).toBe(0);
    expect(a.unlockedMasteries).toEqual({ necromancy: 4, fortification: 1 });
    expect(a.equippedMasteryId).toBeNull(); // Blood Pact is neither unlocked nor implemented
    expect(sanitizeAccount(null)).toEqual(defaultAccount());
    expect(sanitizeAccount({ level: 3, xp: 9999 }).xp).toBe(xpToNextLevel(3) - 1);
  });
  it('self-heals: a level that should have unlocked a Mastery gets it on load', () => {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify({ version: 1, level: 5, xp: 0, totalXp: 0, unlockedMasteries: { fortification: 1 }, equippedMasteryId: 'fortification' }));
    reloadAccount();
    expect(getAccount().unlockedMasteries.necromancy).toBe(1);
  });
});

describe('Mastery unlocks, equip and ranks', () => {
  it('Necromancy unlocks at Level 3 and the grant reports it', () => {
    expect(getAccount().unlockedMasteries.necromancy).toBeUndefined();
    const r = grantXp(xpToNextLevel(1) + xpToNextLevel(2)); // -> level 3
    expect(r.masteriesUnlocked).toEqual(['necromancy']);
    expect(getAccount().unlockedMasteries.necromancy).toBe(1);
  });
  it('a locked or unimplemented Mastery cannot be equipped', () => {
    expect(equipMastery('necromancy')).toBe(false);
    expect(getAccount().equippedMasteryId).toBe('fortification');
    setLevel(10);
    expect(equipMastery('blood-pact')).toBe(false); // defined but not implemented
    expect(equipMastery('necromancy')).toBe(true);
  });
  it('only one Mastery is equipped at a time, and it persists', () => {
    setLevel(4);
    equipMastery('necromancy');
    expect(getAccount().equippedMasteryId).toBe('necromancy');
    equipMastery('fortification');
    expect(getAccount().equippedMasteryId).toBe('fortification');
    reloadAccount();
    expect(getAccount().equippedMasteryId).toBe('fortification');
    expect(getEquippedLoadout()).toEqual({ id: 'fortification', rank: 1 });
    expect(equipMastery(null)).toBe(true);
    expect(getEquippedLoadout()).toBeNull();
  });
  it('awards a Mastery Point at even levels and spends it on a rank', () => {
    expect(masteryPointsEarned(1)).toBe(0);
    expect(masteryPointsEarned(2)).toBe(1);
    expect(masteryPointsEarned(5)).toBe(2);
    expect(canUpgradeMastery('fortification')).toBe(false); // no points at Level 1
    expect(upgradeMastery('fortification')).toBe(false);
    const r = grantXp(xpToNextLevel(1));
    expect(r.masteryPointsGained).toBe(1);
    expect(masteryPointsAvailable()).toBe(1);
    expect(upgradeMastery('fortification')).toBe(true);
    expect(getAccount().unlockedMasteries.fortification).toBe(2);
    expect(masteryPointsAvailable()).toBe(0);
    reloadAccount();
    expect(getAccount().unlockedMasteries.fortification).toBe(2); // rank persists
  });
  it('cannot rank past the max rank, or rank a locked Mastery', () => {
    setLevel(20);
    unlockMastery('necromancy', 1);
    for (let i = 0; i < 10; i++) upgradeMastery('necromancy');
    expect(getAccount().unlockedMasteries.necromancy).toBe(4);
    resetProgression();
    expect(upgradeMastery('necromancy')).toBe(false);
  });
});

describe('XP rewards', () => {
  it('Campaign: first clear pays more than a replay win, a loss pays a little', () => {
    expect(campaignXp('battle', { won: true, isFirstClear: true })).toBe(XP_REWARDS.campaignFirstClear.battle);
    expect(campaignXp('boss', { won: true, isFirstClear: true })).toBeGreaterThan(campaignXp('battle', { won: true, isFirstClear: true }));
    expect(campaignXp('battle', { won: true, isFirstClear: false })).toBe(XP_REWARDS.campaignReplayWin);
    expect(XP_REWARDS.campaignReplayWin).toBeLessThan(XP_REWARDS.campaignFirstClear.battle);
    expect(campaignXp('battle', { won: false, isFirstClear: false })).toBe(XP_REWARDS.campaignLoss);
    expect(grantCampaignXp('battle', { won: true, isFirstClear: true }).gained).toBe(40);
  });
  it('Quick Battle: small XP, more for a win', () => {
    expect(quickBattleXp('PLAYER_WIN')).toBe(15);
    expect(quickBattleXp('ENEMY_WIN')).toBe(5);
    expect(quickBattleXp('DRAW')).toBe(5);
    grantQuickBattleXp('PLAYER_WIN');
    expect(getAccount().xp).toBe(15);
  });
});
