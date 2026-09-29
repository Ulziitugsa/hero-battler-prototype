import type { CardDefinition } from '../../types/index.js';
import { getCard } from '../../cards/index.js';
import { reworkCard } from './powerAudit.js';

// Thread C (aggressive / high-rarity power audit) card proposals, as simulator overrides. Each candidate is
// a set of card definitions with the live ids, registered with cardSource.registerSimCards on top of the
// approved baseline. `THREAD_C_PACKAGE` is the recommended set; the others are the alternatives the
// report compares it with. Nothing here changes src/game/cards.

export interface Candidate {
  id: string;
  label: string;
  cards: () => CardDefinition[];
}

const hellhoundOnPlay = (): CardDefinition =>
  reworkCard('inf-hellhound', {
    replace: {
      0: {
        trigger: 'ON_PLAY',
        actions: [
          { type: 'SILENCE', target: 'ENEMY_SAME_LANE' },
          { type: 'CHANGE_POWER', amount: -2, duration: 'UNTIL_ROUND_END', target: 'ENEMY_SAME_LANE' },
        ],
        text: 'On Play: Silence the enemy Hero in this lane for the rest of the round; it loses 2 Power this round.',
      },
      1: null,
    },
  });

const hellhoundMinusOne = (): CardDefinition =>
  reworkCard('inf-hellhound', {
    replace: { 1: { trigger: 'BEFORE_COMBAT', actions: [{ type: 'CHANGE_POWER', amount: -1, duration: 'UNTIL_ROUND_END', target: 'ENEMY_SAME_LANE' }], text: 'Before Combat: the enemy Hero in this lane loses 1 Power this round.' } },
  });

const captainAdjacent = (): CardDefinition =>
  reworkCard('kng-battle-captain', {
    replace: { 0: { trigger: 'BEFORE_COMBAT', actions: [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'ADJACENT_ALLIES' }], text: 'Before Combat: adjacent allied Heroes gain +1 Power this round.' } },
  });

const captainPower4 = (): CardDefinition => ({ ...getCard('kng-battle-captain'), power: 4 });

const paladinPlusTwo = (): CardDefinition =>
  reworkCard('kng-paladin', {
    replace: {
      1: { trigger: 'BEFORE_COMBAT', conditions: [{ type: 'SELF_LOSING_LANE' }], actions: [{ type: 'CHANGE_POWER', amount: 2, duration: 'UNTIL_ROUND_END', target: 'SELF' }], text: 'Before Combat: if this Hero would lose its lane, gain +2 Power this round.' },
    },
  });

const alphaBurnOne = (): CardDefinition =>
  reworkCard('inf-alpha-hound', {
    replace: { 1: { trigger: 'BEFORE_COMBAT', conditions: [{ type: 'ALLY_HERO_COUNT_AT_LEAST', count: 3 }], actions: [{ type: 'PLAYER_DAMAGE', amount: 1 }], text: 'Before Combat: if you control 3 Heroes, deal 1 damage to the enemy player.' } },
  });

const alphaOtherBeasts = (): CardDefinition =>
  reworkCard('inf-alpha-hound', {
    replace: {
      0: { trigger: 'BEFORE_COMBAT', actions: [{ type: 'CHANGE_POWER_BY_COUNT', basis: 'OTHER_ALLY_TAG_COUNT', tag: 'Beast', perCount: 1, duration: 'UNTIL_ROUND_END', target: 'SELF' }], text: 'Before Combat: gain +1 Power this round for each other allied Beast.' },
    },
  });

const captainOnPlay = (): CardDefinition =>
  reworkCard('kng-battle-captain', {
    replace: { 0: { trigger: 'ON_PLAY', actions: [{ type: 'CHANGE_POWER', amount: 2, duration: 'UNTIL_ROUND_END', target: 'ALL_ALLIES' }], text: 'On Play: all allied Heroes gain +2 Power this round.' } },
  });

const captainKnights = (): CardDefinition =>
  reworkCard('kng-battle-captain', {
    replace: { 0: { trigger: 'BEFORE_COMBAT', actions: [{ type: 'CHANGE_POWER_BY_COUNT', basis: 'OTHER_ALLY_TAG_COUNT', tag: 'Knight', perCount: 1, duration: 'UNTIL_ROUND_END', target: 'SELF' }], text: 'Before Combat: gain +1 Power this round for each other allied Knight.' } },
  });

const paladinPower4 = (): CardDefinition => ({ ...getCard('kng-paladin'), power: 4 });

const paladinPlusThree = (): CardDefinition =>
  reworkCard('kng-paladin', {
    replace: {
      1: { trigger: 'BEFORE_COMBAT', conditions: [{ type: 'SELF_LOSING_LANE' }], actions: [{ type: 'CHANGE_POWER', amount: 3, duration: 'UNTIL_ROUND_END', target: 'SELF' }], text: 'Before Combat: if this Hero would lose its lane, gain +3 Power this round.' },
    },
  });

