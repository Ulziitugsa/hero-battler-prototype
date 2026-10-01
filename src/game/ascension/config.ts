// Card Mastery tuning (stored as the legacy Ascension rank: rank 0..4 = Mastery I..V), centralised so costs are a
// one-file change. Duplicates are still just duplicates: advancing spends spare copies of the SAME card (the
// collection quantity drops by the cost; the store remembers how many were spent). One flat curve for every card.
//
// Mastery changes HP Contribution only (cardCombat/stats.ts MASTERY_HPC_PCT: +0/5/10/15/20%). ATK never changes.

/** Mastery V. Every collectible card has the full path (ascension/path.ts). */
export const MAX_ASCENSION_RANK = 4;

/** Duplicate copies spent to reach Mastery II, III, IV, V (index 0 = rank 1). 1 + 10 spent = 11 copies for Mastery V. */
export const ASCENSION_DUPLICATE_COST: readonly number[] = [1, 2, 3, 4];

/**
 * Gold paid on top of the duplicates for the last two stages (index 0 = rank 1): Mastery IV costs 500 Gold, Mastery V
 * 1,500 Gold. The game's Gold sink now that Legacy Level is retired; it never replaces the duplicates, so Mastery still
 * comes from collecting the card. Overridable through config (economy.masteryGoldFee).
 */
export const MASTERY_GOLD_FEE: readonly number[] = [0, 0, 500, 1500];

export function ascensionCost(toRank: number): number {
  return ASCENSION_DUPLICATE_COST[toRank - 1] ?? Infinity;
}

/** The last usable copy is never spendable: after Ascending the player must still own at least this many. */
export const MIN_COPIES_KEPT = 1;
