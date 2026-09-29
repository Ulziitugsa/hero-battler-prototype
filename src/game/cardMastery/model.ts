import { getCard } from '../cards';
import { getCollection, getOwnedCount } from '../collection/collection';
import type { OwnedMap } from '../collection/types';
import { getAscensionStatus } from '../ascension/ascend';
import { ASCENSION_DUPLICATE_COST } from '../ascension/config';
import { getCardAscension } from '../ascension/definitions';
import { getAscensionState, getDuplicatesSpent, type AscensionState } from '../ascension/store';
import { goldCostForLevelUp } from '../heroLevel/config';
import { getHeroLevel, getHeroLevelState } from '../heroLevel/store';
import type { HeroLevelState } from '../heroLevel/types';

// Card Mastery: the player-facing name for per-card, duplicate-funded progression (docs/COLLECTION-PROGRESSION.md).
//
// This module is a READ-ONLY view over the existing saves. It stores nothing and writes nothing:
//   - Mastery stage is derived from the legacy Ascension rank (skyloom:ascension): stage = rank + 1, so an
//     owned card starts at Mastery I, and the three authored Ascension ranks read as Mastery II-IV.
//   - Mastery V is reserved for the final effect + visual treatment and has no authored content yet.
//   - Legacy Hero Level (skyloom:heroLevel) is reported, never converted. Its eventual retirement is planned by
//     planCardMasteryMigration below, which only REPORTS what a future versioned migration would do.
// Because nothing is persisted here, there is no desync risk and no save migration is needed to ship the view.

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

/** Legacy Ascension rank (0..3) -> Mastery stage (1..4). Never reaches V: V needs content that does not exist yet. */
export function stageFromAscensionRank(rank: number): CardMasteryStage {
  const r = Number.isFinite(rank) ? Math.max(0, Math.floor(rank)) : 0;
  return Math.min(MAX_CARD_MASTERY - 1, r + 1) as CardMasteryStage;
}

/** Inverse of stageFromAscensionRank, for callers that still speak the legacy store's language. */
export function ascensionRankForStage(stage: number): number {
  return Math.max(0, Math.floor(stage) - 1);
}

/**
 * Everything a card face, Card Inspect or a Collection tile needs to show Mastery, in one shape. Thread A's
 * card components and Thread F's integration pass should read this instead of the Ascension/Stars/Level
 * modules directly, so the storage underneath can migrate later without touching presentation.
 */
export interface CardMasteryView {
  cardId: string;
  owned: boolean;
  /** Copies in the collection right now (spent duplicates are already subtracted). */
  copies: number;
  stage: CardMasteryStage;
  /** "Mastery II", or '' when not owned. */
  label: string;
  /** Highest stage reachable in this build: 1 + authored Ascension ranks (1 for a card with no path yet). */
  maxStage: number;
  /** True when this card has authored stages beyond Mastery I. */
  hasPath: boolean;
  /** Copies already invested into Mastery (legacy Ascension `duplicatesSpent`). */
  duplicatesInvested: number;
  /** The stage the next advance reaches, or null at the build's max / no path / not owned. */
  nextStage: number | null;
  /** Duplicate copies the next advance costs. */
  nextCost: number | null;
  /** Copies that can be spent now without breaking a playable deck or the last copy. */
  spareCopies: number;
  canAdvance: boolean;
  /** Player-facing reason when the next stage is blocked (from the existing Ascension rules). */
  blockedReason: string | null;
  /** Pips for compact displays: `stage` filled out of MAX_CARD_MASTERY. Replaces the old derived Stars. */
  pips: { filled: number; total: number };
  /** Legacy per-card Level, preserved in the save; shown only as legacy. */
  legacyLevel: number;
}

export interface CardMasteryDeps {
  owned?: OwnedMap;
  ascension?: AscensionState;
  levels?: HeroLevelState;
}

export function getCardMasteryView(cardId: string, deps: CardMasteryDeps = {}): CardMasteryView {
  const owned = deps.owned ?? getCollection();
  const ascension = deps.ascension ?? getAscensionState();
  const levels = deps.levels ?? getHeroLevelState();
  const copies = getOwnedCount(cardId, owned);
  const isOwned = copies > 0;
  const status = getAscensionStatus(cardId, owned, ascension);
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
    spareCopies: status.spare,
    canAdvance: status.canAscend,
    blockedReason: status.canAscend ? null : isOwned && !hasPath ? 'Mastery path coming later. Extra copies stay in your collection.' : status.reason,
    pips: { filled: stage, total: MAX_CARD_MASTERY },
    legacyLevel: getHeroLevel(cardId, levels),
  };
}

// ---- Proposed target ladder (design data - NOT read by combat, economy or any UI yet) ----------------------

export type MasteryStepKind = 'base' | 'small-stat' | 'effect' | 'prestige' | 'final';

export interface ProposedMasteryStep {
  stage: number;
  kind: MasteryStepKind;
  /** Duplicate copies spent to reach this stage from the previous one. Stages II-IV equal today's Ascension costs. */
  duplicateCost: number;
  summary: string;
}

/**
 * The bounded five-stage ladder proposed in docs/COLLECTION-PROGRESSION.md. Its first three costs ARE the live
 * Ascension costs, so a migrated save lands on the same stage with the same copies invested. Stat amounts are
 * deliberately left out: they are a balance-review decision (ceiling: about +10% ATK and +10% HP Contribution
 * at Mastery V, never a multiplier).
 */
export const PROPOSED_MASTERY_LADDER: readonly ProposedMasteryStep[] = [
  { stage: 1, kind: 'base', duplicateCost: 0, summary: 'The card as printed. Fully usable.' },
  { stage: 2, kind: 'small-stat', duplicateCost: ASCENSION_DUPLICATE_COST[0], summary: 'A small ATK or HP Contribution step.' },
  { stage: 3, kind: 'effect', duplicateCost: ASCENSION_DUPLICATE_COST[1], summary: 'The first effect refinement.' },
  { stage: 4, kind: 'prestige', duplicateCost: ASCENSION_DUPLICATE_COST[2], summary: 'A small stat step and a frame trim.' },
  { stage: 5, kind: 'final', duplicateCost: 4, summary: 'The final effect refinement and the Moonlit treatment.' },
];

/** Total copies a player needs to own to reach `stage` under the proposed ladder (1 kept + every duplicate spent). */
export function copiesToReachStage(stage: number): number {
  return 1 + PROPOSED_MASTERY_LADDER.filter((s) => s.stage > 1 && s.stage <= stage).reduce((sum, s) => sum + s.duplicateCost, 0);
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
 * What a future, versioned Card Mastery migration would do to this save: every owned card and every card with
 * legacy progress gets a row. Pure and idempotent - it reads the three stores and returns a report; running it
 * twice gives the same answer and it changes nothing. Collection copies, Ascension rank and Level stay where
 * they are until a write-migration is explicitly approved (docs/COLLECTION-PROGRESSION.md, "Migration").
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
    const rank = getCardAscension(cardId) ? (ascension.cards[cardId]?.rank ?? 0) : 0;
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
