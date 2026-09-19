import { beforeEach, describe, expect, it } from 'vitest';
import { getCard } from '../cards';
import { CHAPTER_1 } from './chapter1';
import { getActiveDeck } from '../engine/activeDeck';
import { savePreferences } from '../engine/preferences';
import { upsertSavedDeck } from '../engine/localDecks';
import { buildStarterCollection } from '../collection/starterCollection';
import { COLLECTION_STORAGE_KEY } from '../collection/persistence';
import { getCollection, getOwnedCount, reloadCollection } from '../collection/collection';
import { migrateToRealCollection } from './collectionMigration';
import { loadProgress, recordBattleResult } from './progress';
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
    }
  });
});

describe('first-clear card rewards', () => {
  it('grants the card once and never again on replay', () => {
    expect(getOwnedCount('und-bone-soldier')).toBe(0);
    const first = win('battle-broken-palisade');
    expect(first.isFirstClear).toBe(true);
    expect(first.cardGrant).toMatchObject({ cardId: 'und-bone-soldier', isNew: true, owned: 1 });
    expect(getOwnedCount('und-bone-soldier')).toBe(1);

    const replay = win('battle-broken-palisade');
    expect(replay.isFirstClear).toBe(false);
    expect(replay.cardGrant).toBeNull();
    expect(getOwnedCount('und-bone-soldier')).toBe(1);
  });
  it('a loss grants nothing and does not consume the first clear', () => {
    const lost = recordBattleResult('battle-broken-palisade', 'ENEMY_WIN', stats, [], 'kingdom');
    expect(lost.cardGrant).toBeNull();
    expect(getOwnedCount('und-bone-soldier')).toBe(0);
    expect(win('battle-broken-palisade').cardGrant?.isNew).toBe(true);
  });
  it('a card given by two different stages becomes a duplicate (quantity 2)', () => {
    win('battle-dust-crossing');
    const second = win('battle-ford-of-ash');
    expect(second.cardGrant).toMatchObject({ cardId: 'und-grave-knight', isNew: false, owned: 2 });
    expect(getOwnedCount('und-grave-knight')).toBe(2);
  });
  it('persists across a reload', () => {
    win('battle-broken-palisade');
    reloadCollection();
    expect(getOwnedCount('und-bone-soldier')).toBe(1);
  });
});

describe('migration from the prototype', () => {
  it('starter + rewards for stages already first-cleared, when no collection exists', () => {
    localStorage.setItem('skyloom:campaignProgress', JSON.stringify({ clearedNodes: ['battle-broken-palisade'], objectivesMet: {}, firstClearClaimed: ['battle-broken-palisade'] }));
    migrateToRealCollection();
    expect(getCollection()).toEqual({ ...buildStarterCollection(), 'und-bone-soldier': 1 });
    expect(loadProgress().clearedNodes).toEqual(['battle-broken-palisade']); // progress untouched
  });
  it('leaves an existing collection alone', () => {
    localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify({ version: 1, owned: { 'und-mira': 2 } }));
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
