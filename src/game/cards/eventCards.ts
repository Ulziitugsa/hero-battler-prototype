import { LAUNCH_ROSTER } from './launchRoster.js';

// The launch set's event / progression cards: in the roster and fully playable, but no live event, Campaign stage or
// Ranked milestone hands them out yet. This registry records where each one is meant to come from (the approved set
// design, card-set-120 REPORT: Grave Tyrant is a Campaign boss reward; the rest come from events, the Campaign or Ranked
// milestones, not yet assigned one by one), so the Collection can say so and the coverage test knows
// they are parked on purpose.
//
// TODO(event cards): wire each card to its real source when that event, Campaign chapter or milestone is built, then
// drop it from here. Until then they cannot be obtained in normal play (dev tools can grant them).

export type PlannedCardSource = 'campaign' | 'event' | 'ranked-milestone';

export interface EventCardPlan {
  cardId: string;
  plannedSource: PlannedCardSource;
  note: string;
}

export const EVENT_CARD_PLANS: readonly EventCardPlan[] = [
  { cardId: 'und-grave-tyrant', plannedSource: 'campaign', note: 'Campaign boss reward (a later chapter)' },
  { cardId: 'und-ashen-revenant', plannedSource: 'event', note: 'Event or progression reward' },
  { cardId: 'kng-arcane-knight', plannedSource: 'event', note: 'Event or progression reward' },
  { cardId: 'und-night-courier', plannedSource: 'event', note: 'Event or progression reward' },
  { cardId: 'inf-pack-warden', plannedSource: 'event', note: 'Event or progression reward' },
  { cardId: 'spl-oath-of-vengeance', plannedSource: 'event', note: 'Event or progression reward' },
];

export function eventCardPlan(cardId: string): EventCardPlan | null {
  return EVENT_CARD_PLANS.find((p) => p.cardId === cardId) ?? null;
}

/** Every roster card whose launch source is 'event' (a test keeps this equal to EVENT_CARD_PLANS). */
export function launchEventCardIds(): string[] {
  return LAUNCH_ROSTER.filter((c) => c.source === 'event').map((c) => c.id);
}
