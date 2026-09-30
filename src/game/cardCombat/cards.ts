import type { AbilityDefinition, ActionDef, CardDefinition, ConditionDef, TargetScope, Trigger } from '../types/index.js';
import { getCard } from '../cards/index.js';

// Card data for the card-combat model: the live card definitions with ozi's approved balance-pass changes
// (docs/CARD-COMBAT-DESIGN.md section 14, project file moonwater/balance/final/card-changes.csv) applied.
//
// Only the card resolver reads these. The live card files in src/game/cards - and so every legacy mode - are
// untouched. A parity test (cardCombat.parity.test.ts) checks every override here against the simulator's
// approved 'final' balance variant, trigger by trigger and action by action.
//
// Effect amounts stay in the engine's own units, exactly as the simulator measured them:
//   - CHANGE_POWER / SET_POWER amounts are legacy Power steps; the resolver applies 15 ATK per step.
//   - PLAYER_DAMAGE / PLAYER_HEAL amounts are legacy HP points; the resolver applies 45 Player HP per point.
// Player-facing copy (cardText.ts) prints the converted numbers.

/** Card-combat-only primitive (balance pass Thread B, approved): the Unit deals no damage this round, in a clash or directly. */
export interface PacifyAction {
  type: 'PACIFY';
  target: TargetScope;
}

/**
 * Card-combat-only primitive (difference-damage pass): PASSIVE on a Unit. When this Unit loses a clash, its player
 * takes `amount` legacy Power steps (15 each) less Clash Damage. Read live at the clash, like GRANT_BYPASS.
 */
export interface ReduceClashDamageAction {
  type: 'REDUCE_CLASH_DAMAGE';
  amount: number;
  target: 'SELF';
}

/** Card-combat-only primitive (difference-damage pass): prevent up to `amount` legacy Power steps (15 each) of Clash Damage to your player this round. */
export interface ClashShieldAction {
  type: 'CLASH_SHIELD';
  amount: number;
}

export type CombatAction = ActionDef | PacifyAction | ReduceClashDamageAction | ClashShieldAction;

export interface CombatAbility extends Omit<AbilityDefinition, 'actions'> {
  actions: CombatAction[];
}

export interface CombatCard extends Omit<CardDefinition, 'abilities'> {
  abilities: CombatAbility[];
}

export function isPacify(action: CombatAction): action is PacifyAction {
  return action.type === 'PACIFY';
}

/** True for the card-combat-only primitives the live ActionDef union does not know. */
export function isCardOnlyAction(action: CombatAction): action is PacifyAction | ReduceClashDamageAction | ClashShieldAction {
  return action.type === 'PACIFY' || action.type === 'REDUCE_CLASH_DAMAGE' || action.type === 'CLASH_SHIELD';
}

const live = (id: string): CardDefinition => getCard(id);

function ability(trigger: Trigger, actions: CombatAction[], text: string, extra: { conditions?: ConditionDef[]; oncePerRound?: boolean } = {}): CombatAbility {
  return { trigger, ...(extra.conditions ? { conditions: extra.conditions } : {}), actions, text, ...(extra.oncePerRound ? { oncePerRound: true } : {}) };
}

function rewrite(id: string, patch: Partial<CombatCard>): CombatCard {
  return { ...live(id), ...patch } as CombatCard;
}

/** Guard N: "Before Combat: if this Unit would lose its lane, it gains +N x 15 ATK this round." */
export function guard(steps: number): CombatAbility {
  return ability('BEFORE_COMBAT', [{ type: 'CHANGE_POWER', amount: steps, duration: 'UNTIL_ROUND_END', target: 'SELF' }], `Guard ${steps}: Before Combat, if this Unit would lose its lane, gain +${steps * 15} ATK this round.`, {
    conditions: [{ type: 'SELF_LOSING_LANE' }],
  });
}

const RETURN_SPELL: CombatAction = { type: 'RETURN_TO_HAND', maxPower: Infinity, pick: 'RANDOM', cardType: 'spell' };

/** Bone Soldier's Graveyard bonus: +15 ATK per Graveyard card this round, up to +60 (four stacked thresholds, as the simulator measured it). */
function boneSoldierSteps(maxSteps: number): CombatAbility[] {
  return Array.from({ length: maxSteps }, (_, i) =>
    ability('BEFORE_COMBAT', [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'SELF' }], i === 0 ? `Before Combat: gain +15 ATK this round for each card in your Graveyard (up to +${maxSteps * 15}).` : '', {
      conditions: [{ type: 'GRAVEYARD_COUNT_AT_LEAST', count: i + 1 }],
    }),
  );
}

