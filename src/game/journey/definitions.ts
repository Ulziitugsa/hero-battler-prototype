// The 7-day new-player journey (Commercial Prototype Phase 6) - content as plain data, same convention
// as campaign/chapter1.ts and missions/definitions.ts. None of these substitutions invent a new system:
// the brief's own example day list named a Relic, Summon Tickets and a Cosmetic - none of which exist in
// this codebase yet (equipment/relics are explicitly deferred past this workstream; Summon Tickets are a
// Phase 7 concern; there is no cosmetics system at all). Every reward here uses a currency or grant
// mechanism that already exists (Gold, Gems, a direct card grant via collection/collection.ts), so no new
// instrumentation or economy surface was pulled forward just to hit specific example nouns. See
// docs/COMMERCIAL-PROTOTYPE-PLAN.md Phase 6.
//
// The reward sequence deliberately mirrors the "staged unlock" instruction (brief Section 5/9): each day
// nudges the player toward a different progression system rather than repeating the same currency.

export interface JourneyDayDef {
  day: number; // 1-7
  title: string;
  blurb: string;
  rewardGold: number;
  rewardGems: number;
  /** A direct card grant, day 1 (introduces the hero) and day 3 (a duplicate of it - introduces Stars). */
  rewardCardId?: string;
  rewardCardCount?: number;
}

export const JOURNEY_DAYS: JourneyDayDef[] = [
  { day: 1, title: 'A new Hero joins you', blurb: 'Someone answered the call.', rewardGold: 0, rewardGems: 0, rewardCardId: 'inf-blood-demon', rewardCardCount: 1 },
  { day: 2, title: 'Gems for the Moonwell', blurb: 'Enough for a real Summon.', rewardGold: 0, rewardGems: 100 },
  { day: 3, title: 'A second Blood Demon', blurb: 'Duplicates are never wasted - see Ascension.', rewardGold: 0, rewardGems: 0, rewardCardId: 'inf-blood-demon', rewardCardCount: 1 },
  { day: 4, title: 'Gold for your roster', blurb: 'Level a Hero up.', rewardGold: 150, rewardGems: 0 },
  { day: 5, title: 'More Gold', blurb: 'Keep your roster growing.', rewardGold: 200, rewardGems: 0 },
  { day: 6, title: 'A bigger Gem purse', blurb: 'Save it for a 10x pull.', rewardGold: 0, rewardGems: 200 },
  { day: 7, title: 'Infernal Lord', blurb: 'A Legendary hero, free.', rewardGold: 0, rewardGems: 0, rewardCardId: 'inf-infernal-lord', rewardCardCount: 1 },
];

const BY_DAY = new Map(JOURNEY_DAYS.map((d) => [d.day, d]));

export function getJourneyDayDef(day: number): JourneyDayDef | undefined {
  return BY_DAY.get(day);
}

export const JOURNEY_LENGTH_DAYS = JOURNEY_DAYS.length;
