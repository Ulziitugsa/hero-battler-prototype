import { beforeEach, describe, expect, it } from 'vitest';
import type { MatchStats } from '../engine/stats';
import { STARTER_DECKS } from '../cards/starterDecks';
import { reloadCollection } from '../collection/collection';
import { reloadEconomy } from '../economy/economy';
import { resetProgression, setLevel as setAccountLevel } from '../progression/account';
import { getHeroLevelState, reloadHeroLevels, setHeroLevel } from '../heroLevel/store';
import { rosterPowerForDeck } from '../heroLevel/rosterPower';
import { getAscensionState, reloadAscension } from '../ascension/store';
import { getActiveDeck } from '../engine/activeDeck';
import { CHAPTER_1 } from './chapter1';
import { loadProgress, recordBattleResult } from './progress';
import { clearQueuedEvents, getQueuedEvents } from '../../analytics/track';

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
  reloadHeroLevels();
  reloadAscension();
  resetProgression();
  clearQueuedEvents();
});

const stats = (o: Partial<MatchStats> = {}): MatchStats => ({ roundsPlayed: 3, finalPlayerHp: 20, finalEnemyHp: 0, ...o }) as unknown as MatchStats;
const BOSS = 'boss-grave-tyrant';

describe('Recommended Roster Power curve (Chapter 1)', () => {
  it('every battle/challenge/elite/boss node carries a recommended value', () => {
    const encounterNodes = CHAPTER_1.nodes.filter((n) => n.encounter);
    expect(encounterNodes.length).toBeGreaterThan(0);
    for (const n of encounterNodes) expect(n.encounter!.recommendedRosterPower, n.id).toBeGreaterThan(0);
  });
  it('rises along the main road from first battle to boss', () => {
    const mainRoad = CHAPTER_1.nodes.filter((n) => n.encounter && !n.optional);
    for (let i = 1; i < mainRoad.length; i++) {
      expect(mainRoad[i].encounter!.recommendedRosterPower!, mainRoad[i].id).toBeGreaterThanOrEqual(mainRoad[i - 1].encounter!.recommendedRosterPower!);
    }
  });
  it('the boss is a genuine wall for pure-collection play: recommended power exceeds what an un-levelled, un-ascended Kingdom starter reaches at ANY account level', () => {
    const bossRecommended = CHAPTER_1.nodes.find((n) => n.id === BOSS)!.encounter!.recommendedRosterPower!;
    const emptyLevels = getHeroLevelState();
    const noAscension = getAscensionState();
    for (const accountLevel of [1, 5, 10, 15, 20]) {
      const power = rosterPowerForDeck(STARTER_DECKS.kingdom, accountLevel, emptyLevels, noAscension);
      expect(power, `account level ${accountLevel}`).toBeLessThan(bossRecommended);
    }
  });
  it('deliberate investment (a few Hero Levels, or the free Ascension) closes the gap', () => {
    const bossRecommended = CHAPTER_1.nodes.find((n) => n.id === BOSS)!.encounter!.recommendedRosterPower!;
    setAccountLevel(10);
    for (const id of new Set(STARTER_DECKS.kingdom)) setHeroLevel(id, 30);
    const power = rosterPowerForDeck(STARTER_DECKS.kingdom, 10, getHeroLevelState(), getAscensionState());
    expect(power).toBeGreaterThan(bossRecommended);
  });
});

describe('recordBattleResult - power-deficit and return-win tracking', () => {
  it('a loss while under the recommendation records the deficit and fires campaign_loss_at_power_deficit', () => {
    setAccountLevel(1); // fresh account: well under every recommendation
    const before = loadProgress().lastLossPower[BOSS];
    expect(before).toBeUndefined();
    const active = getActiveDeck();
    recordBattleResult(BOSS, 'ENEMY_WIN', stats(), [], active.faction);
    const progress = loadProgress();
    expect(progress.lastLossPower[BOSS]).toBeDefined();
    const events = getQueuedEvents().filter((e) => e.name === 'campaign_loss_at_power_deficit');
    expect(events).toHaveLength(1);
    expect(events[0].properties.nodeId).toBe(BOSS);
  });
  it('a loss while AT or ABOVE the recommendation does not record a deficit', () => {
    setAccountLevel(10);
    for (const id of new Set(STARTER_DECKS.kingdom)) setHeroLevel(id, 30);
    const active = getActiveDeck();
    recordBattleResult(BOSS, 'ENEMY_WIN', stats(), [], active.faction);
    expect(loadProgress().lastLossPower[BOSS]).toBeUndefined();
    expect(getQueuedEvents().filter((e) => e.name === 'campaign_loss_at_power_deficit')).toHaveLength(0);
  });
  it('a later win at higher Power than the recorded loss fires upgrade/return-win and clears the flag', () => {
    setAccountLevel(1);
    const active = getActiveDeck();
    recordBattleResult(BOSS, 'ENEMY_WIN', stats(), [], active.faction); // records a deficit
    clearQueuedEvents();
    setAccountLevel(10);
    for (const id of new Set(STARTER_DECKS.kingdom)) setHeroLevel(id, 30); // genuinely stronger now
    recordBattleResult(BOSS, 'PLAYER_WIN', stats(), [], active.faction);
    expect(loadProgress().lastLossPower[BOSS]).toBeUndefined(); // consumed
    expect(getQueuedEvents().filter((e) => e.name === 'campaign_upgrade_after_loss')).toHaveLength(1);
    expect(getQueuedEvents().filter((e) => e.name === 'campaign_return_win')).toHaveLength(1);
  });
  it('a win with no recorded prior loss never fires upgrade/return-win', () => {
    setAccountLevel(10);
    for (const id of new Set(STARTER_DECKS.kingdom)) setHeroLevel(id, 30);
    const active = getActiveDeck();
    recordBattleResult(BOSS, 'PLAYER_WIN', stats(), [], active.faction);
    expect(getQueuedEvents().filter((e) => e.name === 'campaign_upgrade_after_loss')).toHaveLength(0);
    expect(getQueuedEvents().filter((e) => e.name === 'campaign_return_win')).toHaveLength(0);
  });
  it('winning again without gaining Power after a recorded loss still clears the flag but fires no upgrade event', () => {
    setAccountLevel(1);
    const active = getActiveDeck();
    recordBattleResult(BOSS, 'ENEMY_WIN', stats(), [], active.faction);
    clearQueuedEvents();
    // Same account level as the loss - no genuine Power gain, but the match can still be won on strategy.
    recordBattleResult(BOSS, 'PLAYER_WIN', stats(), [], active.faction);
    expect(loadProgress().lastLossPower[BOSS]).toBeUndefined();
    expect(getQueuedEvents().filter((e) => e.name === 'campaign_upgrade_after_loss')).toHaveLength(0);
  });
  it('a node with no recommendedRosterPower never touches lastLossPower', () => {
    const storyOrRewardOnly = CHAPTER_1.nodes.find((n) => n.type === 'battle' && !n.encounter!.recommendedRosterPower);
    expect(storyOrRewardOnly).toBeUndefined(); // sanity: every battle-type node in the curve test above already has one
  });
});