const hellhoundNoSilence = (): CardDefinition => reworkCard('inf-hellhound', { replace: { 0: null } });
const hellhoundPower4 = (): CardDefinition => ({ ...getCard('inf-hellhound'), power: 4 });

/** Sensitivity only (Thread D owns these cards): Blood Demon and Bone Soldier with no growth at all. */
export const D_GROWTH_OFF: Candidate = {
  id: 'sensitivity-d-growth-off',
  label: 'Sensitivity: Blood Demon and Bone Soldier without growth (Thread D cards)',
  cards: () => [reworkCard('inf-blood-demon', { abilities: [] }), reworkCard('und-bone-soldier', { abilities: [] })],
};

const royalGuardThisRound = (): CardDefinition =>
  reworkCard('kng-royal-guard', {
    replace: { 0: { trigger: 'ON_PLAY', actions: [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'ADJACENT_ALLIES' }], text: 'On Play: adjacent allied Heroes gain +1 Power this round.' } },
  });
const royalGuardPower4 = (): CardDefinition => ({ ...getCard('kng-royal-guard'), power: 4 });

const ONE: Record<string, () => CardDefinition> = {
  'hellhound-onplay': hellhoundOnPlay,
  'hellhound-minus1': hellhoundMinusOne,
  'captain-adjacent': captainAdjacent,
  'captain-p4': captainPower4,
  'paladin-plus2': paladinPlusTwo,
  'alpha-burn1': alphaBurnOne,
  'alpha-beasts': alphaOtherBeasts,
  'captain-onplay': captainOnPlay,
  'captain-knights': captainKnights,
  'paladin-p4': paladinPower4,
  'paladin-plus3': paladinPlusThree,
  'hellhound-nosilence': hellhoundNoSilence,
  'hellhound-p4': hellhoundPower4,
  'royal-guard-this-round': royalGuardThisRound,
  'royal-guard-p4': royalGuardPower4,
};

/** Every single-card candidate on its own, for the per-change comparison. */
export const SINGLE_CANDIDATES: Candidate[] = Object.entries(ONE).map(([id, make]) => ({ id, label: id, cards: () => [make()] }));

const oneShot = (cardId: string, amount: number, target: 'ALLY_SAME_LANE' | 'ALL_ALLIES' | 'ENEMY_SAME_LANE', text: string): CardDefinition =>
  reworkCard(cardId, { replace: { 0: { trigger: 'ON_PLAY', actions: [{ type: 'CHANGE_POWER', amount, duration: 'UNTIL_ROUND_END', target }], text } } });

/** Sensitivity only (Thread B owns Spells): every ATK-swing Spell one Power step smaller. */
export const B_SWING_SPELLS: Candidate = {
  id: 'sensitivity-b-swing-spells',
  label: 'Sensitivity: ATK-swing Spells one step smaller (Thread B cards)',
  cards: () => [
    oneShot('spl-power-surge', 2, 'ALLY_SAME_LANE', 'Your Hero in this lane gains +2 Power this round.'),
    oneShot('spl-weakness', -2, 'ENEMY_SAME_LANE', 'The enemy Hero in this lane loses 2 Power this round.'),
    reworkCard('spl-war-cry', { replace: { 0: { trigger: 'ON_PLAY', actions: [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'ALL_ALLIES' }], text: 'All allied Heroes gain +1 Power this round.' } } }),
    reworkCard('spl-battle-banner', { replace: { 0: { trigger: 'CONTINUOUS', actions: [{ type: 'CHANGE_POWER', amount: 1, duration: 'PERMANENT', target: 'ALLY_SAME_LANE' }], text: 'Your Hero in this lane has +1 Power.' } } }),
  ],
};

/**
 * Recommended Thread C change: Battle Captain's every-round aura goes from all allies (itself included) to
 * adjacent allies. It is the one high-rarity lever that still leads the field once Thread D caps growth
 * (see the d-off sensitivity). The other single-card candidates are kept above as the compared alternatives.
 */
export const THREAD_C_PACKAGE: Candidate = {
  id: 'thread-c',
  label: 'Thread C: Battle Captain adjacent aura',
  cards: () => [captainAdjacent()],
};

const combine = (id: string, label: string, parts: Candidate[]): Candidate => ({ id, label, cards: () => parts.flatMap((p) => p.cards()) });

/** Packages the report compares: Thread C alone, and with the sensitivity stand-ins for Thread B's and D's cards. */
export const PACKAGES: Candidate[] = [
  THREAD_C_PACKAGE,
  combine('thread-c+d-growth-off', 'Thread C + D growth off', [THREAD_C_PACKAGE, D_GROWTH_OFF]),
  combine('thread-c+b-swing', 'Thread C + B swing Spells', [THREAD_C_PACKAGE, B_SWING_SPELLS]),
  combine('thread-c+b+d', 'Thread C + B swing Spells + D growth off', [THREAD_C_PACKAGE, B_SWING_SPELLS, D_GROWTH_OFF]),
];
