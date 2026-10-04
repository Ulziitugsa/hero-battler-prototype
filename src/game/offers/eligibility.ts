// When the Starter and Growth Pack offers show (Shop and the Home offers sheet share this). Visibility reads
// current progression and economy state only: whether the player has opened a pack, and their Account Level.
// It used to read historical Ascension/Mastery ranks (`getAscensionRank(...) > 0`), which no player can raise any
// more since combat Card Mastery was retired; that record is preserved but no longer gates offers (ozi, 2026-10-04).

/** Account Level at which the Growth Pack appears (about a dozen Campaign stage clears). Prototype placeholder. */
export const GROWTH_PACK_MIN_ACCOUNT_LEVEL = 5;

export interface OfferVisibilityContext {
  /** hasOpenedPacks(economy): a pack opened from a Box, or a saved Summon history from before packs. */
  openedPacks: boolean;
  accountLevel: number;
}

export function isStarterPackVisible(ctx: OfferVisibilityContext): boolean {
  return ctx.openedPacks;
}

export function isGrowthPackVisible(ctx: OfferVisibilityContext): boolean {
  return ctx.openedPacks && ctx.accountLevel >= GROWTH_PACK_MIN_ACCOUNT_LEVEL;
}
