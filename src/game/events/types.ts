import type { AnalyticsEventName } from '../../analytics/events';

// Live-event content model (Moonwater batch 1, Thread E). An event is plain, local data - the same
// "data, not code" convention as missions/definitions.ts and journey/definitions.ts - so a new event is
// a new EventDefinition, not new UI or store code. Nothing here is fetched from a server yet; a remote
// source could later produce the same shape.

/** Everything an event reward can hand out. Every field maps onto an EXISTING grant path (economy,
 * collection, background unlocks) - events deliberately have no currency of their own. */
export interface EventReward {
  gold?: number;
  gems?: number;
  tickets?: number;
  /** One copy per entry; repeat an id for multiple copies. */
  cardIds?: string[];
  /** A background from game/backgrounds/definitions.ts whose unlockType is 'event'. */
  backgroundId?: string;
}

/** Property filters an analytics event must match for an objective to count it. */
export type ObjectiveFilter = Record<string, string | number | boolean>;

/**
 * What an event mission measures. Both forms read the analytics stream (analytics/track.ts), so an
 * objective is only ever something the game already reports:
 * - count: +1 each time `event` fires (and matches `where`).
 * - sum: + the numeric `property` of each matching `event`.
 */
export type EventObjective =
  | { kind: 'count'; event: AnalyticsEventName; where?: ObjectiveFilter }
  | { kind: 'sum'; event: AnalyticsEventName; property: string; where?: ObjectiveFilter };

export interface EventMissionDef {
  id: string;
  title: string;
  objective: EventObjective;
  target: number;
  reward: EventReward;
}

/** A milestone is judged from state the game already holds - never a separate event currency. */
export type EventRequirement =
  | { kind: 'missionsCompleted'; count: number }
  | { kind: 'allMissionsCompleted' }
  | { kind: 'cardsOwned'; cardIds: string[]; count: number };

export interface EventMilestoneDef {
  id: string;
  title: string;
  requirement: EventRequirement;
  reward: EventReward;
}

export interface EventLoginRewardDef {
  day: number;
  reward: EventReward;
}

/** The product an event promotes. `id` is a Box or Structure Deck id owned by the Shop workstream. */
export interface EventFeaturedProduct {
  kind: 'box' | 'structureDeck';
  id: string;
  name: string;
  blurb: string;
  featuredCardIds: string[];
}

export interface EventTheme {
  /** Card whose artwork fronts the event header (CardArtwork). */
  heroCardId: string;
  /** CSS colour used for the event's accent trim. */
  accent: string;
  faction?: 'kingdom' | 'undead' | 'infernal' | 'wildborn';
}

export interface EventDefinition {
  id: string;
  name: string;
  tagline: string;
  lore: string;
  /** Inclusive start, exclusive end - ISO 8601 with an explicit offset. */
  startsAt: string;
  endsAt: string;
  theme: EventTheme;
  loginRewards: EventLoginRewardDef[];
  missions: EventMissionDef[];
  milestones: EventMilestoneDef[];
  featuredProduct?: EventFeaturedProduct;
  finalReward: EventMilestoneDef;
}

export type EventPhase = 'upcoming' | 'active' | 'ended';
