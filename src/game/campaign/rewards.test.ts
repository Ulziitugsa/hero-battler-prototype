import { beforeEach, describe, expect, it } from 'vitest';
import { getCard } from '../cards';
import { CHAPTER_1 } from './chapter1';
import { getActiveDeck } from '../engine/activeDeck';
import { savePreferences } from '../engine/preferences';
import { upsertSavedDeck } from '../engine/localDecks';
import { buildStarterCollection } from '../collection/starterCollection';
import { COLLECTION_STORAGE_KEY } from '../collection/persistence';
import { getCollection, getOwnedCount, grantCard, reloadCollection } from '../collection/collection';
import { isStarterDeckUnlocked } from '../collection/starterUnlock';
import { STARTER_DECKS } from '../cards/starterDecks';
import { isDeckPlayable } from '../engine/activeDeck';
import { migrateToRealCollection } from './collectionMigration';
import { clearNonBattleNode, loadProgress, recordBattleResult } from './progress';
import type { MatchStats } from '../engine/stats';

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
});

const stats = { roundsPlayed: 4, finalPlayerHp: 20 } as unknown as MatchStats;
const win = (nodeId: string) => recordBattleResult(nodeId, 'PLAYER_WIN', stats, [], 'kingdom');

describe('campaign card reward data', () => {
  it('every card reward references a real card id whose name matches the label', () => {
    const rewards = CHAPTER_1.nodes.flatMap((n) => [n.encounter?.firstClearReward, n.encounter?.repeatReward, n.reward]).filter(Boolean);
    const cardRewards = rewards.filter((r) => r!.icon === 'card');
    expect(cardRewards.length).toBeGreaterThan(0);
    for (const r of cardRewards) {
      expect(r!.cardId, `card reward "${r!.label}" needs a cardId`).toBeTruthy();
      expect(getCard(r!.cardId!).name).toBe(r!.label);
      expect(r!.count ?? 1).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('first-clear card rewards', () => {
  it('grants the card (with its copy count) once and never again on replay', () => {
    expect(getOwnedCount('und-bone-soldier')).toBe(0);
    const first = win('battle-broken-palisade');
    expect(first.isFirstClear).toBe(true);
    expect(first.cardGrant).toMatchObject({ cardId: 'und-bone-soldier', isNew: true, granted: 2, owned: 2 });
    expect(getOwnedCount('und-bone-soldier')).toBe(2);

    const replay = win('battle-broken-palisade');
    expect(replay.isFirstClear).toBe(false);
    expect(replay.cardGrant).toBeNull();
    expect(replay.starterProgress).toBeNull();
    expect(getOwnedCount('und-bone-soldier')).toBe(2);
  });
  it('a loss grants nothing and does not consume the first clear', () => {
    const lost = recordBattleResult('battle-broken-palisade', 'ENEMY_WIN', stats, [], 'kingdom');
    expect(lost.cardGrant).toBeNull();
    expect(getOwnedCount('und-bone-soldier')).toBe(0);
    expect(win('battle-broken-palisade').cardGrant?.isNew).toBe(true);
  });
  it('a card a player already holds becomes a duplicate (quantity adds up)', () => {
    grantCard('und-mira', 1);
    const r = win('elite-mira-grave-warden');
    expect(r.cardGrant).toMatchObject({ isNew: false, previous: 1, owned: 3 });
  });
  it('persists across a reload', () => {
    win('battle-broken-palisade');
    reloadCollection();
    expect(getOwnedCount('und-bone-soldier')).toBe(2);
  });
});

describe('the Undead starter unlock loop', () => {
  const UNDEAD_ROAD = ['battle-broken-palisade', 'battle-dust-crossing', 'battle-grey-orchard', 'battle-chapel-of-dust', 'elite-mira-grave-warden', 'battle-barrow-steps'];

  it('reports rising progress and unlocks automatically on the final required copy', () => {
    expect(isStarterDeckUnlocked('starter-undead')).toBe(false);
    let last = 0;
    for (const id of UNDEAD_ROAD) {
      const r = win(id);
      expect(r.starterProgress?.unlockedNow).toBe(false);
      expect(r.starterProgress!.collected).toBeGreaterThan(last);
      last = r.starterProgress!.collected;
    }
    clearNonBattleNode('reward-wayside-cairn'); // Raise Fallen x2 (main road)
    expect(isStarterDeckUnlocked('starter-undead')).toBe(false); // Vharos still missing
    const boss = win('boss-grave-tyrant');
    expect(boss.cardGrant).toMatchObject({ cardId: 'und-vharos', isNew: true });
    expect(boss.starterProgress).toMatchObject({ deckId: 'starter-undead', unlockedNow: true, collected: 15, total: 15 });
    expect(isStarterDeckUnlocked('starter-undead')).toBe(true);
    expect(isDeckPlayable(STARTER_DECKS.undead)).toBe(true);
  });
  it('a cairn claim hands over its card and reports starter progress; a second claim grants nothing', () => {
    const first = clearNonBattleNode('reward-wayside-cairn');
    expect(first.cardGrant).toMatchObject({ cardId: 'spl-raise-fallen', granted: 2, isNew: true });
    expect(first.starterProgress).toMatchObject({ deckId: 'starter-undead', collected: 2 });
    expect(clearNonBattleNode('reward-wayside-cairn').cardGrant).toBeNull();
    expect(getOwnedCount('spl-raise-fallen')).toBe(2);
  });
  it('the Kingdom challenge reward (Fortify) does not move any locked starter', () => {
    const r = win('challenge-toll-of-the-ford');
    expect(r.cardGrant).toMatchObject({ cardId: 'spl-fortify', isNew: true });
    expect(r.starterProgress).toBeNull();
  });
});

describe('migration from earlier collections', () => {
  it('no collection: starter + rewards (with copy counts) for stages already first-cleared', () => {
    localStorage.setItem('skyloom:campaignProgress', JSON.stringify({ clearedNodes: ['battle-broken-palisade'], objectivesMet: {}, firstClearClaimed: ['battle-broken-palisade'] }));
    migrateToRealCollection();
    expect(getCollection()).toEqual({ ...buildStarterCollection(), 'und-bone-soldier': 2 });
    expect(loadProgress().clearedNodes).toEqual(['battle-broken-palisade']); // progress untouched
  });
  it('a v1 collection is topped up once to what its cleared stages now give, never lowered', () => {
    localStorage.setItem('skyloom:campaignProgress', JSON.stringify({ clearedNodes: ['battle-broken-palisade'], objectivesMet: {}, firstClearClaimed: ['battle-broken-palisade'] }));
    localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify({ version: 1, owned: { ...buildStarterCollection(), 'und-bone-soldier': 1, 'und-mira': 3 } }));
    migrateToRealCollection();
    const c = getCollection();
    expect(c['und-bone-soldier']).toBe(2);
    expect(c['und-mira']).toBe(3);
    expect(JSON.parse(localStorage.getItem(COLLECTION_STORAGE_KEY)!).version).toBe(2);
    grantCard('und-mira', 1); // later changes are never re-topped: a second run is a no-op
    migrateToRealCollection();
    expect(getOwnedCount('und-mira')).toBe(4);
  });
  it('a current-version collection is left alone', () => {
    localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify({ version: 2, owned: { 'und-mira': 2 } }));
    migrateToRealCollection();
    expect(getCollection()).toEqual({ 'und-mira': 2 });
  });
});

describe('active deck safety', () => {
  it('falls back to a playable deck, keeps the illegal saved deck, and remembers the fallback', () => {
    const custom = { id: 'deck-legacy', name: 'Old Undead', faction: 'undead' as const, cardIds: ['und-mira', 'und-mira', ...Array(13).fill('und-bone-soldier').slice(0, 2)] };
    upsertSavedDeck(custom);
    savePreferences({ selectedDeckId: 'deck-legacy', opponentFaction: 'undead' });
    expect(getActiveDeck().id).toBe('starter-kingdom');
    expect(JSON.parse(localStorage.getItem('skyloom:preferences')!).selectedDeckId).toBe('starter-kingdom');
    expect(JSON.parse(localStorage.getItem('skyloom:decks')!)[0].id).toBe('deck-legacy');
  });
});
