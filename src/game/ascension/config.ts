// Historical Card Mastery tuning (stored as the legacy Ascension rank: rank 0..4 = Mastery I..V).
//
// Combat Card Mastery is removed and no Mastery can be bought (ascension/ascend.ts). These numbers describe the ladder
// players climbed before, so the store can sanitize old saves and a future cosmetic Prestige study can read what was
// invested. They are NOT an approved Prestige economy, and nothing charges them.

/** Mastery V: the highest rank a save can hold. */
export const MAX_ASCENSION_RANK = 4;

/** Duplicate copies the old ladder spent to reach Mastery II, III, IV, V (index 0 = rank 1). Historical only. */
export const ASCENSION_DUPLICATE_COST: readonly number[] = [1, 2, 3, 4];

/**
 * The old Gold fee on top of the duplicates for Mastery IV (500) and V (1,500) (index 0 = rank 1). INERT: kept only as
 * the default of config economy.masteryGoldFee for reference in a future Prestige study. Nothing reads or charges it.
 */
export const MASTERY_GOLD_FEE: readonly number[] = [0, 0, 500, 1500];
