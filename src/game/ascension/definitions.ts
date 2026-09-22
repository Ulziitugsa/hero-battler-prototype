import type { AbilityDefinition } from '../types/index.js';

// Ascension paths, as data. A rank is a list of modifiers applied ON TOP of the card's base abilities
// (never mutating the base definition): ADD_ABILITY appends an ability built from existing engine
// primitives; REPLACE_ABILITY swaps one base ability (by its index in the base list) for a refined
// version. Ranks are cumulative - Ascension II includes Ascension I's modifiers. Nothing here is a raw
// stat bump: each rank adds reach, reliability, a condition or a secondary clause to the card's own
// identity. Base cards stay fully functional; Ascension only refines them.
//
// The engine resolves these through ascension/effective.ts; the UI reads `name`/`summary` for previews.

export type AscensionModifier =
  | { type: 'ADD_ABILITY'; ability: AbilityDefinition }
  | { type: 'REPLACE_ABILITY'; index: number; ability: AbilityDefinition };

export interface AscensionRankDef {
  /** 1-based rank this entry unlocks. */
  rank: number;
  /** Short title for the rank ("Steadfast"). */
  name: string;
  /** One line describing what changes - shown in the preview instead of asking the player to diff rules text. */
  summary: string;
  modifiers: AscensionModifier[];
}

export interface CardAscensionDef {
  cardId: string;
  ranks: AscensionRankDef[];
}

const add = (ability: AbilityDefinition): AscensionModifier => ({ type: 'ADD_ABILITY', ability });
const replace = (index: number, ability: AbilityDefinition): AscensionModifier => ({ type: 'REPLACE_ABILITY', index, ability });

