import { beforeEach, describe, expect, it } from 'vitest';
import { reloadCollection, getOwnedCount } from '../collection/collection';
import { reloadCardMarks } from '../collection/cardMarks';
import { reloadAccount } from '../progression/account';
import { getHeroLevel, reloadHeroLevels } from '../heroLevel/store';
import { getAscensionRank, reloadAscension } from '../ascension/store';
import { getEconomy, hasGrant, reloadEconomy } from '../economy/economy';
import { getCardMasteryView, legacyLevelGoldInvested } from '../cardMastery/model';
import { goldCostForLevelUp } from '../heroLevel/config';
import { createCardMatch } from '../cardCombat/engine';
import { playerMasteryStages } from '../cardCombat/mastery';
import { STARTER_DECKS } from '../cards/starterDecks';
import { LEGACY_LEVEL_REFUND_GRANT, SAVE_MIGRATION_KEY, dismissRefundNotice, legacyLevelRefundFor, pendingRefundNotice, runSaveMigrations } from './migrations';
import { clearQueuedEvents, getQueuedEvents } from '../../analytics/track';

const store = new Map<string, string>();
function installLocalStoragePolyfill() {
  store.clear();
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

function reloadAll() {
  reloadCollection();
  reloadCardMarks();
  reloadAccount();
  reloadHeroLevels();
  reloadAscension();
  reloadEconomy();
}

/**
 * A save as the previous release wrote it: economy v4 (no grants), Legacy Levels on three cards, Ascension ranks on two
 * of the six old paths, duplicates, a saved deck, favourites, a background, Tactics unlocked and equipped.
 */
const OLD_SAVE: Record<string, unknown> = {
  'skyloom:collection': { version: 2, owned: { 'kng-royal-guard': 4, 'kng-common-knight': 3, 'und-bone-soldier': 5, 'kng-archer': 2, 'spl-power-surge': 2 } },
  'skyloom:economy': { version: 4, gems: 340, gold: 125, tickets: 2, summon: { pity: {}, history: [] } },
  'skyloom:heroLevel': { version: 1, levels: { 'kng-royal-guard': 12, 'kng-archer': 3, 'und-bone-soldier': 1 } },
  'skyloom:ascension': { version: 1, cards: { 'kng-royal-guard': { rank: 2, duplicatesSpent: 3 }, 'und-bone-soldier': { rank: 3, duplicatesSpent: 6 } } },
  'skyloom:decks': [{ id: 'deck-a', name: 'My Guard', faction: 'kingdom', cardIds: STARTER_DECKS.kingdom }],
  'skyloom:cardMarks': { version: 1, favorites: ['kng-royal-guard'], obtainedAt: { 'kng-royal-guard': 1700000000000 } },
  'moonwater:selected-background': 'moonlit-harbor',
  'skyloom:account': { version: 2, level: 9, xp: 40, totalXp: 900, unlockedMasteries: { fortification: 2, valor: 1 }, equippedMasteryId: 'valor' },
};

function writeOldSave() {
  for (const [k, v] of Object.entries(OLD_SAVE)) store.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  reloadAll();
}

const EXPECTED_REFUND = legacyLevelGoldInvested(12) + legacyLevelGoldInvested(3);

beforeEach(() => {
  installLocalStoragePolyfill();
  reloadAll();
  clearQueuedEvents();
});

describe('save migration: Legacy Level refund', () => {
  it('refunds exactly the Gold put into Legacy Level, once', () => {
    expect(legacyLevelGoldInvested(3)).toBe(goldCostForLevelUp(1) + goldCostForLevelUp(2));
    writeOldSave();
    expect(legacyLevelRefundFor()).toEqual({ gold: EXPECTED_REFUND, cards: 2 });
    const marker = runSaveMigrations();
    expect(marker.legacyLevelRefund).toEqual({ gold: EXPECTED_REFUND, cards: 2 });
    expect(getEconomy().gold).toBe(125 + EXPECTED_REFUND);
    expect(hasGrant(LEGACY_LEVEL_REFUND_GRANT)).toBe(true);
    expect(getQueuedEvents().filter((e) => e.name === 'legacy_level_refunded')).toHaveLength(1);
  });

  it('is idempotent: running it again (every launch) pays nothing and changes nothing', () => {
    writeOldSave();
    runSaveMigrations();
    const after = new Map(store);
    for (let i = 0; i < 3; i++) {
      reloadAll();
      runSaveMigrations();
    }
    expect(new Map(store)).toEqual(after);
    expect(getEconomy().gold).toBe(125 + EXPECTED_REFUND);
  });

  it('is interrupt-safe: a run that paid but never wrote its marker is not paid twice', () => {
    writeOldSave();
    runSaveMigrations();
    store.delete(SAVE_MIGRATION_KEY); // the crash happened between the economy write and the marker write
    reloadAll();
    runSaveMigrations();
    expect(getEconomy().gold).toBe(125 + EXPECTED_REFUND);
    expect(JSON.parse(store.get(SAVE_MIGRATION_KEY)!)).toMatchObject({ version: 1 });
  });

  it('a marker without the economy grant (economy reset) re-checks and pays only what is invested now', () => {
    writeOldSave();
    runSaveMigrations();
    store.set('skyloom:economy', JSON.stringify({ version: 5, gems: 0, gold: 0, tickets: 0, grants: [], summon: { pity: {}, history: [] } }));
    store.delete('skyloom:heroLevel'); // a full reset clears both
    reloadAll();
    runSaveMigrations();
    expect(getEconomy().gold).toBe(0);
    expect(hasGrant(LEGACY_LEVEL_REFUND_GRANT)).toBe(true);
  });

  it('a fresh install gets no refund and no notice', () => {
    const marker = runSaveMigrations();
    expect(marker.legacyLevelRefund.gold).toBe(0);
    expect(getEconomy().gold).toBe(0);
    expect(pendingRefundNotice()).toBeNull();
  });

  it('the Home notice shows once, until dismissed', () => {
    writeOldSave();
    runSaveMigrations();
    expect(pendingRefundNotice()).toEqual({ gold: EXPECTED_REFUND, cards: 2 });
    dismissRefundNotice();
    expect(pendingRefundNotice()).toBeNull();
    runSaveMigrations();
    expect(pendingRefundNotice()).toBeNull();
  });
});

describe('save migration: everything else is preserved', () => {
  it('leaves every other key byte-identical (collection, duplicates, decks, favourites, background, Tactics, Levels, Ascension)', () => {
    writeOldSave();
    const before = new Map(store);
    runSaveMigrations();
    for (const [k, v] of before) if (k !== 'skyloom:economy') expect(store.get(k), k).toBe(v);
    const economy = JSON.parse(store.get('skyloom:economy')!);
    expect(economy).toMatchObject({ version: 5, gems: 340, tickets: 2, grants: [LEGACY_LEVEL_REFUND_GRANT] });
  });

  it('reads the old Ascension ranks as the same Card Mastery stage, with copies and investment intact', () => {
    writeOldSave();
    runSaveMigrations();
    expect(getAscensionRank('kng-royal-guard')).toBe(2);
    expect(getCardMasteryView('kng-royal-guard')).toMatchObject({ stage: 3, copies: 4, duplicatesInvested: 3 });
    expect(getCardMasteryView('und-bone-soldier')).toMatchObject({ stage: 4, copies: 5, duplicatesInvested: 6, nextStage: 5 });
    // A card with no old path is Mastery I and can now advance.
    expect(getCardMasteryView('kng-common-knight')).toMatchObject({ stage: 1, hasPath: true, maxStage: 5 });
    expect(getOwnedCount('spl-power-surge')).toBe(2);
  });

  it('Legacy Level is kept in the save but never reaches a battle', () => {
    writeOldSave();
    runSaveMigrations();
    expect(getHeroLevel('kng-royal-guard')).toBe(12);
    const withLevels = createCardMatch({ seed: 4, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead, playerMastery: playerMasteryStages(STARTER_DECKS.kingdom) }).nextState;
    store.delete('skyloom:heroLevel');
    reloadHeroLevels();
    const withoutLevels = createCardMatch({ seed: 4, playerDeck: STARTER_DECKS.kingdom, enemyDeck: STARTER_DECKS.undead, playerMastery: playerMasteryStages(STARTER_DECKS.kingdom) }).nextState;
    expect(withLevels).toEqual(withoutLevels);
  });
});
