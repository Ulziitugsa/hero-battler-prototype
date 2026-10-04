import type { OfferDef } from './definitions';

// Which offers the Shop and the Offers sheet show. Every condition is current progression or economy state: the
// Growth Pack used to wait for a card with an Ascension (historical Mastery) rank, which no player can earn any more.

/** Campaign stages a player clears before the Growth Pack ("a roster that is ready to grow") appears. */
export const GROWTH_PACK_MIN_CLEARED_STAGES = 5;

export interface OfferEligibilityContext {
  /** Campaign stages cleared (CampaignProgress.clearedNodes). */
  clearedStages: number;
  /** The player has opened at least one pack (box/boxProduct.ts hasOpenedPacks). */
  openedPacks: boolean;
}

/** Whether `offer` is shown. `comingSoon` entries are the caller's choice: the Offers sheet lists them, the Shop does not. */
export function isOfferEligible(offer: Pick<OfferDef, 'id'>, ctx: OfferEligibilityContext): boolean {
  const progressed = ctx.clearedStages >= GROWTH_PACK_MIN_CLEARED_STAGES;
  if (offer.id === 'starter-pack') return progressed || ctx.openedPacks;
  if (offer.id === 'growth-pack') return progressed;
  if (offer.id.startsWith('gem-pack-')) return ctx.openedPacks;
  return true;
}
