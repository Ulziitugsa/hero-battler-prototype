import { beforeEach, describe, expect, it } from 'vitest';
import { reloadCollection } from '../collection/collection';
import { reloadAscension, sanitizeAscension } from '../ascension/store';
import { reloadHeroLevels, sanitizeHeroLevel } from '../heroLevel/store';
import { ascensionLabel } from '../ascension/ascend';
import { MAX_CARD_MASTERY, ascensionRankForStage, historicalMastery, legacyLevelGoldInvested, masteryLabel, planCardMasteryMigration, stageFromAscensionRank } from './model';

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
  it('reads the stored Ascension rank 0..4 as Mastery I..V', () => {
    expect([0, 1, 2, 3, 4].map(stageFromAscensionRank)).toEqual([1, 2, 3, 4, 5]);
    expect(stageFromAscensionRank(99)).toBe(MAX_CARD_MASTERY);
    expect(stageFromAscensionRank(-2)).toBe(1);
    expect(stageFromAscensionRank(Number.NaN)).toBe(1);
    expect([1, 2, 3, 4, 5].map(ascensionRankForStage)).toEqual([0, 1, 2, 3, 4]);
  });
  it('agrees with the label the Mastery panel shows', () => {
    for (const rank of [0, 1, 2, 3, 4]) expect(masteryLabel(stageFromAscensionRank(rank))).toBe(ascensionLabel(rank));
    expect(masteryLabel(0)).toBe('');
  });
});

describe('historicalMastery (read only, no combat effect)', () => {
  it('reads the stored rank and duplicates spent exactly as saved', () => {
    const ascension = sanitizeAscension({ cards: { 'kng-royal-guard': { rank: 2, duplicatesSpent: 3 }, 'und-bone-soldier': { rank: 4, duplicatesSpent: 10 } } });
    expect(historicalMastery('kng-royal-guard', ascension)).toEqual({ cardId: 'kng-royal-guard', rank: 2, label: 'Mastery III', duplicatesSpent: 3 });
    expect(historicalMastery('und-bone-soldier', ascension)).toEqual({ cardId: 'und-bone-soldier', rank: 4, label: 'Mastery V', duplicatesSpent: 10 });
  });
  it('a card with no progress on record has no label', () => {
    expect(historicalMastery('kng-common-knight', noAscension)).toEqual({ cardId: 'kng-common-knight', rank: 0, label: '', duplicatesSpent: 0 });
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
