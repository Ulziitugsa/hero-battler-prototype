import type { CardPatchSet } from './overrides.js';
import { simAbility } from './simActions.js';
import type { SimDeck } from './decks.js';

// Thread B of the effect/archetype balance pass: Spell-heavy / control. Each patch set is one proposal so the
// runner can measure it alone and in combination. Player-HP numbers use the approved 45 HP per legacy point
// (hpUnit), so `amount: 3` below is 135 HP.

function expand(entries: [string, number][]): string[] {
  const list: string[] = [];
  for (const [cardId, count] of entries) for (let i = 0; i < count; i++) list.push(cardId);
  return list;
}

/**
 * Arcane Control rebuilt for the 8-Unit minimum (was 7 Units / 8 Spells). +1 Light Priest for the eighth Unit;
 * Ward Circle is out (tokens are Thread D's), one Aegis Ward becomes a Fireball so the deck has one permanent
 * answer to a big Unit even when its own lane is empty.
 */
export const ARCANE_CONTROL_V2 = expand([
  ['kng-apprentice-mage', 2],
  ['und-grave-sage', 2],
  ['kng-archmage-vael', 1],
  ['kng-royal-guard', 2],
  ['kng-light-priest', 1],
  ['spl-arcane-bolt', 2],
  ['spl-aegis-ward', 1],
  ['spl-stasis-field', 2],
  ['spl-fireball', 1],
  ['spl-weakness', 1],
]);

export const ARCANE_CONTROL_V2_DECK: SimDeck = { id: 'arch-mage', label: 'Arcane Control (8U/7S)', group: 'archetype', pilot: 'balanced', cards: ARCANE_CONTROL_V2 };

export const CONTROL_PATCH_SETS: Record<string, CardPatchSet> = {};

// --- Candidate patch sets (ablation) ---------------------------------------------------------------------

CONTROL_PATCH_SETS.stasisPacify = {
  'spl-stasis-field': {
    boardText: 'Enemy deals no damage',
    abilities: [simAbility({ trigger: 'ON_PLAY', actions: [{ type: 'PACIFY', target: 'ENEMY_SAME_LANE' }], text: 'The enemy Unit in this lane deals no damage this round: no clash and no direct hit.' })],
  },
};

CONTROL_PATCH_SETS.aegisShield3 = {
  'spl-aegis-ward': {
    boardText: 'Prevent 135 dmg this rd',
    abilities: [simAbility({ trigger: 'ON_PLAY', actions: [{ type: 'PLAYER_SHIELD', amount: 3 }], text: 'Prevent the next 135 damage your player would take this round.' })],
  },
};

CONTROL_PATCH_SETS.sageRecall = {
  'und-grave-sage': {
    boardText: 'Return a Spell; 2nd Spell: Shield',
    abilities: [
      simAbility({ trigger: 'ON_PLAY', actions: [{ type: 'RETURN_TO_HAND', maxPower: Infinity, pick: 'RANDOM', cardType: 'spell' }], text: 'On Play: return a random Spell from your Graveyard to your hand.' }),
      simAbility({ trigger: 'ON_ALLY_SPELL_PLAYED', oncePerRound: true, conditions: [{ type: 'SPELLS_PLAYED_THIS_ROUND_AT_LEAST', count: 2 }], actions: [{ type: 'GRANT_SHIELD', target: 'ADJACENT_ALLIES' }], text: 'The second time you cast a Spell in a round, adjacent allied Units gain a Shield.' }),
    ],
  },
};

CONTROL_PATCH_SETS.aegisUnitShield = {
  'spl-aegis-ward': {
    boardText: 'Ignore next dmg; ally Shield',
    abilities: [
      simAbility({ trigger: 'ON_PLAY', actions: [{ type: 'PREVENT_NEXT_DAMAGE', count: 1 }], text: 'The next damage your player would take this round is prevented.' }),
      simAbility({ trigger: 'ON_PLAY', actions: [{ type: 'GRANT_SHIELD', target: 'ALLY_SAME_LANE' }], text: 'Your Unit in this lane gains a Shield.' }),
    ],
  },
};

