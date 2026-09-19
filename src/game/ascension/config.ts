// Ascension tuning - centralised so costs are a one-file change. Duplicates are still just duplicates:
// Ascending spends spare copies of the SAME card (the collection quantity drops by the cost; the
// Ascension store remembers how many were spent). One flat curve for every rarity in this prototype.

export const MAX_ASCENSION_RANK = 3;

/** Duplicate copies spent to reach Ascension I, II, III (index 0 = rank 1). */
export const ASCENSION_DUPLICATE_COST: readonly number[] = [1, 2, 3];

export function ascensionCost(toRank: number): number {
  return ASCENSION_DUPLICATE_COST[toRank - 1] ?? Infinity;
}

/** The last usable copy is never spendable: after Ascending the player must still own at least this many. */
export const MIN_COPIES_KEPT = 1;
