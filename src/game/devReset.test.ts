import { beforeEach, describe, expect, it } from 'vitest';
import type { MatchStats } from './engine/stats';
import { resetEverything } from './devReset';
import { getCollection, grantCard, reloadCollection } from './collection/collection';
import { getEconomy, reloadEconomy, setGold } from './economy/economy';
import { getAccount, grantXp, resetProgression } from './progression/account';
import { getHeroLevelState, reloadHeroLevels, setHeroLevel } from './heroLevel/store';
import { getAscensionState, reloadAscension, setAscensionRank } from './ascension/store';
import { getMissionsState, reloadMissions, setMissionProgress } from './missions/store';
import { getJourneyState, reloadJourney, claimJourneyDay } from './journey/store';
import { getPurchaseState, reloadPurchases, simulatePurchase } from './offers/store';
import { loadProgress } from './campaign/progress';
import { loadSavedDecks, upsertSavedDeck } from './engine/localDecks';
import { loadPreferences, savePreferences } from './engine/preferences';
import { saveRecentMatch, loadRecentMatches } from './engine/localMatchHistory';
import { completeLanternTrial, loadLanternProgress } from './story/lanterns';
import { getFirstSeenAt } from '../analytics/context';
import { getQueuedEvents } from '../analytics/track';

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
  resetProgression();
  reloadHeroLevels();
  reloadAscension();
  reloadMissions();
  reloadJourney();
  reloadPurchases();
});

describe('resetEverything - a genuinely clean state (Commercial Prototype Phase 11)', () => {
  it('clears every store this workstream added, not just the ones that already had a reset helper', () => {
    // Dirty every piece of state resetEverything is responsible for.
    grantCard('und-mira', 3);
    setGold(500);
    grantXp(1000);
    setHeroLevel('kng-royal-guard', 20);
    setAscensionRank('und-bone-soldier', 2);
    setMissionProgress('daily-hero-level', 1);
    claimJourneyDay(1);
    simulatePurchase('gem-pack-small');
    upsertSavedDeck({ id: 'deck-x', name: 'Test', faction: 'kingdom', cardIds: [] });
    savePreferences({ selectedDeckId: 'deck-x', opponentFaction: 'infernal' });
    saveRecentMatch(1, { winner: 'player', roundsPlayed: 3, finalPlayerHp: 20 } as unknown as MatchStats);
    completeLanternTrial('the-unlit-road');
    const firstSeenBefore = getFirstSeenAt();

    resetEverything();

    // Re-read everything fresh from storage, the way a freshly-loaded app would.
    reloadCollection();
    reloadEconomy();
    reloadHeroLevels();
    reloadAscension();
    reloadMissions();
    reloadJourney();
    reloadPurchases();

    expect(getCollection()).not.toHaveProperty('und-mira');
    expect(getEconomy().gold).toBe(0);
    expect(getAccount().level).toBe(1);
    expect(getHeroLevelState().levels).toEqual({});
    expect(getAscensionState().cards).toEqual({});
    expect(getMissionsState().daily).toEqual({});
    expect(getJourneyState().claimedDays).toEqual([]);
    expect(getPurchaseState().hasEverPurchased).toBe(false);
    expect(loadProgress().clearedNodes).toEqual([]);
    expect(loadSavedDecks()).toEqual([]);
    expect(loadPreferences().selectedDeckId).not.toBe('deck-x'); // back to the default
    expect(loadRecentMatches()).toEqual([]);
    expect(loadLanternProgress()).toEqual([]);
    expect(getFirstSeenAt()).toBeGreaterThanOrEqual(firstSeenBefore); // re-stamped, not left stale
    expect(getQueuedEvents().some((e) => e.name === 'session_started')).toBe(true);
  });

  it('is idempotent - calling it twice in a row is safe', () => {
    grantCard('und-mira', 1);
    resetEverything();
    expect(() => resetEverything()).not.toThrow();
    reloadCollection();
    expect(getCollection()).not.toHaveProperty('und-mira');
  });
});
