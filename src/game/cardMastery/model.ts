import { getCard } from '../cards';
import { getCollection, getOwnedCount } from '../collection/collection';
import type { OwnedMap } from '../collection/types';
import { getAscensionStatus } from '../ascension/ascend';
import { ASCENSION_DUPLICATE_COST } from '../ascension/config';
import { hasMasteryPath } from '../ascension/path';
import { getAscensionState, getDuplicatesSpent, type AscensionState } from '../ascension/store';
import { goldCostForLevelUp } from '../heroLevel/config';
import { getHeroLevel } from '../heroLevel/store';
import type { HeroLevelState } from '../heroLevel/types';
import { MASTERY_HPC_PCT } from '../cardCombat/stats';

// Card Mastery: the player-facing name for per-card, duplicate-funded progression (docs/COLLECTION-PROGRESSION.md).
//
// A read model over the saves:
//   - Mastery stage is stored as the legacy Ascension rank (skyloom:ascension): stage = rank + 1, so an owned card
//     starts at Mastery I and ranks 1..4 read as Mastery II..V. Every collectible card has the path (ascension/path.ts).
//   - Mastery raises a Unit's HP Contribution only (+0/5/10/15/20%); ATK never changes; a Spell's Mastery is a
//     collection mark only.
//   - Legacy Hero Level (skyloom:heroLevel) no longer affects anything. It stays in the save, untouched; the Gold put
//     into it is refunded once by save/migrations.ts (legacyLevelGoldInvested below is the amount).

export const MAX_CARD_MASTERY = 5;

/** 0 = not owned; 1..5 = Mastery I..V. */
export type CardMasteryStage = 0 | 1 | 2 | 3 | 4 | 5;

const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V'] as const;

export function masteryNumeral(stage: number): string {
  return NUMERALS[Math.max(0, Math.min(MAX_CARD_MASTERY, Math.floor(stage)))] ?? '';
}

/** "Mastery III". Empty for an unowned card (stage 0). */
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

/**
 * Everything a card face, Card Inspect or a Collection tile needs to show Mastery, in one shape. Presentation reads
 * this instead of the Ascension store directly, so the storage underneath can change without touching the UI.
 */
export interface CardMasteryView {
  cardId: string;
  owned: boolean;
  /** Copies in the collection right now (spent duplicates are already subtracted). */
  copies: number;
  stage: CardMasteryStage;
  /** "Mastery II", or '' when not owned. */
  label: string;
  /** Highest stage: Mastery V on a path (every collectible card), 1 otherwise. */
  maxStage: number;
  /** True for every collectible card. */
  hasPath: boolean;
  /** Copies already invested into Mastery (legacy Ascension `duplicatesSpent`). */
  duplicatesInvested: number;
  /** The stage the next advance reaches, or null at the build's max / no path / not owned. */
  nextStage: number | null;
  /** Duplicate copies the next advance costs. */
  nextCost: number | null;
  /** Gold the next advance costs on top of the duplicates (Mastery IV and V only). */
  nextGoldCost: number;
  /** Copies that can be spent now without breaking a playable deck or the last copy. */
  spareCopies: number;
  canAdvance: boolean;
  /** Player-facing reason when the next stage is blocked (from the existing Ascension rules). */
  blockedReason: string | null;
  /** Pips for compact displays: `stage` filled out of MAX_CARD_MASTERY. Replaces the old derived Stars. */
  pips: { filled: number; total: number };
}

export interface CardMasteryDeps {
  owned?: OwnedMap;
  ascension?: AscensionState;
  gold?: number;
}

export function getCardMasteryView(cardId: string, deps: CardMasteryDeps = {}): CardMasteryView {
  const owned = deps.owned ?? getCollection();
  const ascension = deps.ascension ?? getAscensionState();
  const copies = getOwnedCount(cardId, owned);
  const isOwned = copies > 0;
  const status = getAscensionStatus(cardId, owned, ascension, undefined, deps.gold);
  const hasPath = status.supported;
  const stage: CardMasteryStage = isOwned ? stageFromAscensionRank(status.rank) : 0;
  const nextStage = isOwned && status.nextRank !== null ? stageFromAscensionRank(status.nextRank) : null;
  return {
    cardId,
    owned: isOwned,
    copies,
    stage,
    label: masteryLabel(stage),
    maxStage: 1 + status.maxRank,
    hasPath,
    duplicatesInvested: getDuplicatesSpent(cardId, ascension),
    nextStage,
    nextCost: nextStage === null ? null : status.cost,
    nextGoldCost: nextStage === null ? 0 : status.goldCost,
    spareCopies: status.spare,
    canAdvance: status.canAscend,
    blockedReason: status.canAscend ? null : status.reason,
    pips: { filled: stage, total: MAX_CARD_MASTERY },
  };
}

// ---- The ladder --------------------------------------------------------------------------------------------

/** Duplicate copies spent to reach each stage from the previous one (stage 1 = the first copy). */
export const MASTERY_LADDER: readonly { stage: number; duplicateCost: number; hpcPct: number }[] = [
  { stage: 1, duplicateCost: 0, hpcPct: MASTERY_HPC_PCT[0] },
  ...ASCENSION_DUPLICATE_COST.map((duplicateCost, i) => ({ stage: i + 2, duplicateCost, hpcPct: MASTERY_HPC_PCT[i + 1] })),
];

/** Total copies a player needs to own to reach `stage` (1 kept + every duplicate spent): 1 / 2 / 4 / 7 / 11. */
export function copiesToReachStage(stage: number): number {
  return 1 + MASTERY_LADDER.filter((s) => s.stage > 1 && s.stage <= stage).reduce((sum, s) => sum + s.duplicateCost, 0);
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
 * How this save maps onto Card Mastery: every owned card and every card with legacy progress gets a row. Pure and
 * idempotent - it reads the three stores and returns a report. Copies, Ascension rank (= Mastery stage) and Level all
 * stay where they are; the only write is the one-time Gold refund of `totals.goldToRefund` (save/migrations.ts).
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
