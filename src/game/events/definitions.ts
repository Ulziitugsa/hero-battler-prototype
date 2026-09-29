import { MOONFALL_BOX } from '../box/boxProduct';
import type { EventDefinition, EventPhase } from './types';

// Event content. Add a new event by appending an EventDefinition here - the store, page and Home entry
// all read whichever event is live, so no other file needs to change. Only ONE event is expected to be
// live at a time; if windows overlap, the one that started most recently wins (see getLiveEvent).

const UNDEAD_FEATURED = ['und-wraith-prince', 'und-grave-sage', 'und-grave-knight', 'und-dark-priest', 'und-shade-thief', 'und-crypt-warden'];

export const THE_LONG_VIGIL: EventDefinition = {
  id: 'long-vigil-2026',
  name: 'The Long Vigil',
  tagline: 'The drowned moon rises. The dead keep watch.',
  lore: 'Once a year the lake gives back its lanterns, and Vharos’s old guard walks the shore until dawn. Stand the watch with them.',
  startsAt: '2026-09-28T00:00:00Z',
  endsAt: '2026-11-02T00:00:00Z',
  theme: { heroCardId: 'und-vharos', accent: '#b193d6', faction: 'undead' },
  loginRewards: [
    { day: 1, reward: { gold: 60 } },
    { day: 2, reward: { gems: 20 } },
    { day: 3, reward: { tickets: 1 } },
    { day: 4, reward: { gold: 100 } },
    { day: 5, reward: { gems: 30 } },
    { day: 6, reward: { tickets: 1 } },
    { day: 7, reward: { cardIds: ['und-grave-sage'] } },
  ],
  missions: [
    { id: 'vigil-win-battles', title: 'Win 3 battles', objective: { kind: 'count', event: 'battle_completed', where: { result: 'win' } }, target: 3, reward: { gold: 80 } },
    { id: 'vigil-undead-units', title: 'Play 10 Undead Units', objective: { kind: 'sum', event: 'battle_completed', property: 'undeadUnitsPlayed' }, target: 10, reward: { gems: 20 } },
    { id: 'vigil-damage', title: 'Deal 400 damage to opponents', objective: { kind: 'sum', event: 'battle_completed', property: 'damageDealt' }, target: 400, reward: { gold: 100 } },
    { id: 'vigil-ranked-wins', title: 'Win 2 Ranked matches', objective: { kind: 'count', event: 'ranked_match_won' }, target: 2, reward: { tickets: 1 } },
    { id: 'vigil-campaign-wins', title: 'Win 3 Campaign battles', objective: { kind: 'count', event: 'campaign_won' }, target: 3, reward: { gold: 80 } },
    { id: 'vigil-open-packs', title: 'Open 5 Moonfall packs', objective: { kind: 'sum', event: 'prototype_box_opened', property: 'packCount', where: { boxId: MOONFALL_BOX.id } }, target: 5, reward: { gems: 30 } },
    { id: 'vigil-shop-gift', title: 'Claim the free Shop gift 3 times', objective: { kind: 'count', event: 'shop_free_claimed' }, target: 3, reward: { tickets: 1 } },
  ],
  milestones: [
    { id: 'vigil-missions-3', title: 'Complete 3 missions', requirement: { kind: 'missionsCompleted', count: 3 }, reward: { gold: 150 } },
    { id: 'vigil-collect-4', title: 'Own 4 of the featured Undead cards', requirement: { kind: 'cardsOwned', cardIds: UNDEAD_FEATURED, count: 4 }, reward: { tickets: 1 } },
    { id: 'vigil-missions-5', title: 'Complete 5 missions', requirement: { kind: 'missionsCompleted', count: 5 }, reward: { gems: 50 } },
  ],
  // Thread C owns Box/Structure Deck content; this points at the existing Moonfall Box until the
  // integration pass relinks it to C's product id.
  featuredProduct: {
    kind: 'box',
    id: MOONFALL_BOX.id,
    name: MOONFALL_BOX.name,
    blurb: 'A finite box of 100 packs. Every copy you pull leaves the box for good.',
    featuredCardIds: ['und-wraith-prince', 'und-grave-sage', 'und-grave-knight'],
  },
  finalReward: {
    id: 'vigil-final',
    title: 'Complete every Vigil mission',
    requirement: { kind: 'allMissionsCompleted' },
    reward: { cardIds: ['und-wraith-prince'], backgroundId: 'violet-grove' },
  },
};

export const EVENTS: readonly EventDefinition[] = [THE_LONG_VIGIL];

const BY_ID = new Map(EVENTS.map((event) => [event.id, event]));

export function getEventDef(id: string): EventDefinition | undefined {
  return BY_ID.get(id);
}

export function eventPhase(event: EventDefinition, now: number = Date.now()): EventPhase {
  if (now < Date.parse(event.startsAt)) return 'upcoming';
  if (now >= Date.parse(event.endsAt)) return 'ended';
  return 'active';
}

/** The event running right now, or null. */
export function getLiveEvent(now: number = Date.now(), events: readonly EventDefinition[] = EVENTS): EventDefinition | null {
  const live = events.filter((event) => eventPhase(event, now) === 'active');
  live.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  return live[0] ?? null;
}

/** Whole days left, rounded up - "Ends in 3 days" never overstates the real end time by more than a day. */
export function daysRemaining(event: EventDefinition, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(event.endsAt) - now) / (24 * 60 * 60 * 1000)));
}
