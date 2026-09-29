import { BOX_PRODUCTS } from '../box/boxProduct';
import { PLAYTEST_ROSTER } from '../cards/roster';
import { STRUCTURE_DECKS } from '../structureDecks/definitions';
import { EVENTS } from '../events/definitions';
import type { EventDefinition, EventReward } from '../events/types';

// Shop and event products that also hand out cards. Kept apart from acquisition.ts (Campaign, starter and
// Summon data) so those labels and their tests stay stable; Card Inspect shows both.

function eventRewards(event: EventDefinition): EventReward[] {
  return [...event.loginRewards.map(r => r.reward), ...event.missions.map(m => m.reward), ...event.milestones.map(m => m.reward), event.finalReward.reward];
}

/** Player-facing lines for the Boxes, Structure Decks and live events that can give this card. */
export function productAcquisitionLines(cardId: string, now: number = Date.now()): string[] {
  const lines: string[] = [];
  // Every current Box draws from the whole playtest roster (see prototypeBox.ts).
  if (PLAYTEST_ROSTER.includes(cardId)) for (const box of BOX_PRODUCTS) lines.push(box.name);
  for (const deck of STRUCTURE_DECKS) if (deck.cardIds.includes(cardId)) lines.push(`Structure Deck · ${deck.name}`);
  for (const event of EVENTS) {
    const live = Date.parse(event.startsAt) <= now && now < Date.parse(event.endsAt);
    if (live && eventRewards(event).some(r => r.cardIds?.includes(cardId))) lines.push(`Event · ${event.name}`);
  }
  return lines;
}
