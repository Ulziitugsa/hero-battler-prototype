import type { AbilityDefinition, ActionDef, CardDefinition, ConditionDef, TargetScope, Trigger } from '../types/index.js';
import { ALL_CARDS, getCard } from '../cards/index.js';

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
//
// Timing cleanup (resolver v4, docs/CARD-COMBAT-DESIGN.md section 18): card combat has no On Play timing. Every Unit
// effect is Passive, Round Start, Round End, Clash (Before Combat), Destroyed or a reaction (Your Spell, Ally Falls, ...);
// a one-time Spell's effect is CAST, resolved once when it is cast. Every Continuous Spell names what it belongs to
// (`spellBinding`): its Unit (an Attached Spell, which leaves with that Unit) or its lane.

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

/** A CHANGE_POWER of `steps` x 15 ATK. */
function pw(steps: number, duration: 'UNTIL_ROUND_END' | 'PERMANENT' = 'UNTIL_ROUND_END', target: TargetScope = 'SELF'): CombatAction {
  return { type: 'CHANGE_POWER', amount: steps, duration, target };
}

const RETURN_SPELL: CombatAction = { type: 'RETURN_TO_HAND', maxPower: Infinity, pick: 'RANDOM', cardType: 'spell' };

/** Shield, printed: "the first time this Unit would be destroyed, it survives instead" (once per Unit in play, read live). */
function printedShield(text: string, conditions?: ConditionDef[]): CombatAbility {
  return ability('PASSIVE', [{ type: 'GRANT_SHIELD', target: 'SELF' }], text, conditions ? { conditions } : {});
}

