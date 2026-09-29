import type { AbilityDefinition, CardDefinition } from '../../types/index.js';
import { getCard as getLiveCard } from '../../cards/index.js';
import type { SimDeck } from '../decks.js';

// Effect / archetype balance pass, Thread A: defensive decks (docs/CARD-COMBAT-DESIGN.md, approved model).
// Everything here is proposal data for the simulator. Nothing in the game reads it; the live card files are
// untouched. Balance studies install these definitions with cardSource.withCardOverrides.

function rewrite(id: string, patch: Partial<CardDefinition>): CardDefinition {
  return { ...getLiveCard(id), ...patch };
}

function ability(id: string, index: number): AbilityDefinition {
  return getLiveCard(id).abilities[index];
}

/**
 * Guard N: "Before Combat: if this Unit would lose its lane, it gains +N Power this round." The same
 * ability the Legendary Paladin already prints (+4), so it needs no new engine primitive. It makes a
 * low-ATK Unit good at holding or retaking a lane and changes nothing when it attacks an empty lane.
 */
export function guard(amount: number): AbilityDefinition {
  return {
    trigger: 'BEFORE_COMBAT',
    conditions: [{ type: 'SELF_LOSING_LANE' }],
    actions: [{ type: 'CHANGE_POWER', amount, duration: 'UNTIL_ROUND_END', target: 'SELF' }],
    text: `Guard ${amount}: Before Combat, if this Hero would lose its lane, gain +${amount} Power this round.`,
  };
}

/** Approved in the combat-model decision (2026-09-29): the two Power 7 Legendaries re-band to Power 6. */
export const APPROVED_BASELINE_OVERRIDES: CardDefinition[] = [rewrite('und-vharos', { power: 6 }), rewrite('inf-infernal-lord', { power: 6 })];

export interface CardChange {
  card: CardDefinition;
  current: string;
  problem: string;
  proposed: string;
  reason: string;
}

/** The recommended defensive changes. Two existing Rares, no new cards, no new engine primitive. */
export const DEFENSIVE_CHANGES: CardChange[] = [
  {
    card: rewrite('und-dark-priest', {
      boardText: 'Guard 2; +2 w/3+ Grave',
      abilities: [guard(2), ability('und-dark-priest', 1)],
    }),
    current: 'When an ally dies, gain +1 Power (permanent). Before Combat: if your Graveyard holds 3 or more cards, gain +2 Power this round.',
    problem: 'A Power 3 body (ATK ~80) loses nearly every clash, so it is a card thrown away in a defensive deck. The permanent +1 per ally death is unbounded growth with no cap.',
    proposed: 'Guard 2: Before Combat, if this Hero would lose its lane, gain +2 Power this round. Before Combat: if your Graveyard holds 3 or more cards, gain +2 Power this round.',
    reason: 'A cheap wall that beats Power 5 attackers when it blocks (80 + 30, +30 more once the Graveyard fills) but still hits for only ~80 when unopposed. Removes an unbounded growth line.',
  },
  {
    card: rewrite('und-grave-knight', {
      boardText: 'Guard 2; 1st/rnd: Heal2',
      abilities: [guard(2), ability('und-grave-knight', 1)],
    }),
    current: 'When an enemy Hero dies, gain +1 Power (permanent). The first time an enemy Hero dies each round, heal your player for 2 (90 HP).',
    problem: 'Its heal only fires after a clash it rarely wins at ATK ~100, and the permanent +1 per enemy death is unbounded growth.',
    proposed: 'Guard 2: Before Combat, if this Hero would lose its lane, gain +2 Power this round. The first time an enemy Hero dies each round, heal your player for 2 (90 HP).',
    reason: 'Blocking a Power 5 or 6 attacker now wins or trades, which is exactly when the heal pays off, so the card turns held lanes into HP. Removes an unbounded growth line.',
  },
];

export const DEFENSIVE_OVERRIDES: CardDefinition[] = DEFENSIVE_CHANGES.map((c) => c.card);

/**
 * Rebuilt defensive list (11 Units / 4 Spells, Kingdom + Undead): the cards whose job is holding lanes,
 * healing and preventing damage. The original study deck (decks.ts DEFENSIVE_DECK) also carries 2
 * Infernal Cultists, which are aggressive filler.
 */
export const BULWARK_DECK: string[] = [
  'und-crypt-warden', 'und-crypt-warden',
  'und-dark-priest', 'und-dark-priest',
  'und-grave-knight', 'und-grave-knight',
  'kng-light-priest', 'kng-light-priest',
  'kng-royal-guard', 'kng-royal-guard',
  'kng-paladin',
  'spl-aegis-ward', 'spl-aegis-ward',
  'spl-stasis-field', 'spl-stasis-field',
];

export const BULWARK_SIM_DECK: SimDeck = { id: 'defensive-bulwark', label: 'Defensive Bulwark (11U/4S, rebuilt)', group: 'study', pilot: 'defensive', cards: BULWARK_DECK };

export function overrideMap(...lists: CardDefinition[][]): Map<string, CardDefinition> {
  const map = new Map<string, CardDefinition>();
  for (const list of lists) for (const card of list) map.set(card.id, card);
  return map;
}
