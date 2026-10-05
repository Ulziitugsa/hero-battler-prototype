import { EVENTS } from '../events/definitions';
import { hasDirectReward, type EventDefinition, type EventReward } from '../events/types';

// Live events that also hand out cards. Kept apart from acquisition.ts (Core, Campaign, Boxes and Structure Decks)
// because it depends on the clock; Card Inspect shows both.

function eventRewards(event: EventDefinition): EventReward[] {
  return [...event.loginRewards.map(r => r.reward), ...event.missions.map(m => m.reward), ...event.milestones.map(m => m.reward), event.finalReward.reward].filter(hasDirectReward);
}

/** Player-facing lines for the live events that can give this card. */
export function productAcquisitionLines(cardId: string, now: number = Date.now()): string[] {
  const lines: string[] = [];
  for (const event of EVENTS) {
    const live = Date.parse(event.startsAt) <= now && now < Date.parse(event.endsAt);
    if (live && eventRewards(event).some(r => r.cardIds?.includes(cardId))) lines.push(`Event · ${event.name}`);
  }
  return lines;
}
