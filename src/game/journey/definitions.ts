// The 7-day new-player journey (Commercial Prototype Phase 6) - content as plain data, same convention
// as campaign/chapter1.ts and missions/definitions.ts. Day 2 gives one Pack Ticket (it opens one pack of the
// Moonfall Box; they were Summon Tickets until the Moonwell Summon was retired). A Relic (Day 3) and a Cosmetic
// (Day 6) remain substituted - neither system exists in this codebase and neither is in scope for this
// workstream (see the repo audit's own recommendation to defer equipment/relics and cosmetics).
//
// The reward sequence deliberately mirrors the "staged unlock" instruction (brief Section 5/9): each day
// nudges the player toward a different progression system rather than repeating the same currency.

export interface JourneyDayDef {
  day: number; // 1-7
  title: string;
  blurb: string;
  rewardGold: number;
  rewardGems: number;
  rewardTickets: number;
  /** A direct card grant, day 1 (introduces the card) and day 3 (a second copy of it, for a two-copy deck slot). */
  rewardCardId?: string;
  rewardCardCount?: number;
}

export const JOURNEY_DAYS: JourneyDayDef[] = [
  { day: 1, title: 'A new card joins you', blurb: 'Someone answered the call.', rewardGold: 0, rewardGems: 0, rewardTickets: 0, rewardCardId: 'inf-blood-demon', rewardCardCount: 1 },
  { day: 2, title: 'A Pack Ticket', blurb: 'A pack from the Moonfall Box, on the house.', rewardGold: 0, rewardGems: 0, rewardTickets: 1 },
  { day: 3, title: 'A second Blood Demon', blurb: 'A deck can run two copies of a card.', rewardGold: 0, rewardGems: 0, rewardTickets: 0, rewardCardId: 'inf-blood-demon', rewardCardCount: 1 },
  { day: 4, title: 'Gold for your purse', blurb: 'A head start for what comes next.', rewardGold: 150, rewardGems: 0, rewardTickets: 0 },
  { day: 5, title: 'More Gold', blurb: 'Keep your collection growing.', rewardGold: 200, rewardGems: 0, rewardTickets: 0 },
  { day: 6, title: 'A bigger Gem purse', blurb: 'Enough for a pack, with Gems to spare.', rewardGold: 0, rewardGems: 200, rewardTickets: 0 },
  { day: 7, title: 'Infernal Lord', blurb: 'A Legendary card, free.', rewardGold: 0, rewardGems: 0, rewardTickets: 0, rewardCardId: 'inf-infernal-lord', rewardCardCount: 1 },
];

const BY_DAY = new Map(JOURNEY_DAYS.map((d) => [d.day, d]));

export function getJourneyDayDef(day: number): JourneyDayDef | undefined {
  return BY_DAY.get(day);
}

export const JOURNEY_LENGTH_DAYS = JOURNEY_DAYS.length;