export const CARD_ASCENSIONS: CardAscensionDef[] = [
  // ---- Kingdom -----------------------------------------------------------------------------
  {
    cardId: 'kng-royal-guard',
    ranks: [
      {
        rank: 1,
        name: 'Steadfast',
        summary: 'Spell immunity now needs any other ally in play, not just a Kingdom one.',
        modifiers: [
          replace(1, {
            trigger: 'PASSIVE',
            conditions: [{ type: 'ALLY_HERO_COUNT_AT_LEAST', count: 2 }],
            actions: [{ type: 'GRANT_IMMUNITY', immunity: 'SPELL', target: 'SELF' }],
            text: 'While another allied Hero is in play, this Hero is immune to hostile Spell effects.',
          }),
        ],
      },
      {
        rank: 2,
        name: 'Shield Wall',
        summary: 'On Play, also shields the adjacent allied Heroes.',
        modifiers: [
          add({
            trigger: 'ON_PLAY',
            actions: [{ type: 'GRANT_SHIELD', target: 'ADJACENT_ALLIES' }],
            text: 'On Play: adjacent allied Heroes gain a shield.',
          }),
        ],
      },
      {
        rank: 3,
        name: 'Formation',
        summary: 'Adjacent allies gain +1 Power each combat while this Hero holds the line.',
        modifiers: [
          add({
            trigger: 'BEFORE_COMBAT',
            conditions: [{ type: 'ADJACENT_ALLY_PRESENT' }],
            actions: [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'ADJACENT_ALLIES' }],
            text: 'Before Combat: adjacent allied Heroes gain +1 Power this round.',
          }),
        ],
      },
    ],
  },
  {
    cardId: 'kng-battle-captain',
    ranks: [
      {
        rank: 1,
        name: 'Guarded Commander',
        summary: 'On Play, this Hero gains a shield.',
        modifiers: [add({ trigger: 'ON_PLAY', actions: [{ type: 'GRANT_SHIELD', target: 'SELF' }], text: 'On Play: this Hero gains a shield.' })],
      },
      {
        rank: 2,
        name: 'Rally',
        summary: 'When an ally dies, all allies gain +1 Power this round.',
        modifiers: [
          add({
            trigger: 'ON_ALLY_DEATH',
            actions: [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'ALL_ALLIES' }],
            text: 'When an ally dies, all allied Heroes gain +1 Power this round.',
          }),
        ],
      },
      {
        rank: 3,
        name: 'Unbowed',
        summary: 'Also immune to hostile Spell effects while another Knight is in play.',
        modifiers: [
          add({
            trigger: 'PASSIVE',
            conditions: [{ type: 'ALLY_TAG_PRESENT', tag: 'Knight' }],
            actions: [{ type: 'GRANT_IMMUNITY', immunity: 'SPELL', target: 'SELF' }],
            text: 'While another Knight is in play, this Hero is also immune to hostile Spell effects.',
          }),
        ],
      },
    ],
  },
  // ---- Undead ------------------------------------------------------------------------------
  {
    cardId: 'und-bone-soldier',
    ranks: [
      {
        rank: 1,
        name: 'Rattling Horde',
        summary: 'Gains +1 Power in combat while your Graveyard holds 2 or more Undead Heroes.',
        modifiers: [
          add({
            trigger: 'BEFORE_COMBAT',
            conditions: [{ type: 'GRAVEYARD_FACTION_COUNT_AT_LEAST', faction: 'undead', count: 2 }],
            actions: [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'SELF' }],
            text: 'Before Combat: if your Graveyard holds 2 or more Undead Heroes, gain +1 Power this round.',
          }),
        ],
      },
      {
        rank: 2,
        name: 'Bone Recall',
        summary: 'On Play, if your hand is small, returns a weak Hero from your Graveyard.',
        modifiers: [
          add({
            trigger: 'ON_PLAY',
            conditions: [{ type: 'HAND_SIZE_AT_MOST', count: 3 }],
            actions: [{ type: 'RETURN_TO_HAND', maxPower: 4, pick: 'LOWEST_POWER' }],
            text: 'On Play: if your hand holds 3 or fewer cards, return a Hero with 4 or less Power from your Graveyard to your hand.',
          }),
        ],
      },
      {
        rank: 3,
        name: 'Unquiet Dead',
        summary: 'Immune to hostile Hero abilities while your Graveyard holds 4 or more Undead Heroes.',
        modifiers: [
          add({
            trigger: 'PASSIVE',
            conditions: [{ type: 'GRAVEYARD_FACTION_COUNT_AT_LEAST', faction: 'undead', count: 4 }],
            actions: [{ type: 'GRANT_IMMUNITY', immunity: 'HERO_EFFECT', target: 'SELF' }],
            text: 'While your Graveyard holds 4 or more Undead Heroes, this Hero is immune to hostile Hero abilities.',
          }),
        ],
      },
    ],
  },
  {
    cardId: 'und-grave-knight',
    ranks: [
      {
        rank: 1,
        name: 'Grim Tithe',
        summary: 'The once-per-round heal also triggers when an ally dies.',
        modifiers: [
          add({
            trigger: 'ON_ALLY_DEATH',
            oncePerRound: true,
            actions: [{ type: 'PLAYER_HEAL', amount: 2 }],
            text: 'The first time an allied Hero dies each round, heal your player for 2.',
          }),
        ],
      },
      {
        rank: 2,
        name: 'Reaper\'s Ward',
        summary: 'When an enemy Hero dies, this Hero gains a shield.',
        modifiers: [add({ trigger: 'ON_ENEMY_DEATH', actions: [{ type: 'GRANT_SHIELD', target: 'SELF' }], text: 'When an enemy Hero dies, this Hero gains a shield.' })],
      },
      {
        rank: 3,
        name: 'Harvest',
        summary: 'Gains +2 Power in combat after an enemy Hero has died this round.',
        modifiers: [
          add({
            trigger: 'BEFORE_COMBAT',
            conditions: [{ type: 'ENEMY_DIED_THIS_ROUND' }],
            actions: [{ type: 'CHANGE_POWER', amount: 2, duration: 'UNTIL_ROUND_END', target: 'SELF' }],
            text: 'Before Combat: if an enemy Hero has died this round, gain +2 Power this round.',
          }),
        ],
      },
    ],
  },
  // ---- Infernal ----------------------------------------------------------------------------
  {
    cardId: 'inf-hellhound',
    ranks: [
      {
        rank: 1,
        name: 'Gate Hunter',
        summary: 'Deals 1 extra damage to the enemy player when its lane is unopposed.',
        modifiers: [
          add({
            trigger: 'BEFORE_COMBAT',
            conditions: [{ type: 'LANE_EMPTY_ENEMY_SIDE' }],
            actions: [{ type: 'PLAYER_DAMAGE', amount: 1 }],
            text: 'Before Combat: if no enemy Hero is in this lane, deal 1 damage to the enemy player.',
          }),
        ],
      },
      {
        rank: 2,
        name: 'Blood Scent',
        summary: 'When this deals direct damage, deal 1 extra damage.',
        modifiers: [add({ trigger: 'ON_DIRECT_DAMAGE', actions: [{ type: 'PLAYER_DAMAGE', amount: 1 }], text: 'When this deals direct damage, deal 1 extra damage.' })],
      },
      {
        rank: 3,
        name: 'Pack Hunter',
        summary: 'Gains +1 Power in combat while another Infernal Hero is in play.',
        modifiers: [
          add({
            trigger: 'BEFORE_COMBAT',
            conditions: [{ type: 'ALLY_FACTION_PRESENT', faction: 'infernal' }],
            actions: [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'SELF' }],
            text: 'Before Combat: while another Infernal Hero is in play, gain +1 Power this round.',
          }),
        ],
      },
    ],
  },
  {
    cardId: 'inf-pit-fiend',
    ranks: [
      {
        rank: 1,
        name: 'Ashen Payoff',
        summary: 'When an enemy Hero dies, deal 1 damage to the enemy player.',
        modifiers: [add({ trigger: 'ON_ENEMY_DEATH', actions: [{ type: 'PLAYER_DAMAGE', amount: 1 }], text: 'When an enemy Hero dies, deal 1 damage to the enemy player.' })],
      },
      {
        rank: 2,
        name: 'Scorched Earth',
        summary: 'After Combat, if an ally died this round, deal 1 damage to the enemy player.',
        modifiers: [
          add({
            trigger: 'AFTER_COMBAT',
            conditions: [{ type: 'ALLY_DIED_THIS_ROUND' }],
            actions: [{ type: 'PLAYER_DAMAGE', amount: 1 }],
            text: 'After Combat: if an allied Hero died this round, deal 1 damage to the enemy player.',
          }),
        ],
      },
      {
        rank: 3,
        name: 'Legion',
        summary: 'Gains +1 Power in combat while two or more Infernal Heroes are in play.',
        modifiers: [
          add({
            trigger: 'BEFORE_COMBAT',
            conditions: [{ type: 'ALLY_FACTION_COUNT_AT_LEAST', faction: 'infernal', count: 2 }],
            actions: [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'SELF' }],
            text: 'Before Combat: while two or more Infernal Heroes are in play, gain +1 Power this round.',
          }),
        ],
      },
    ],
  },
];

const BY_CARD = new Map(CARD_ASCENSIONS.map((d) => [d.cardId, d]));

export function getCardAscension(cardId: string): CardAscensionDef | undefined {
  return BY_CARD.get(cardId);
}

/** True when this card has an Ascension path in this build. Other cards show "Ascension coming later". */
export function supportsAscension(cardId: string): boolean {
  return BY_CARD.has(cardId);
}

export function maxRankFor(cardId: string): number {
  return BY_CARD.get(cardId)?.ranks.length ?? 0;
}
