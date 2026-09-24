// The typed remote-config schema (Commercial Prototype Phase 8). This is the full surface that COULD be
// tuned without a client release. Every field has a hardcoded default (config/defaults.ts) equal to the
// value already live in the codebase before Phase 8, so the prototype runs fully offline/local with zero
// provider configured - see config/config.ts's header note.
//
// Two kinds of fields, by design:
//  - Plain scalars/objects (economy amounts, thresholds, rates) - these ARE the tunable value; a remote
//    provider overrides the whole field.
//  - `*Overrides` maps, keyed by content id (a campaign node id, a mission id, a journey day number) -
//    content ITSELF (which Campaign nodes exist, what a mission's title/metric is, what day a journey
//    reward lands on) stays in its own file (chapter1.ts, missions/definitions.ts, journey/definitions.ts)
//    as plain data, per this codebase's existing "content is data, not config" convention. Duplicating
//    the entire content shape into this schema just to make individual numbers remote-tunable would mean
//    two sources of truth for the same content; an override map lets a specific id's number be replaced
//    without moving the content itself. An id with no entry uses the content file's own value.

export interface EconomyConfig {
  startingGems: number;
  maxGems: number;
  startingGold: number;
  maxGold: number;
  startingTickets: number;
  maxTickets: number;
  /** By Campaign node type - see campaign/types.ts's CampaignNodeType. */
  campaignFirstClearGems: Record<string, number>;
  chapterCompleteGems: number;
  /** Account Level -> Gems awarded at that level. */
  levelMilestoneGems: Record<number, number>;
  campaignWinGold: Record<string, number>;
  quickBattleWinGold: number;
  quickBattleDrawGold: number;
}

export interface SummonConfig {
  singleGemCost: number;
  tenGemCost: number;
  ticketCostSingle: number;
  ticketCostTen: number;
  pityThreshold: number;
  rarityRates: { common: number; rare: number; epic: number; legendary: number };
  heroWeight: number;
  spellWeight: number;
  featuredMainMultiplier: number;
  featuredSecondaryMultiplier: number;
}

export interface HeroLevelConfig {
  maxHeroLevel: number;
  /** hero level cap = accountLevel * this, capped at maxHeroLevel. */
  accountLevelCapMultiplier: number;
  /** Gold cost curve: cost(fromLevel) = base + fromLevel * perLevel. */
  levelUpCostBase: number;
  levelUpCostPerLevel: number;
}

export interface CampaignConfig {
  energyMax: number;
  energyStarting: number;
  energyRegenIntervalMs: number;
  energyRegenAmount: number;
  /** node id -> energy cost, by node type default (battle/elite/boss/challenge/story/reward). */
  nodeEnergyCostByType: Record<string, number>;
  /** Campaign node id -> a recommendedRosterPower override (see file header). Absent = the node's own authored value in chapter1.ts. */
  recommendedPowerOverrides: Record<string, number>;
}

export interface IdleRewardsConfig {
  capHours: number;
  goldPerHourBase: number;
  goldPerHourPerNode: number;
}

/** Reward amounts only - NOT `target` (progress counts are capped/compared against the content file's
 * own target in several places; overriding it would need to flow through all of them consistently, which
 * this phase deliberately did not take on - see docs/COMMERCIAL-PROTOTYPE-PLAN.md Phase 8). Change a
 * mission's target by editing missions/definitions.ts directly. */
export interface MissionRewardOverride {
  gold?: number;
  gems?: number;
  tickets?: number;
}

export interface MissionsConfig {
  /** mission id -> a reward/target override (see file header). */
  rewardOverrides: Record<string, MissionRewardOverride>;
}

export interface JourneyRewardOverride {
  gold?: number;
  gems?: number;
  tickets?: number;
}

export interface JourneyConfig {
  /** day number -> a reward override (see file header). */
  rewardOverrides: Record<number, JourneyRewardOverride>;
}

/** Offer catalog values (Commercial Prototype Phase 10) - prices/contents only, never real payment wiring. */
export interface OffersConfig {
  /** offer id -> its price display string (e.g. "$1.99") - cosmetic only in this prototype (no real charge exists). */
  priceLabels: Record<string, string>;
}

export interface FeatureFlags {
  /** Shows the Summon Gems/Tickets currency toggle even at 0 Tickets (default false - see Phase 7's "don't clutter" note). */
  alwaysShowTicketToggle: boolean;
  /** Master switch for the Phase 10 offers surface. */
  offersEnabled: boolean;
}

export interface GameConfig {
  economy: EconomyConfig;
  summon: SummonConfig;
  heroLevel: HeroLevelConfig;
  campaign: CampaignConfig;
  idle: IdleRewardsConfig;
  missions: MissionsConfig;
  journey: JourneyConfig;
  offers: OffersConfig;
  flags: FeatureFlags;
}