/** Every card whose card-combat definition differs from the live file. Later changes of the same card are already merged here. */
const OVERRIDES: CombatCard[] = [
  // Approved re-band: Power 7 Legendaries play at Power 6.
  rewrite('und-vharos', { power: 6 }),
  rewrite('inf-infernal-lord', { power: 6 }),

  // Thread A (Defensive): Guard replaces the uncapped growth lines.
  rewrite('und-dark-priest', {
    boardText: 'Guard 2; +30 w/3+ Grave',
    abilities: [guard(2), ability('BEFORE_COMBAT', [{ type: 'CHANGE_POWER', amount: 2, duration: 'UNTIL_ROUND_END', target: 'SELF' }], 'Before Combat: if your Graveyard holds 3 or more cards, gain +30 ATK this round.', { conditions: [{ type: 'GRAVEYARD_COUNT_AT_LEAST', count: 3 }] })],
  }),
  rewrite('und-grave-knight', {
    boardText: 'Guard 2; 1st/rnd: Heal 90',
    abilities: [guard(2), ability('ON_ENEMY_DEATH', [{ type: 'PLAYER_HEAL', amount: 2 }], 'The first time an enemy Unit dies each round, restore 90 HP to your player.', { oncePerRound: true })],
  }),

  // Thread B (Arcane Control): Stasis Field pacifies, Aegis Ward adds a Shield, Spell recursion for the mages.
  rewrite('spl-stasis-field', {
    boardText: 'No damage; −15 ATK',
    abilities: [
      ability('ON_PLAY', [{ type: 'PACIFY', target: 'ENEMY_SAME_LANE' }], 'The enemy Unit in this lane deals no damage this round.'),
      ability('ON_PLAY', [{ type: 'CHANGE_POWER', amount: -1, duration: 'PERMANENT', target: 'ENEMY_SAME_LANE' }], 'It gets −15 ATK for the rest of the battle.'),
    ],
  }),
  rewrite('spl-aegis-ward', {
    boardText: 'Ignore next dmg; ally Shield',
    abilities: [
      ability('ON_PLAY', [{ type: 'PREVENT_NEXT_DAMAGE', count: 1 }], 'The next damage your player would take this round, including Clash Damage, is prevented.'),
      ability('ON_PLAY', [{ type: 'GRANT_SHIELD', target: 'ALLY_SAME_LANE' }], 'Your Unit in this lane gains a Shield.'),
    ],
  }),
  rewrite('und-grave-sage', {
    boardText: 'Return a Spell; 2nd Spell: Shield',
    abilities: [
      ability('ON_PLAY', [RETURN_SPELL], 'On Play: return a random Spell from your Graveyard to your hand.'),
      ability('ON_ALLY_SPELL_PLAYED', [{ type: 'GRANT_SHIELD', target: 'ADJACENT_ALLIES' }], 'The second time you cast a Spell in a round, adjacent allied Units gain a Shield.', {
        oncePerRound: true,
        conditions: [{ type: 'SPELLS_PLAYED_THIS_ROUND_AT_LEAST', count: 2 }],
      }),
    ],
  }),
  rewrite('kng-apprentice-mage', {
    abilities: [
      ability('ON_ALLY_SPELL_PLAYED', [{ type: 'CHANGE_POWER', amount: 2, duration: 'UNTIL_ROUND_END', target: 'SELF' }], 'Whenever you cast a Spell, gain +30 ATK this round.'),
      ability('ON_DEATH', [RETURN_SPELL], 'When Destroyed: return a random Spell from your Graveyard to your hand.'),
    ],
  }),
  rewrite('kng-archmage-vael', {
    abilities: [
      ability('PASSIVE', [{ type: 'SPELL_ECHO' }], 'The first one-time Spell you cast each round resolves twice.'),
      ability('ON_ALLY_SPELL_PLAYED', [{ type: 'PLAYER_DAMAGE', amount: 2 }], 'The second time you cast a Spell in a round, deal 90 damage to the enemy player.', {
        oncePerRound: true,
        conditions: [{ type: 'SPELLS_PLAYED_THIS_ROUND_AT_LEAST', count: 2 }],
      }),
      ability('ROUND_END', [RETURN_SPELL], 'Round End: if your hand is empty, return a random Spell from your Graveyard to your hand.', { conditions: [{ type: 'HAND_SIZE_AT_MOST', count: 0 }] }),
    ],
  }),

  // Thread C (power audit): Battle Captain's aura reaches adjacent allies only.
  rewrite('kng-battle-captain', {
    abilities: [
      ability('BEFORE_COMBAT', [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'ADJACENT_ALLIES' }], 'Before Combat: adjacent allied Units gain +15 ATK this round.'),
      live('kng-battle-captain').abilities[1],
    ],
  }),

  // Thread D (outliers) with Thread E's tuning: capped growth, per-copy return, Paladin line 3, plain Ward.
  rewrite('und-bone-soldier', {
    boardText: 'Death: Return once; +15/Grave (max +60)',
    abilities: [ability('ON_DEATH', [{ type: 'RETURN_TO_DECK' }], 'On Death: return this card to your deck (once per copy).'), ...boneSoldierSteps(4)],
  }),
  rewrite('inf-blood-demon', {
    boardText: 'Ally dies: +15 (max +45); +30 rnd',
    abilities: [
      ability('ON_ALLY_DEATH', [{ type: 'CHANGE_POWER', amount: 1, duration: 'PERMANENT', target: 'SELF' }], 'When another allied Unit dies, gain +15 ATK (up to +45).'),
      ability('BEFORE_COMBAT', [{ type: 'CHANGE_POWER', amount: 2, duration: 'UNTIL_ROUND_END', target: 'SELF' }], 'Before Combat: if an allied Unit died this round, gain +30 ATK this round.', { conditions: [{ type: 'ALLY_DIED_THIS_ROUND' }] }),
    ],
  }),
  rewrite('kng-paladin', {
    boardText: 'Shield; Guard 3; lane win: Heal 45',
    abilities: [
      live('kng-paladin').abilities[0],
      ability('BEFORE_COMBAT', [{ type: 'CHANGE_POWER', amount: 3, duration: 'UNTIL_ROUND_END', target: 'SELF' }], 'Guard 3: Before Combat, if this Unit would lose its lane, gain +45 ATK this round.', { conditions: [{ type: 'SELF_LOSING_LANE' }] }),
      ability('ON_ENEMY_DEATH', [{ type: 'PLAYER_HEAL', amount: 1 }], 'When the enemy Unit in this lane is destroyed, restore 45 HP to your player (once per round).', {
        oncePerRound: true,
        conditions: [{ type: 'DEATH_IN_SELF_LANE' }],
      }),
    ],
  }),
  rewrite('tok-ward', { boardText: 'Token', abilities: [] }),

  // Thread E: Commons get a lane holder; Kingdom's lasting swings come down a step.
  rewrite('und-crypt-warden', {
    boardText: 'Guard 2; Shield if 2+ Grave',
    abilities: [guard(2), ...live('und-crypt-warden').abilities],
  }),
  rewrite('spl-battle-banner', {
    boardText: '+15 ATK while active',
    abilities: [ability('CONTINUOUS', [{ type: 'CHANGE_POWER', amount: 1, duration: 'PERMANENT', target: 'ALLY_SAME_LANE' }], 'Your Unit in this lane has +15 ATK.')],
  }),
  rewrite('spl-war-cry', {
    abilities: [ability('ON_PLAY', [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'ALL_ALLIES' }], 'All allied Units gain +15 ATK this round.'), live('spl-war-cry').abilities[1]],
  }),
];

const OVERRIDE_BY_ID = new Map(OVERRIDES.map((c) => [c.id, c]));

/** Ids the approved balance pass changed for the card model (for tests and the report). */
export const CARD_COMBAT_OVERRIDE_IDS: readonly string[] = OVERRIDES.map((c) => c.id);

/** The card as the card resolver plays it: the approved card-combat definition, or the live card when unchanged. */
export function getCombatCard(cardId: string): CombatCard {
  return OVERRIDE_BY_ID.get(cardId) ?? (live(cardId) as CombatCard);
}

/** True when the card-combat definition differs from the live (legacy) card. */
export function hasCombatOverride(cardId: string): boolean {
  return OVERRIDE_BY_ID.has(cardId);
}
