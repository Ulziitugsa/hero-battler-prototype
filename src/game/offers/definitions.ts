// The offer catalog (Commercial Prototype Phase 10) - product/catalog/UX layer only. NO real money is
// ever processed anywhere in this codebase: every "purchase" here resolves through
// game/offers/store.ts's simulated flow, which grants rewards through the exact same economy/collection
// functions every other reward source uses, and is unmistakably labelled as a test transaction in the UI
// (OffersSheet.tsx). Prices are display strings only, sourced from config/schema.ts's
// `offers.priceLabels` (Phase 8) - not hardcoded here, so they're one of the "future offer prices"
// candidate config values the brief named.
//
// Deliberately small: 2 bundles + 3 Gem packs + 1 locked preview, not "ten packs" (brief: "Do not create
// ten packs"). The First-Purchase Bonus (brief) is not a separate catalog entry - it's a flag/state
// (game/offers/store.ts's hasEverPurchased) applied to whichever offer completes first, per the brief's
// "Represent the reward and flow... keep it in a development/test state."

export type OfferId = 'starter-pack' | 'growth-pack' | 'gem-pack-small' | 'gem-pack-medium' | 'gem-pack-large' | 'season-pass-preview';

export interface OfferReward {
  gold?: number;
  gems?: number;
  tickets?: number;
  cardId?: string;
  cardCount?: number;
}

export interface OfferDef {
  id: OfferId;
  title: string;
  subtitle: string;
  reward: OfferReward;
  /** A locked "coming soon" catalog entry with no purchase flow at all - the brief's "Season Pass
   * preview... only if it is cheap to represent cleanly": this is the cheap representation - a name and a
   * locked card, no pass-progression system built (that would need its own missions-shaped work). */
  comingSoon?: boolean;
}

export const OFFERS: OfferDef[] = [
  {
    id: 'starter-pack',
    title: 'Starter Pack',
    subtitle: 'A generous first step - Gold, Gems, Tickets and a Hero.',
    reward: { gold: 500, gems: 300, tickets: 5, cardId: 'kng-battle-captain', cardCount: 1 },
  },
  {
    id: 'growth-pack',
    title: 'Growth Pack',
    subtitle: 'For a roster that is ready to grow.',
    reward: { gold: 1500, gems: 400, tickets: 3 },
  },
  { id: 'gem-pack-small', title: 'Small Gem Pouch', subtitle: 'A quick top-up.', reward: { gems: 100 } },
  { id: 'gem-pack-medium', title: 'Gem Purse', subtitle: 'Enough for a 10x Summon.', reward: { gems: 900 } },
  { id: 'gem-pack-large', title: 'Gem Chest', subtitle: 'The generous option.', reward: { gems: 2000 } },
  { id: 'season-pass-preview', title: 'Season Pass', subtitle: 'Coming soon - track your Missions to prepare.', reward: {}, comingSoon: true },
];

const BY_ID = new Map(OFFERS.map((o) => [o.id, o]));

export function getOfferDef(id: OfferId): OfferDef | undefined {
  return BY_ID.get(id);
}

/** First-purchase bonus content (brief: "Represent the reward and flow... development/test state" - this
 * is granted ONCE, on top of whatever offer completes first, never again). */
export const FIRST_PURCHASE_BONUS: OfferReward = { gems: 200 };