CONTROL_PATCH_SETS.stasisPacifyMark = {
  'spl-stasis-field': {
    boardText: 'No damage; -15 ATK',
    abilities: [
      simAbility({ trigger: 'ON_PLAY', actions: [{ type: 'PACIFY', target: 'ENEMY_SAME_LANE' }], text: 'The enemy Unit in this lane deals no damage this round.' }),
      simAbility({ trigger: 'ON_PLAY', actions: [{ type: 'CHANGE_POWER', amount: -1, duration: 'PERMANENT', target: 'ENEMY_SAME_LANE' }], text: 'It gets -15 ATK for the rest of the battle.' }),
    ],
  },
};

CONTROL_PATCH_SETS.vaelRecall = {
  'kng-archmage-vael': {
    abilities: [
      simAbility({ trigger: 'PASSIVE', actions: [{ type: 'SPELL_ECHO' }], text: 'The first one-time Spell you cast each round resolves twice.' }),
      simAbility({ trigger: 'ON_ALLY_SPELL_PLAYED', oncePerRound: true, conditions: [{ type: 'SPELLS_PLAYED_THIS_ROUND_AT_LEAST', count: 2 }], actions: [{ type: 'PLAYER_DAMAGE', amount: 2 }], text: 'The second time you cast a Spell in a round, deal 90 damage to the enemy player.' }),
      simAbility({ trigger: 'ROUND_END', conditions: [{ type: 'HAND_SIZE_AT_MOST', count: 0 }], actions: [{ type: 'RETURN_TO_HAND', maxPower: Infinity, pick: 'RANDOM', cardType: 'spell' }], text: 'Round End: if your hand is empty, return a random Spell from your Graveyard to your hand.' }),
    ],
  },
};

CONTROL_PATCH_SETS.apprenticeRecall = {
  'kng-apprentice-mage': {
    abilities: [
      simAbility({ trigger: 'ON_ALLY_SPELL_PLAYED', actions: [{ type: 'CHANGE_POWER', amount: 2, duration: 'UNTIL_ROUND_END', target: 'SELF' }], text: 'Whenever you cast a Spell, gain +30 ATK this round.' }),
      simAbility({ trigger: 'ON_DEATH', actions: [{ type: 'RETURN_TO_HAND', maxPower: Infinity, pick: 'RANDOM', cardType: 'spell' }], text: 'When Destroyed: return a random Spell from your Graveyard to your hand.' }),
    ],
  },
};

CONTROL_PATCH_SETS.bolt2plus2 = {
  'spl-arcane-bolt': {
    boardText: 'Dmg 90; 180 after a Spell',
    abilities: [
      simAbility({ trigger: 'ON_PLAY', actions: [{ type: 'PLAYER_DAMAGE', amount: 2 }], text: 'Deal 90 damage to the enemy player.' }),
      simAbility({ trigger: 'ON_PLAY', conditions: [{ type: 'SPELLS_PLAYED_THIS_ROUND_AT_LEAST', count: 1 }], actions: [{ type: 'PLAYER_DAMAGE', amount: 2 }], text: 'If you already cast a Spell this round, deal 90 more.' }),
    ],
  },
};

// --- The proposal ------------------------------------------------------------------------------------------

/** The recommended control package (Thread B): the patch sets that together make up the proposal. */
export const CONTROL_PROPOSAL_KEYS = ['stasisPacifyMark', 'aegisUnitShield', 'sageRecall', 'apprenticeRecall', 'vaelRecall'] as const;

export const CONTROL_PROPOSAL: CardPatchSet = Object.assign({}, ...CONTROL_PROPOSAL_KEYS.map((k) => CONTROL_PATCH_SETS[k]));
