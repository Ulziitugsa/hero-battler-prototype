import { beforeEach, describe, expect, it } from 'vitest';
import { reloadCollection } from '../collection/collection';
import { reloadAscension, sanitizeAscension } from '../ascension/store';
import { reloadHeroLevels, sanitizeHeroLevel } from '../heroLevel/store';
import { ASCENSION_DUPLICATE_COST } from '../ascension/config';
import { ascensionLabel } from '../ascension/ascend';
import {
  MAX_CARD_MASTERY,
  PROPOSED_MASTERY_LADDER,
  ascensionRankForStage,
  copiesToReachStage,
  getCardMasteryView,
  legacyLevelGoldInvested,
  masteryLabel,
  planCardMasteryMigration,
  stageFromAscensionRank,
} from './model';

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
  reloadAscension();
  reloadHeroLevels();
});

const noLevels = sanitizeHeroLevel(null);
const noAscension = sanitizeAscension(null);

describe('Card Mastery stage mapping', () => {
  it('reads legacy Ascension rank 0..3 as Mastery I..IV and never invents Mastery V', () => {
    expect([0, 1, 2, 3].map(stageFromAscensionRank)).toEqual([1, 2, 3, 4]);
    expect(stageFromAscensionRank(99)).toBe(MAX_CARD_MASTERY - 1);
    expect(stageFromAscensionRank(-2)).toBe(1);
    expect(stageFromAscensionRank(Number.NaN)).toBe(1);
    expect([1, 2, 3, 4].map(ascensionRankForStage)).toEqual([0, 1, 2, 3]);
  });
  it('agrees with the label the existing Ascension panel already shows', () => {
    for (const rank of [0, 1, 2, 3]) expect(masteryLabel(stageFromAscensionRank(rank))).toBe(ascensionLabel(rank));
    expect(masteryLabel(0)).toBe('');
  });
});

describe('getCardMasteryView', () => {
  it('an unowned card has no stage and cannot advance', () => {
    const v = getCardMasteryView('kng-royal-guard', { owned: {}, ascension: noAscension, levels: noLevels });
    expect(v).toMatchObject({ owned: false, copies: 0, stage: 0, label: '', canAdvance: false, nextStage: null, pips: { filled: 0, total: 5 } });
  });
  it('an owned card with a path shows its stage, the next cost and what is spare', () => {
    const ascension = sanitizeAscension({ cards: { 'kng-royal-guard': { rank: 1, duplicatesSpent: 1 } } });
    const v = getCardMasteryView('kng-royal-guard', { owned: { 'kng-royal-guard': 8 }, ascension, levels: noLevels });
    expect(v).toMatchObject({ owned: true, copies: 8, stage: 2, label: 'Mastery II', hasPath: true, maxStage: 4, duplicatesInvested: 1, nextStage: 3, nextCost: ASCENSION_DUPLICATE_COST[1], canAdvance: true });
    expect(v.pips).toEqual({ filled: 2, total: 5 });
  });
  it('a card at the top of its authored path stops at Mastery IV', () => {
    const ascension = sanitizeAscension({ cards: { 'und-bone-soldier': { rank: 3, duplicatesSpent: 6 } } });
    const v = getCardMasteryView('und-bone-soldier', { owned: { 'und-bone-soldier': 2 }, ascension, levels: noLevels });
    expect(v).toMatchObject({ stage: 4, nextStage: null, nextCost: null, canAdvance: false, duplicatesInvested: 6 });
  });
  it('a card with no path is Mastery I, keeps its duplicates and says so plainly', () => {
    const v = getCardMasteryView('kng-common-knight', { owned: { 'kng-common-knight': 4 }, ascension: noAscension, levels: noLevels });
    expect(v).toMatchObject({ stage: 1, hasPath: false, maxStage: 1, copies: 4, canAdvance: false });
    expect(v.blockedReason).toMatch(/Extra copies stay in your collection/);
  });
  it('reports the legacy Level without converting it', () => {
    const levels = sanitizeHeroLevel({ levels: { 'kng-royal-guard': 31 } });
    const v = getCardMasteryView('kng-royal-guard', { owned: { 'kng-royal-guard': 1 }, ascension: noAscension, levels });
    expect(v.legacyLevel).toBe(31);
    expect(v.stage).toBe(1);
  });
});

describe('proposed ladder', () => {
  it('keeps the live Ascension costs for Mastery II-IV so a migrated save lands on the same stage', () => {
    expect(PROPOSED_MASTERY_LADDER.slice(1, 4).map((s) => s.duplicateCost)).toEqual([...ASCENSION_DUPLICATE_COST]);
    expect(PROPOSED_MASTERY_LADDER).toHaveLength(MAX_CARD_MASTERY);
  });
  it('is bounded: Mastery V needs 11 copies in total, not an open-ended grind', () => {
    expect([1, 2, 3, 4, 5].map(copiesToReachStage)).toEqual([1, 2, 4, 7, 11]);
  });
});

describe('planCardMasteryMigration', () => {
  const owned = { 'kng-royal-guard': 3, 'und-bone-soldier': 1, 'kng-common-knight': 2 };
  const ascension = sanitizeAscension({ cards: { 'kng-royal-guard': { rank: 2, duplicatesSpent: 3 } } });
  const levels = sanitizeHeroLevel({ levels: { 'und-bone-soldier': 3, 'kng-common-knight': 1 } });

  it('reports one row per card with progress or copies, and totals', () => {
    const plan = planCardMasteryMigration(owned, ascension, levels);
    expect(plan.rows.map((r) => r.cardId)).toEqual(['kng-common-knight', 'kng-royal-guard', 'und-bone-soldier']);
    const guard = plan.rows.find((r) => r.cardId === 'kng-royal-guard')!;
    expect(guard).toMatchObject({ copies: 3, ascensionRank: 2, stage: 3, duplicatesInvested: 3, legacyLevel: 1, legacyLevelGold: 0 });
    const soldier = plan.rows.find((r) => r.cardId === 'und-bone-soldier')!;
    expect(soldier.legacyLevelGold).toBe(legacyLevelGoldInvested(3));
    expect(plan.totals).toMatchObject({ cards: 3, stagedAboveI: 1, levelledCards: 1, duplicatesInvested: 3 });
    expect(plan.totals.goldToRefund).toBe(legacyLevelGoldInvested(3));
  });
  it('is idempotent and never mutates the saves it reads', () => {
    const before = JSON.stringify([owned, ascension, levels]);
    expect(planCardMasteryMigration(owned, ascension, levels)).toEqual(planCardMasteryMigration(owned, ascension, levels));
    expect(JSON.stringify([owned, ascension, levels])).toBe(before);
  });
  it('an empty save plans nothing', () => {
    expect(planCardMasteryMigration({}, noAscension, noLevels).totals).toEqual({ cards: 0, stagedAboveI: 0, levelledCards: 0, goldToRefund: 0, duplicatesInvested: 0 });
  });
  it('legacy Level Gold is the sum of the live level-up costs', () => {
    expect(legacyLevelGoldInvested(1)).toBe(0);
    expect(legacyLevelGoldInvested(2)).toBe(20 + 12);
    expect(legacyLevelGoldInvested(3)).toBe(20 + 12 + 20 + 24);
  });
});
