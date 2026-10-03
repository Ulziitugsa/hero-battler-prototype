import { getCard } from '../cards';
import { getOwnedCount } from '../collection/collection';
import type { OwnedMap } from '../collection/types';
import { hasMasteryPath } from '../ascension/path';
import { getAscensionRank, getAscensionState, getDuplicatesSpent, type AscensionState } from '../ascension/store';
import { goldCostForLevelUp } from '../heroLevel/config';
import { getHeroLevel } from '../heroLevel/store';
import type { HeroLevelState } from '../heroLevel/types';

// Historical Card Mastery: a read model over the saves, with NO combat effect.
//
// Historical Ascension/Mastery data is preserved for future cosmetic Prestige conversion and has no combat effect.
//
// Combat Card Mastery is removed (docs/CARD-COMBAT-DESIGN.md section 7): every card plays at its printed ATK, HP
// Contribution and effects, and no new Mastery can be bought (ascension/ascend.ts refuses every advance). What players
// already invested stays exactly where it was:
//   - the stored legacy Ascension rank (skyloom:ascension, rank 0..4 = Mastery I..V) and the duplicates spent reaching
//     it (`duplicatesSpent`) are kept, never refunded, never erased and never rewritten;
//   - nothing in battle, Starting HP, the Deck Builder, Ranked, Campaign or Friendly reads them;
//   - Card Inspect shows a card's historical rank as one quiet "Legacy Mastery ... no effect in battle" line, only for
//     a card that has progress on record.
// The future Prestige conversion is NOT done here and its rules are not decided; this file only reads.
//
// Legacy Hero Level (skyloom:heroLevel) likewise affects nothing. It stays in the save, untouched; the Gold put into it
// is refunded once by save/migrations.ts (legacyLevelGoldInvested below is the amount).

export const MAX_CARD_MASTERY = 5;

/** 0 = no record; 1..5 = historical Mastery I..V. */
export type CardMasteryStage = 0 | 1 | 2 | 3 | 4 | 5;

const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V'] as const;

export function masteryNumeral(stage: number): string {
  return NUMERALS[Math.max(0, Math.min(MAX_CARD_MASTERY, Math.floor(stage)))] ?? '';
}

/** "Mastery III". Empty for stage 0. */
export function masteryLabel(stage: number): string {
  const n = masteryNumeral(stage);
  return n ? `Mastery ${n}` : '';
}

/** Stored Ascension rank (0..4) -> Mastery stage (1..5). */
export function stageFromAscensionRank(rank: number): CardMasteryStage {
  const r = Number.isFinite(rank) ? Math.max(0, Math.floor(rank)) : 0;
  return Math.min(MAX_CARD_MASTERY, r + 1) as CardMasteryStage;
}

/** Inverse of stageFromAscensionRank, for callers that still speak the legacy store's language. */
export function ascensionRankForStage(stage: number): number {
  return Math.max(0, Math.floor(stage) - 1);
}

/** One card's historical Mastery / Ascension investment, as stored. Read-only and never used in combat. */
export interface HistoricalMastery {
  cardId: string;
  /** Stored Ascension rank: 0 (no progress on record) .. 4. */
  rank: number;
  /** "Mastery II" for rank 1, '' for rank 0 (no progress beyond the first copy). */
  label: string;
  /** Duplicate copies spent reaching `rank` (the stored `duplicatesSpent`). */
  duplicatesSpent: number;
}

export function historicalMastery(cardId: string, ascension: AscensionState = getAscensionState()): HistoricalMastery {
  const rank = getAscensionRank(cardId, ascension);
  return { cardId, rank, label: rank > 0 ? masteryLabel(stageFromAscensionRank(rank)) : '', duplicatesSpent: getDuplicatesSpent(cardId, ascension) };
}

// ---- Migration planning (report only) -------------------------------------------------------------------

/** Gold a player put into a card's legacy Level (Level 1 -> `level`). What a Level retirement would refund. */
export function legacyLevelGoldInvested(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.floor(level); l++) total += goldCostForLevelUp(l);
  return total;
}

export interface CardMigrationRow {
  cardId: string;
  copies: number;
  ascensionRank: number;
  duplicatesInvested: number;
  stage: CardMasteryStage;
  legacyLevel: number;
  legacyLevelGold: number;
}

export interface CardMasteryMigrationPlan {
  /** Bumped when the planned conversion rules change, so a future write-migration can record which rules it applied. */
  planVersion: 1;
  rows: CardMigrationRow[];
  totals: { cards: number; stagedAboveI: number; levelledCards: number; goldToRefund: number; duplicatesInvested: number };
}

/**
 * A report of this save's historical progression: every owned card and every card with legacy progress gets a row.
 * Pure and idempotent - it reads the three stores and returns a report. Copies, Ascension rank and duplicates spent
 * (kept for a future cosmetic Prestige conversion, no combat effect) and Level all stay where they are; the only write
 * the release makes is the one-time Gold refund of `totals.goldToRefund` (save/migrations.ts).
 */
export function planCardMasteryMigration(owned: OwnedMap, ascension: AscensionState, levels: HeroLevelState): CardMasteryMigrationPlan {
  const ids = new Set<string>([...Object.keys(owned), ...Object.keys(ascension.cards), ...Object.keys(levels.levels)]);
  const rows: CardMigrationRow[] = [];
  for (const cardId of [...ids].sort()) {
    try {
      getCard(cardId);
    } catch {
      continue; // unknown ids were already dropped by the stores' sanitizers; stay defensive anyway
    }
    const copies = getOwnedCount(cardId, owned);
    const rank = hasMasteryPath(cardId) ? (ascension.cards[cardId]?.rank ?? 0) : 0;
    const legacyLevel = getHeroLevel(cardId, levels);
    rows.push({
      cardId,
      copies,
      ascensionRank: rank,
      duplicatesInvested: getDuplicatesSpent(cardId, ascension),
      // A card with invested progress but zero copies (should not happen) still keeps its stage in the report.
      stage: copies > 0 || rank > 0 ? stageFromAscensionRank(rank) : 0,
      legacyLevel,
      legacyLevelGold: legacyLevelGoldInvested(legacyLevel),
    });
  }
  return {
    planVersion: 1,
    rows,
    totals: {
      cards: rows.length,
      stagedAboveI: rows.filter((r) => r.stage > 1).length,
      levelledCards: rows.filter((r) => r.legacyLevel > 1).length,
      goldToRefund: rows.reduce((s, r) => s + r.legacyLevelGold, 0),
      duplicatesInvested: rows.reduce((s, r) => s + r.duplicatesInvested, 0),
    },
  };
}