/** Every card whose card-combat definition differs from the live file. Later changes of the same card are already merged here. */
const OVERRIDES: CombatCard[] = [
  // Thread B (Arcane Control): Stasis Field pacifies, Aegis Ward adds a Shield, Spell recursion for the mages.
  rewrite('spl-stasis-field', {
    boardText: 'No damage; −15 ATK',
    abilities: [
      ability('CAST', [{ type: 'PACIFY', target: 'ENEMY_SAME_LANE' }], 'The enemy Unit in this lane deals no damage this round.'),
      ability('CAST', [{ type: 'CHANGE_POWER', amount: -1, duration: 'PERMANENT', target: 'ENEMY_SAME_LANE' }], 'It gets −15 ATK for the rest of the battle.'),
    ],
  }),
  rewrite('spl-aegis-ward', {
    boardText: 'Ignore next dmg; ally Shield',
    abilities: [
      ability('CAST', [{ type: 'PREVENT_NEXT_DAMAGE', count: 1 }], 'The next damage your player would take this round, including Clash Damage, is prevented.'),
      ability('CAST', [{ type: 'GRANT_SHIELD', target: 'ALLY_SAME_LANE' }], 'Your Unit in this lane gains a Shield.'),
    ],
  }),
  // Timing cleanup: the Spell it returned when played now comes back when it is destroyed (as Apprentice Mage's does).
  rewrite('und-grave-sage', {
    boardText: 'Death: return a Spell; 2nd Spell: Shield',
    abilities: [
      ability('ON_DEATH', [RETURN_SPELL], 'When Destroyed: return a random Spell from your Graveyard to your hand.'),
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
  rewrite('inf-blood-demon', {
    boardText: 'Ally dies: +15 (max +45); +30 rnd',
    abilities: [
      ability('ON_ALLY_DEATH', [{ type: 'CHANGE_POWER', amount: 1, duration: 'PERMANENT', target: 'SELF' }], 'When another allied Unit dies, gain +15 ATK (up to +45).'),
      ability('BEFORE_COMBAT', [{ type: 'CHANGE_POWER', amount: 2, duration: 'UNTIL_ROUND_END', target: 'SELF' }], 'Before Combat: if an allied Unit died this round, gain +30 ATK this round.', { conditions: [{ type: 'ALLY_DIED_THIS_ROUND' }] }),
    ],
  }),
  rewrite('tok-ward', { boardText: 'Token', abilities: [] }),

  // Timing cleanup: an Attached Spell. It needs your Unit in its lane and leaves with that Unit.
  rewrite('spl-battle-banner', {
    boardText: 'Attached: +15 ATK',
    spellBinding: 'UNIT',
    abilities: [ability('CONTINUOUS', [{ type: 'CHANGE_POWER', amount: 1, duration: 'PERMANENT', target: 'ALLY_SAME_LANE' }], 'The Unit it is attached to has +15 ATK.')],
  }),

  // ---- Timing cleanup (resolver v4): every On Play Unit effect, re-authored -------------------------------------
  // Light Priest: one 135 HP heal when played becomes 45 HP at every Round End it is in play; its Shield is printed.
  rewrite('kng-light-priest', {
    boardText: 'Shield; Round End: Heal 45; Spell: +15',
    abilities: [
      printedShield('This Unit has a Shield: the first time it would be destroyed, it survives instead.'),
      ability('ROUND_END', [{ type: 'PLAYER_HEAL', amount: 1 }], 'Round End: restore 45 HP to your player.'),
      live('kng-light-priest').abilities[2],
    ],
  }),
  // Forest Wolf: the lasting +30 it gained when played into an open lane is now +30 ATK while no enemy Unit is in its lane.
  rewrite('wld-forest-wolf', {
    boardText: '+30 while lane empty',
    abilities: [ability('PASSIVE', [{ type: 'CHANGE_POWER', amount: 2, duration: 'PERMANENT', target: 'SELF' }], 'While the enemy has no Unit in this lane, this Unit has +30 ATK.', { conditions: [{ type: 'LANE_EMPTY_ENEMY_SIDE' }] })],
  }),
  // Mira: the Undead she returned when played comes back when she is destroyed (never Mira herself).
  rewrite('und-mira', {
    boardText: 'Death: return weakest Undead; Immune w/3+',
    abilities: [
      ability('ON_DEATH', [{ type: 'RETURN_TO_HAND', maxPower: Infinity, pick: 'LOWEST_POWER', faction: 'undead', excludeSelf: true }], 'When Destroyed: return your weakest other Undead Unit from your Graveyard to your hand.'),
      live('und-mira').abilities[1],
    ],
  }),
  // Hellhound: the one-round Silence it cast when played is retired. Every lasting form of it (a Passive, or every Clash)
  // switched the Unit facing it off for good, Shields, Guard and death effects included (sim/after: Undead vs Infernal
  // 38% -> 0%, Infernal Starter 90%). Its Clash −30 ATK on the enemy here stays as it was.
  rewrite('inf-hellhound', {
    boardText: 'Clash: enemy here −30 rnd',
    abilities: [live('inf-hellhound').abilities[1]],
  }),
  // Runebreaker: the enemy Continuous Spell it destroyed when played is now destroyed before every clash in its lane.
  rewrite('inf-runebreaker', {
    abilities: [ability('BEFORE_COMBAT', [{ type: 'DESTROY_SPELL_ZONE', target: 'ENEMY_SAME_LANE' }], 'Before Combat: destroy the enemy Continuous Spell in this lane.'), live('inf-runebreaker').abilities[1], live('inf-runebreaker').abilities[2]],
  }),
  // ---- Spell lifetime (resolver v4): what every Continuous Spell belongs to -------------------------------------------
  // Fortify is an Attached Spell: it fortifies one Unit and leaves with it. Its lane condition went (it always has its Unit);
  // +15 per Round End is unchanged (+30 measured too strong in Trickster).
  rewrite('spl-fortify', {
    boardText: 'Attached: Round End +15',
    spellBinding: 'UNIT',
    abilities: [ability('ROUND_END', [{ type: 'CHANGE_POWER', amount: 1, duration: 'PERMANENT', target: 'ALLY_SAME_LANE' }], 'Round End: the Unit it is attached to gains +15 ATK.')],
  }),
  rewrite('spl-growth-totem', { spellBinding: 'LANE' }),
  rewrite('spl-burning-ground', { spellBinding: 'LANE' }),

  // ---- Launch set (116 cards; project files moonwater/card-set-120, FINAL-PASS.md over SECOND-PASS.md over REPORT.md) --
  // The existing cards the launch roster changed. Each replaces the card's earlier card-combat definition outright (the
  // superseded balance-pass and timing-cleanup versions of these cards are in git history). Printed ATK moves through the
  // roster (launchRoster.ts): Paladin 110, Hellhound 108, Flame Imp 84, Battle Captain 102, Apprentice Mage 102.
  rewrite('kng-archer', {
    boardText: 'Clash +15; +15 w/ Spell here',
    abilities: [
      ability('BEFORE_COMBAT', [pw(1)], 'Before Combat: gain +15 ATK this round.'),
      ability('BEFORE_COMBAT', [pw(1)], 'Before Combat: if your Continuous Spell is in this lane, gain +15 ATK more this round.', { conditions: [{ type: 'SELF_LANE_HAS_SPELL' }] }),
    ],
  }),
  rewrite('kng-royal-guard', {
    boardText: 'Adjacent allies +15',
    abilities: [ability('PASSIVE', [pw(1, 'PERMANENT', 'ADJACENT_ALLIES')], 'Adjacent allied Units have +15 ATK.')],
  }),
  // Dawnshield Paladin (redesign): Guard 3 on itself becomes +15 for each adjacent ally that would lose its lane.
  rewrite('kng-paladin', {
    boardText: 'Shield; shore up; Heal 45',
    abilities: [
      printedShield('This Unit has a Shield: the first time it would be destroyed, it survives instead.'),
      ability('BEFORE_COMBAT', [pw(1, 'UNTIL_ROUND_END', 'ADJACENT_ALLIES_LOSING')], 'Before Combat: each adjacent allied Unit that would lose its lane gains +15 ATK this round.'),
      ability('ON_ENEMY_DEATH', [{ type: 'PLAYER_HEAL', amount: 1 }], 'When the enemy Unit in this lane is destroyed, restore 45 HP to your player (once per round).', {
        oncePerRound: true,
        conditions: [{ type: 'DEATH_IN_SELF_LANE' }],
      }),
    ],
  }),
  rewrite('spl-dispel', {
    boardText: 'Destroy enemy Spell; draw',
    abilities: [
      ability('CAST', [{ type: 'DESTROY_SPELL_ZONE', target: 'ENEMY_SAME_LANE' }], 'Destroy the enemy Continuous Spell in this lane.'),
      ability('CAST', [{ type: 'DRAW_CARDS', count: 1 }], 'If it did, draw a card.', { conditions: [{ type: 'CONTINUOUS_SPELL_DESTROYED_THIS_ROUND', side: 'ENEMY' }] }),
    ],
  }),
  // Bone Soldier (approved fix): counts Units only, up to +45, and keeps its one-time return.
  rewrite('und-bone-soldier', {
    boardText: 'Return once; +15/Grave Unit',
    abilities: [
      ability('ON_DEATH', [{ type: 'RETURN_TO_DECK' }], 'When Destroyed: return this card to your deck (once per copy).'),
      ability('BEFORE_COMBAT', [{ type: 'CHANGE_POWER_BY_COUNT', basis: 'GRAVEYARD_UNIT_COUNT', perCount: 1, max: 3, duration: 'UNTIL_ROUND_END', target: 'SELF' }], 'Before Combat: gain +15 ATK this round for each Unit in your Graveyard (up to +45).'),
    ],
  }),
  rewrite('und-crypt-warden', {
    boardText: 'Guard 1; Shield w/ 2+ Grave',
    abilities: [guard(1), printedShield('While your Graveyard has 2 or more cards, this Unit has a Shield: the first time it would be destroyed, it survives instead.', [{ type: 'GRAVEYARD_COUNT_AT_LEAST', count: 2 }])],
  }),
  rewrite('und-dark-priest', {
    boardText: 'Guard 2; +15 w/3+ Grave',
    abilities: [guard(2), ability('BEFORE_COMBAT', [pw(1)], 'Before Combat: if your Graveyard holds 3 or more cards, gain +15 ATK this round.', { conditions: [{ type: 'GRAVEYARD_COUNT_AT_LEAST', count: 3 }] })],
  }),
  rewrite('und-vharos', {
    power: 6,
    boardText: 'Revive at 95; return strongest',
    abilities: [
      ability('ON_DEATH', [{ type: 'REVIVE_SELF', power: 4 }], 'When Destroyed: revive here with 95 ATK (once).'),
      ability('ON_DEATH', [{ type: 'RETURN_TO_HAND', maxPower: Infinity, pick: 'HIGHEST_POWER', faction: 'undead', excludeSelf: true }], 'When Destroyed: return your strongest other Undead Unit from your Graveyard to your hand.'),
    ],
  }),
  rewrite('spl-raise-fallen', {
    boardText: 'Revive weakest Undead here',
    abilities: [
      ability('CAST', [{ type: 'REVIVE_TO_LANE', maxPower: Infinity, pick: 'LOWEST_POWER', faction: 'undead' }], 'If your Graveyard has 2 or more Undead cards, revive your weakest Undead Unit in this lane.', {
        conditions: [{ type: 'GRAVEYARD_FACTION_COUNT_AT_LEAST', faction: 'undead', count: 2 }],
      }),
    ],
  }),
  rewrite('und-grave-knight', {
    boardText: 'Guard 2; 1st/rnd: Heal 45',
    abilities: [guard(2), ability('ON_ENEMY_DEATH', [{ type: 'PLAYER_HEAL', amount: 1 }], 'The first time an enemy Unit dies each round, restore 45 HP to your player.', { oncePerRound: true })],
  }),
  // Infernal Lord (redesign, Power 6): burns at Round End in a round you cast a Spell (the Hellfire gate, 2026-10-09: it was
  // as strong in every other deck as in Hellfire) and curses every enemy Unit when it falls.
  rewrite('inf-infernal-lord', {
    power: 6,
    boardText: 'Spell: Round End 45; Death −30',
    abilities: [
      ability('ROUND_END', [{ type: 'PLAYER_DAMAGE', amount: 1 }], 'Round End: if you cast a Spell this round, deal 45 damage to the enemy player.', {
        conditions: [{ type: 'SPELL_PLAYED_THIS_ROUND' }],
      }),
      ability('ON_DEATH', [pw(-2, 'PERMANENT', 'ALL_ENEMIES')], 'When Destroyed: every enemy Unit gets −30 ATK for the rest of the battle.'),
    ],
  }),
  rewrite('inf-alpha-hound', {
    boardText: '+15 per other Unit',
    abilities: [ability('BEFORE_COMBAT', [{ type: 'CHANGE_POWER_BY_COUNT', basis: 'ALLY_HERO_COUNT', perCount: 1, duration: 'UNTIL_ROUND_END', target: 'SELF' }, pw(-1)], 'Before Combat: gain +15 ATK this round for each other Unit you control.')],
  }),
  rewrite('spl-war-cry', {
    boardText: 'Allies +15; +15 w/ 3 Units',
    abilities: [
      ability('CAST', [pw(1, 'UNTIL_ROUND_END', 'ALL_ALLIES')], 'All allied Units gain +15 ATK this round.'),
      ability('CAST', [pw(1, 'UNTIL_ROUND_END', 'ALL_ALLIES')], 'If you control 3 Units, they gain +15 ATK more this round.', { conditions: [{ type: 'ALLY_HERO_COUNT_AT_LEAST', count: 3 }] }),
    ],
  }),
  // Grave Totem (FINAL): +30 to your Unit here when the enemy cast a Spell this round or has one in play; the first ally lost
  // here returns to hand once per battle (per physical Totem: a recast copy is a new Spell zone).
  rewrite('spl-grave-totem', {
    spellBinding: 'LANE',
    boardText: 'Vs Spells +30; return once',
    abilities: [
      ability('BEFORE_COMBAT', [pw(2, 'UNTIL_ROUND_END', 'ALLY_SAME_LANE')], 'Before Combat: if the enemy cast a Spell this round or has a Spell in play, your Unit in this lane gains +30 ATK this round.', {
        conditions: [{ type: 'ENEMY_SPELL_ACTIVE' }],
      }),
      ability('ON_ALLY_DEATH', [{ type: 'RETURN_DEATH_SOURCE_TO_HAND' }], 'The first allied Unit destroyed in this lane returns to your hand (once per battle).', {
        conditions: [{ type: 'DEATH_IN_SELF_LANE' }, { type: 'SPELL_ZONE_NOT_USED_THIS_BATTLE' }],
      }),
    ],
  }),
  rewrite('spl-cursed-ground', {
    spellBinding: 'LANE',
    boardText: 'Ally here +15; enemy dies: +15',
    abilities: [ability('CONTINUOUS', [pw(1, 'PERMANENT', 'ALLY_SAME_LANE')], 'Your Unit in this lane has +15 ATK.'), live('spl-cursed-ground').abilities[0]],
  }),
  rewrite('spl-siege-fire', {
    spellBinding: 'LANE',
    abilities: [ability('ROUND_END', [{ type: 'PLAYER_DAMAGE', amount: 1 }], 'Round End: if the enemy has no Unit in this lane, deal 45 damage to the enemy player.', { conditions: [{ type: 'LANE_EMPTY_ENEMY_SIDE' }] })],
  }),
  rewrite('spl-blood-pact', {
    boardText: 'Destroy yours, then theirs',
    abilities: [
      ability('CAST', [{ type: 'DESTROY', target: 'ALLY_SAME_LANE' }], 'Destroy your Unit in this lane, then destroy the enemy Unit in this lane.'),
      ability('CAST', [{ type: 'DESTROY', target: 'ENEMY_SAME_LANE' }], ''),
    ],
  }),
  rewrite('spl-soul-burn', {
    boardText: 'Exile 2 enemy Grave; deal 45',
    abilities: [
      ability('CAST', [{ type: 'EXILE_FROM_GRAVEYARD', pick: 'HIGHEST_POWER' }, { type: 'EXILE_FROM_GRAVEYARD', pick: 'HIGHEST_POWER' }], 'Exile the 2 strongest Units in the enemy Graveyard.'),
      ability('CAST', [{ type: 'PLAYER_DAMAGE', amount: 1 }], 'Deal 45 damage to the enemy player.'),
    ],
  }),
  rewrite('spl-death-wave', {
    boardText: 'All enemies −30 this round',
    abilities: [ability('CAST', [pw(-2, 'UNTIL_ROUND_END', 'ALL_ENEMIES')], 'Every enemy Unit gets −30 ATK this round.')],
  }),
];

/**
 * A one-time Spell's effect is CAST: it resolves once, when the Spell is cast (card combat has no On Play timing). The live
 * files keep ON_PLAY for the legacy resolver; every one-time Spell without an override is converted here, as data.
 */
function castSpell(card: CardDefinition): CombatCard {
  return { ...card, abilities: card.abilities.map((a) => (a.trigger === 'ON_PLAY' ? { ...a, trigger: 'CAST' as const } : a)) } as CombatCard;
}

for (const card of ALL_CARDS) {
  if (card.type !== 'spell' || card.spellKind !== 'ONE_TIME' || OVERRIDES.some((c) => c.id === card.id)) continue;
  OVERRIDES.push(castSpell(card));
}

const OVERRIDE_BY_ID = new Map(OVERRIDES.map((c) => [c.id, c]));

/**
 * Cards whose card-combat rules the timing cleanup (resolver v4) re-authored: every former On Play Unit effect, and the
 * Continuous Spells that became Attached Spells. (One-time Spells only renamed ON_PLAY to CAST, and the lane-bound
 * Continuous Spells only gained `spellBinding: 'LANE'`; neither plays differently.) For tests and the report.
 */
export const TIMING_CLEANUP_IDS: readonly string[] = [
  'kng-royal-guard',
  'kng-light-priest',
  'kng-paladin',
  'wld-forest-wolf',
  'und-mira',
  'und-grave-sage',
  'und-crypt-warden',
  'inf-hellhound',
  'inf-runebreaker',
  'inf-infernal-lord',
  'spl-battle-banner',
  'spl-fortify',
];

/** The existing cards the launch set changed (rules, ATK or both; the new launch cards are in cards/launchCards.ts). */
export const LAUNCH_CHANGED_IDS: readonly string[] = [
  'kng-archer',
  'kng-royal-guard',
  'kng-paladin',
  'spl-dispel',
  'und-bone-soldier',
  'und-crypt-warden',
  'und-dark-priest',
  'und-vharos',
  'spl-raise-fallen',
  'und-grave-knight',
  'inf-infernal-lord',
  'inf-alpha-hound',
  'spl-war-cry',
  'spl-grave-totem',
  'spl-cursed-ground',
  'spl-siege-fire',
  'spl-blood-pact',
  'spl-soul-burn',
  'spl-death-wave',
  'inf-hellhound',
  'inf-flame-imp',
  'kng-battle-captain',
  'kng-apprentice-mage',
];

/** Ids whose card-combat definition differs from the live file (the balance pass, the timing cleanup and Spell lifetime; for tests and the report). */
export const CARD_COMBAT_OVERRIDE_IDS: readonly string[] = OVERRIDES.map((c) => c.id);

/** The card as the card resolver plays it: the approved card-combat definition, or the live card when unchanged. */
export function getCombatCard(cardId: string): CombatCard {
  return OVERRIDE_BY_ID.get(cardId) ?? (live(cardId) as CombatCard);
}

/** True when the card-combat definition differs from the live (legacy) card. */
export function hasCombatOverride(cardId: string): boolean {
  return OVERRIDE_BY_ID.has(cardId);
}

/** What a Continuous Spell belongs to in card combat ('UNIT': an Attached Spell; 'LANE'). Null for one-time Spells and Units. */
export function spellBinding(cardId: string): 'UNIT' | 'LANE' | null {
  const card = getCombatCard(cardId);
  return card.type === 'spell' && card.spellKind === 'CONTINUOUS' ? (card.spellBinding ?? 'LANE') : null;
}

/** True for an Attached Spell: it needs your Unit in its lane to be cast and leaves play with that Unit. */
export function isAttachedSpell(cardId: string): boolean {
  return spellBinding(cardId) === 'UNIT';
}
