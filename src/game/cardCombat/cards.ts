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

const RETURN_SPELL: CombatAction = { type: 'RETURN_TO_HAND', maxPower: Infinity, pick: 'RANDOM', cardType: 'spell' };

/** Bone Soldier's Graveyard bonus: +15 ATK per Graveyard card this round, up to +60 (four stacked thresholds, as the simulator measured it). */
function boneSoldierSteps(maxSteps: number): CombatAbility[] {
  return Array.from({ length: maxSteps }, (_, i) =>
    ability('BEFORE_COMBAT', [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'SELF' }], i === 0 ? `Before Combat: gain +15 ATK this round for each card in your Graveyard (up to +${maxSteps * 15}).` : '', {
      conditions: [{ type: 'GRAVEYARD_COUNT_AT_LEAST', count: i + 1 }],
    }),
  );
}

/** Shield, printed: "the first time this Unit would be destroyed, it survives instead" (once per Unit in play, read live). */
function printedShield(text: string, conditions?: ConditionDef[]): CombatAbility {
  return ability('PASSIVE', [{ type: 'GRANT_SHIELD', target: 'SELF' }], text, conditions ? { conditions } : {});
}

/** Every card whose card-combat definition differs from the live file. Later changes of the same card are already merged here. */
const OVERRIDES: CombatCard[] = [
  // Approved re-band: Power 7 Legendaries play at Power 6.
  rewrite('und-vharos', { power: 6 }),

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
  // Timing cleanup: the Shield it gained when played is printed (a Passive Shield).
  rewrite('kng-paladin', {
    boardText: 'Shield; Guard 3; lane win: Heal 45',
    abilities: [
      printedShield('This Unit has a Shield: the first time it would be destroyed, it survives instead.'),
      ability('BEFORE_COMBAT', [{ type: 'CHANGE_POWER', amount: 3, duration: 'UNTIL_ROUND_END', target: 'SELF' }], 'Guard 3: Before Combat, if this Unit would lose its lane, gain +45 ATK this round.', { conditions: [{ type: 'SELF_LOSING_LANE' }] }),
      ability('ON_ENEMY_DEATH', [{ type: 'PLAYER_HEAL', amount: 1 }], 'When the enemy Unit in this lane is destroyed, restore 45 HP to your player (once per round).', {
        oncePerRound: true,
        conditions: [{ type: 'DEATH_IN_SELF_LANE' }],
      }),
    ],
  }),
  rewrite('tok-ward', { boardText: 'Token', abilities: [] }),

  // Thread E: Commons get a lane holder; Kingdom's lasting swings come down a step.
  // Timing cleanup: Crypt Warden's Shield is printed, and works while the Graveyard holds 2+ cards (checked when it would be destroyed).
  rewrite('und-crypt-warden', {
    boardText: 'Guard 2; Shield w/ 2+ Grave',
    abilities: [guard(2), printedShield('While your Graveyard has 2 or more cards, this Unit has a Shield: the first time it would be destroyed, it survives instead.', [{ type: 'GRAVEYARD_COUNT_AT_LEAST', count: 2 }])],
  }),
  // Timing cleanup: an Attached Spell. It needs your Unit in its lane and leaves with that Unit.
  rewrite('spl-battle-banner', {
    boardText: 'Attached: +15 ATK',
    spellBinding: 'UNIT',
    abilities: [ability('CONTINUOUS', [{ type: 'CHANGE_POWER', amount: 1, duration: 'PERMANENT', target: 'ALLY_SAME_LANE' }], 'The Unit it is attached to has +15 ATK.')],
  }),
  rewrite('spl-war-cry', {
    abilities: [
      ability('CAST', [{ type: 'CHANGE_POWER', amount: 1, duration: 'UNTIL_ROUND_END', target: 'ALL_ALLIES' }], 'All allied Units gain +15 ATK this round.'),
      { ...live('spl-war-cry').abilities[1], trigger: 'CAST' },
    ],
  }),

  // ---- Timing cleanup (resolver v4): every On Play Unit effect, re-authored -------------------------------------
  // Royal Guard: the lasting +15 it gave adjacent allies when played becomes an aura (+15 while it is in play), and the lasting
  // part moves to when it falls: adjacent allies keep +15 for the rest of the battle. The aura alone left the Kingdom
  // Starter 8 points down (sim/after: Kingdom vs Undead 48% -> 21%).
  rewrite('kng-royal-guard', {
    boardText: 'Adjacent +15; Death: adj. +15; Spell Immune w/ally',
    abilities: [ability('PASSIVE', [{ type: 'CHANGE_POWER', amount: 1, duration: 'PERMANENT', target: 'ADJACENT_ALLIES' }], 'Adjacent allied Units have +15 ATK.'), ability('ON_DEATH', [{ type: 'CHANGE_POWER', amount: 1, duration: 'PERMANENT', target: 'ADJACENT_ALLIES' }], 'When Destroyed: adjacent allied Units gain +15 ATK for the rest of the battle.'), live('kng-royal-guard').abilities[1]],
  }),
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
  // Infernal Lord (approved re-band to Power 6): a one-round −30 on every other Unit (its own side's too) when played becomes
  // a dying curse, −15 ATK on every enemy Unit for the rest of the battle when it is destroyed, and its lane's enemy Continuous
  // Spell is destroyed before every clash. (An aura, −15 on every enemy or on the enemy here, measured too strong.)
  rewrite('inf-infernal-lord', {
    power: 6,
    boardText: 'Death: enemies −15; Destroy enemy Spell here',
    abilities: [
      ability('ON_DEATH', [{ type: 'CHANGE_POWER', amount: -1, duration: 'PERMANENT', target: 'ALL_ENEMIES' }], 'When Destroyed: every enemy Unit gets −15 ATK for the rest of the battle.'),
      ability('BEFORE_COMBAT', [{ type: 'DESTROY_SPELL_ZONE', target: 'ENEMY_SAME_LANE' }], 'Before Combat: destroy the enemy Continuous Spell in this lane.'),
    ],
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
  rewrite('spl-cursed-ground', { spellBinding: 'LANE' }),
  rewrite('spl-siege-fire', { spellBinding: 'LANE' }),
  rewrite('spl-grave-totem', { spellBinding: 'LANE' }),
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
