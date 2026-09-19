// Shared types for the prototype engine.
// Internal names are plain English on purpose - there is no separate "lore" vocabulary layer.
//
// Core UX principle for this revision: placement IS targeting. A card's ability declares a
// TargetScope, and the engine resolves it automatically from where the card was placed - the
// player never picks a target manually for a normal card.

export type Faction = 'infernal' | 'undead' | 'kingdom' | 'wildborn';
export type CardType = 'hero' | 'spell';
/** ONE_TIME: resolves once, then goes to the Graveyard, freeing its slot. CONTINUOUS: stays in its Spell slot, occupying it, until removed. */
export type SpellKind = 'ONE_TIME' | 'CONTINUOUS';
export type LaneId = 'left' | 'center' | 'right';
export type Side = 'player' | 'enemy';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const LANES: LaneId[] = ['left', 'center', 'right'];

export function adjacentLanes(lane: LaneId): LaneId[] {
  if (lane === 'left') return ['center'];
  if (lane === 'right') return ['center'];
  return ['left', 'right'];
}

export type Trigger =
  | 'ON_PLAY'
  | 'ROUND_START'
  | 'BEFORE_COMBAT'
  | 'AFTER_COMBAT'
  | 'ON_DEATH'
  | 'ON_ALLY_DEATH'
  | 'ON_ENEMY_DEATH'
  | 'ON_DIRECT_DAMAGE'
  | 'ROUND_END'
  /** Dispatched to every living Hero on the board right after ANY Spell (one-time or Continuous, either side's) resolves - `ON_ALLY_SPELL_PLAYED` to the caster's own side's Heroes, `ON_ENEMY_SPELL_PLAYED` to the opponent's. Lets a Hero react to its own side playing a Spell ("Whenever you play a Spell, gain +1 Power this round") without a manual reaction window. */
  | 'ON_ALLY_SPELL_PLAYED'
  | 'ON_ENEMY_SPELL_PLAYED'
  /**
   * A passive Continuous Spell modifier - e.g. Battle Banner's "+2 while active". This is NEVER
   * dispatched like the other triggers (nothing calls dispatch*(..., 'CONTINUOUS')); instead
   * `effectivePower()` reads CONTINUOUS-trigger abilities live, every time Power is needed, so the
   * bonus vanishes the instant the Spell is removed rather than needing to be un-applied.
   */
  | 'CONTINUOUS'
  /**
   * A passive Hero modifier - immunity (GRANT_IMMUNITY) and overflow-damage reduction
   * (REDUCE_OVERFLOW_DAMAGE) only. NEVER dispatched: read live, condition-and-all, at the moment a
   * hostile effect resolves its targets or overflow damage is about to be dealt - exactly the same
   * "live, never baked in" pattern CONTINUOUS uses for Spells, just scoped to Heroes.
   */
  | 'PASSIVE';

// Human-readable labels for the debug log / trigger banner.
export const TRIGGER_LABEL: Record<Trigger, string> = {
  ON_PLAY: 'On Play',
  ROUND_START: 'Round Start',
  BEFORE_COMBAT: 'Before Combat',
  AFTER_COMBAT: 'After Combat',
  ON_DEATH: 'On Death',
  ON_ALLY_DEATH: 'Ally Dies',
  ON_ENEMY_DEATH: 'Enemy Dies',
  ON_DIRECT_DAMAGE: 'Direct Damage',
  ROUND_END: 'Round End',
  ON_ALLY_SPELL_PLAYED: 'You Play a Spell',
  ON_ENEMY_SPELL_PLAYED: 'Enemy Plays a Spell',
  CONTINUOUS: 'Continuous',
  PASSIVE: 'Passive',
};

/** Which side's counters/state a count/history condition reads. Omit to default to the ability owner's own side ('SELF'). */
export type ConditionSide = 'SELF' | 'ENEMY';

export type ConditionDef =
  /** True if no enemy Hero occupies this ability-owner's own lane. */
  | { type: 'LANE_EMPTY_ENEMY_SIDE' }
  /** True if an enemy Hero occupies this ability-owner's own lane - the mirror of LANE_EMPTY_ENEMY_SIDE. */
  | { type: 'LANE_OCCUPIED_ENEMY_SIDE' }
  /** True if an allied Hero currently occupies this ability-owner's own lane (for Continuous Spells). */
  | { type: 'SELF_LANE_OCCUPIED' }
  /** True only when dispatched as a reaction to a death that happened in this ability-owner's own lane. */
  | { type: 'DEATH_IN_SELF_LANE' }
  /** True if this Spell zone hasn't already used its once-per-round reaction this round (e.g. Grave Totem). Spell-zone-specific legacy primitive - see the ability-level `oncePerRound` flag for the general-purpose version usable by Heroes too. */
  | { type: 'SPELL_ZONE_NOT_USED_THIS_ROUND' }
  /** True if the ability-owner's own Spell zone (same side, same lane) is currently occupied - "this lane has your Continuous Spell". */
  | { type: 'SELF_LANE_HAS_SPELL' }
  /** True if the ENEMY's Spell zone at this ability-owner's own lane is currently occupied - "this lane has the enemy's Continuous Spell". */
  | { type: 'ENEMY_LANE_HAS_SPELL' }
  /** True if an enemy Hero occupies this ability-owner's own lane AND currently has higher effective Power - a comeback/clutch condition. False when unopposed (that's a winning state, not a losing one). */
  | { type: 'SELF_LOSING_LANE' }
  /** True if an enemy Hero occupies this ability-owner's own lane AND currently has lower effective Power - the mirror of SELF_LOSING_LANE. False when unopposed. */
  | { type: 'SELF_WINNING_LANE' }
  /** True if another living allied Hero (not the ability owner itself) of the given faction is on the board. */
  | { type: 'ALLY_FACTION_PRESENT'; faction: Faction }
  /** True if another living allied Hero (not the ability owner itself) carrying the given tag is on the board. */
  | { type: 'ALLY_TAG_PRESENT'; tag: string }
  /** True if a living enemy Hero of the given faction is on the board. */
  | { type: 'ENEMY_FACTION_PRESENT'; faction: Faction }
  /** True if a living enemy Hero carrying the given tag is on the board. */
  | { type: 'ENEMY_TAG_PRESENT'; tag: string }
  /** True if a living allied Hero occupies a lane adjacent to the ability owner's own lane. */
  | { type: 'ADJACENT_ALLY_PRESENT' }
  /** True if the ability owner's side has at least `count` living Heroes on the board (the owner counts toward this). */
  | { type: 'ALLY_HERO_COUNT_AT_LEAST'; count: number }
  /** True if the ability owner's side has at least `count` living Heroes of the given faction on the board (the owner counts toward this if it matches). */
  | { type: 'ALLY_FACTION_COUNT_AT_LEAST'; faction: Faction; count: number }
  /** True if `side`'s (default SELF) Graveyard holds at least `count` cards. */
  | { type: 'GRAVEYARD_COUNT_AT_LEAST'; count: number; side?: ConditionSide }
  /** True if `side`'s (default SELF) Graveyard holds at least `count` cards of the given faction. */
  | { type: 'GRAVEYARD_FACTION_COUNT_AT_LEAST'; faction: Faction; count: number; side?: ConditionSide }
  /** True if the ability owner's own hand currently holds at least `count` cards. */
  | { type: 'HAND_SIZE_AT_LEAST'; count: number }
  /** True if the ability owner's own hand currently holds at most `count` cards. */
  | { type: 'HAND_SIZE_AT_MOST'; count: number }
  /** True if at least one allied Hero has been destroyed so far THIS round (scanned from this round's own event log - never a persisted flag). */
  | { type: 'ALLY_DIED_THIS_ROUND' }
  /** True if at least one enemy Hero has been destroyed so far THIS round. */
  | { type: 'ENEMY_DIED_THIS_ROUND' }
  /** True if `side` (default SELF) has played at least one Spell (one-time or Continuous) so far this round. */
  | { type: 'SPELL_PLAYED_THIS_ROUND'; side?: ConditionSide }
  /** True if a Continuous Spell belonging to `side` (default SELF) has been destroyed so far this round. */
  | { type: 'CONTINUOUS_SPELL_DESTROYED_THIS_ROUND'; side?: ConditionSide };

/** Where an effect applies. Always resolved automatically from the ability-owner's own lane/side - never chosen by the player. */
export type TargetScope =
  | 'SELF'
  | 'ALLY_SAME_LANE'
  | 'ENEMY_SAME_LANE'
  | 'ALL_ALLIES'
  | 'ALL_ENEMIES'
  | 'ADJACENT_ALLIES'
  | 'ADJACENT_ENEMIES';

/** RANDOM picks uniformly among every eligible card, ignoring Power entirely - for effects that want "any", not "the biggest/smallest". */
export type GraveyardPick = 'LOWEST_POWER' | 'HIGHEST_POWER' | 'RANDOM';

/** What a CHANGE_POWER_BY_COUNT amount scales with - always read from the ability owner's own side. */
export type CountBasis =
  | 'ALLY_HERO_COUNT' // every living allied Hero, owner included
  | 'ALLY_FACTION_HERO_COUNT' // living allied Heroes of `faction`
  | 'GRAVEYARD_COUNT' // cards in the owner's own Graveyard
  | 'GRAVEYARD_FACTION_COUNT'; // cards of `faction` in the owner's own Graveyard

/** Which kind of hostile source an immunity blocks. SPELL covers both one-time and Continuous Spell actions; HERO_EFFECT covers actions dispatched from another Hero's ability (including a Hero's own ON_DEATH). Combat itself is never blocked by either - immunity only ever gates a targeted ability effect. */
export type ImmunityKind = 'SPELL' | 'HERO_EFFECT';

export type ActionDef =
  | { type: 'CHANGE_POWER'; amount: number; duration: 'PERMANENT' | 'UNTIL_ROUND_END'; target: TargetScope }
  /** Sets Power to an absolute value rather than adding a delta - e.g. "set this Hero's Power to 1". Reuses the same PERMANENT/UNTIL_ROUND_END duration semantics as CHANGE_POWER. */
  | { type: 'SET_POWER'; value: number; duration: 'PERMANENT' | 'UNTIL_ROUND_END'; target: TargetScope }
  /** Power delta scaled by a live board/Graveyard count - e.g. "+1 Power for each Undead Hero in your Graveyard". `perCount` may be negative for a cost/drain effect. */
  | { type: 'CHANGE_POWER_BY_COUNT'; basis: CountBasis; faction?: Faction; perCount: number; duration: 'PERMANENT' | 'UNTIL_ROUND_END'; target: TargetScope }
  | { type: 'DESTROY'; target: TargetScope; maxPower?: number }
  /** Destroys the Continuous Spell (not the Hero) occupying the resolved lane - e.g. Dispel. */
  | { type: 'DESTROY_SPELL_ZONE'; target: TargetScope }
  /** Suppresses every one of the target Hero's own triggered abilities (ON_PLAY, BEFORE_COMBAT, ON_DEATH, its own PASSIVE immunity, ...) for the remainder of THIS round. Does not affect Power or combat. */
  | { type: 'SILENCE'; target: TargetScope }
  /**
   * Grants a one-time destruction shield: the next time the target Hero would be destroyed by ANY
   * source (combat loss, a DESTROY effect, or a Power<=0 sweep) this shield is consumed instead and
   * the Hero survives. Does not prevent combat overflow damage or Power loss - only the destruction
   * itself. Stacks are not tracked; granting it again while already shielded is a no-op re-affirmation.
   */
  | { type: 'GRANT_SHIELD'; target: TargetScope }
  /**
   * PASSIVE-trigger only - never dispatched, always read live (see the PASSIVE Trigger doc). Grants
   * the target immunity to the given hostile-effect source for as long as the granting ability's
   * conditions keep holding true.
   */
  | { type: 'GRANT_IMMUNITY'; immunity: ImmunityKind; target: TargetScope }
  /**
   * PASSIVE-trigger only - never dispatched, always read live. Reduces combat overflow damage the
   * target's controller takes when this Hero loses its lane, by `amount` (floored at 0). Does not
   * affect whether the Hero itself survives the loss - that's GRANT_SHIELD's job.
   */
  | { type: 'REDUCE_OVERFLOW_DAMAGE'; amount: number; target: TargetScope }
  | { type: 'RETURN_TO_HAND'; maxPower: number; pick: GraveyardPick; faction?: Faction }
  | { type: 'RETURN_TO_DECK' }
  /** Always revives into the ability-owner's own lane (a Spell's placement lane, or a Hero's own lane). */
  | { type: 'REVIVE_TO_LANE'; maxPower: number; pick: GraveyardPick; faction?: Faction }
  | { type: 'REVIVE_SELF'; power: number }
  /** Returns the specific Hero whose death triggered this reaction (e.g. Grave Totem) - not a graveyard-wide search. */
  | { type: 'RETURN_DEATH_SOURCE_TO_HAND' }
  | { type: 'PLAYER_DAMAGE'; amount: number }
  | { type: 'PLAYER_HEAL'; amount: number }
  /** Every other Hero on both boards (Legendary board-wide effects only). */
  | { type: 'DEBUFF_ALL_OTHERS'; amount: number; duration: 'PERMANENT' | 'UNTIL_ROUND_END' }
  /**
   * Permanently removes a Hero from the ENEMY's Graveyard - not returned, not revivable, gone for
   * the rest of the match. The anti-revival/Graveyard-hate primitive (see "Exile" in the rules glossary).
   */
  | { type: 'EXILE_FROM_GRAVEYARD'; pick: GraveyardPick };

export interface AbilityDefinition {
  trigger: Trigger;
  /** All conditions must pass (AND). Omit or leave empty for an unconditional ability. */
  conditions?: ConditionDef[];
  actions: ActionDef[];
  /** Player-facing text shown on tap/hover. Not read by the engine - and it must describe an automatic target, never a "choose" effect. */
  text: string;
  /**
   * When true, this ability fires at most once per round for its own instance, gated on that
   * instance's `usedThisRound` flag (reset every ROUND_START) - the general-purpose "the first time
   * X happens each round" primitive, e.g. "The first time an enemy Hero dies each round, heal 2."
   * Meaningless (ignored) on PASSIVE/CONTINUOUS abilities, which are never dispatched at all.
   */
  oncePerRound?: boolean;
}

export interface CardDefinition {
  id: string;
  name: string;
  shortName: string;
  faction: Faction;
  type: CardType;
  spellKind?: SpellKind; // Spells only
  role: string; // e.g. "Fighter", "Tank", "Mage" - flavor/UI only, not read by the engine
  rarity: Rarity;
  /** Kept for a future cost system, but not enforced anywhere in this prototype (Energy removed). */
  cost: number;
  power?: number; // Heroes only
  tags: string[];
  abilities: AbilityDefinition[];
  /**
   * A short (roughly 1 line, a handful of words) reminder of this card's effect, shown directly on
   * its battlefield chit so a player doesn't have to open Card Detail to remember what a placed card
   * does - e.g. "On Death: Return to hand" for the full text "When this Hero dies, return it to your
   * hand." Not read by the engine. Omit for vanilla cards with no ability; the UI falls back to no
   * summary line rather than showing anything broken or empty.
   */
  boardText?: string;
}

export interface HeroInstance {
  instanceId: string;
  cardId: string;
  faction: Faction;
  name: string;
  shortName: string;
  power: number;
  /** Portion of `power` that came from UNTIL_ROUND_END effects; subtracted back off at round end. */
  tempPower: number;
  /** One-time destruction shield from GRANT_SHIELD - see ActionDef. Consumed (set back to false) the first time this Hero would otherwise be destroyed. */
  shielded: boolean;
  /** Set by SILENCE for the remainder of the round it was applied in; reset to false at every ROUND_START. Suppresses this Hero's own triggered (and PASSIVE) abilities entirely while true. */
  silenced: boolean;
  /** Backs `oncePerRound` ability gating (see AbilityDefinition) - reset to false at every ROUND_START, same as SpellZoneInstance's usedThisRound. */
  usedThisRound: boolean;
  /** Ascension rank this Hero entered play with (display only - the engine resolves abilities from GameState.ascensions). Absent = Base. */
  ascension?: number;
}

export interface SpellZoneInstance {
  instanceId: string;
  cardId: string;
  faction: Faction;
  name: string;
  shortName: string;
  /** For once-per-round reactions (e.g. Grave Totem). Reset to false for every Spell zone at Round Start. */
  usedThisRound: boolean;
}

export interface HandCard {
  handId: string;
  cardId: string;
}

export interface PlayerState {
  side: Side;
  hp: number;
  deck: string[]; // cardIds, draw from index 0, return-to-deck pushes to the end
  hand: HandCard[];
  graveyard: string[]; // cardIds, destruction order
  heroZones: Record<LaneId, HeroInstance | null>;
  spellZones: Record<LaneId, SpellZoneInstance | null>;
}

/** The equipped Mastery a side brought into this match (see game/mastery). Fixed for the whole match; never persisted from here. */
export interface MasteryLoadout {
  id: string;
  rank: number;
}

export interface GameState {
  round: number;
  rngState: number;
  player: PlayerState;
  enemy: PlayerState;
  status: 'IN_PROGRESS' | 'PLAYER_WIN' | 'ENEMY_WIN' | 'DRAW';
  /** Equipped Masteries per side; absent/undefined side = none. Read by beginRound (engine/mastery.ts). */
  masteries?: Partial<Record<Side, MasteryLoadout>>;
  /**
   * Ascension rank per card id, per side, for THIS match (cardId -> rank; missing/0 = Base). The engine resolves a
   * Hero's abilities as base card + Ascension modifiers (game/ascension/effective.ts). Omit for none - which is
   * also how a mode would normalise Ascension away.
   */
  ascensions?: Partial<Record<Side, Record<string, number>>>;
}

/**
 * `lane` is both "where this card was placed" and, for automatically-targeted effects, the entire
 * targeting input - there is no separate target/param selection. Every Spell (instant or persistent)
 * needs a lane, even a globally-scoped one (War Cry still drops into a Spell slot); a Hero needs a
 * lane to occupy.
 */
export interface DeployPlay {
  handId: string;
  cardId: string;
  lane: LaneId;
}

export interface PlayerAction {
  plays: DeployPlay[];
}

// ---------------------------------------------------------------------------
// Event log - the engine's only communication channel with the UI/animation layer.
// ---------------------------------------------------------------------------

export interface Placement {
  side: Side;
  lane: LaneId;
  zone: 'hero' | 'spell';
  instanceId: string;
  cardId: string;
}

export type CombatOutcome = 'PLAYER_WINS' | 'ENEMY_WINS' | 'TIE' | 'PLAYER_DIRECT' | 'ENEMY_DIRECT' | 'EMPTY';

export type GameEvent =
  | { type: 'ROUND_START'; round: number }
  /** Every Hero/persistent Spell placed this round appears here - before any ability dispatches. Instant Spells never occupy a zone, so they aren't listed here (see SPELL_RESOLVED). */
  | { type: 'REVEAL'; handRemovals: { side: Side; handId: string }[]; placements: Placement[] }
  | { type: 'ON_PLAY'; side: Side; instanceId: string; cardId: string; name: string; lane: LaneId; zone: 'hero' | 'spell' }
  | { type: 'SPELL_RESOLVED'; side: Side; lane: LaneId; cardId: string; name: string; fizzled: boolean }
  | { type: 'TRIGGER'; side: Side; sourceName: string; trigger: Trigger; label: string }
  | { type: 'POWER_CHANGED'; side: Side; instanceId: string; name: string; from: number; to: number; reason: string; permanent: boolean }
  | {
      type: 'COMBAT';
      lane: LaneId;
      outcome: CombatOutcome;
      player: { name: string; power: number } | null;
      enemy: { name: string; power: number } | null;
    }
  | { type: 'DIRECT_DAMAGE'; side: Side; amount: number; from: number; to: number; sourceName: string }
  /**
   * Combat overflow: the losing side's player takes (winner's Power - loser's Power) damage the
   * instant their Hero is beaten in a lane - distinct from DIRECT_DAMAGE, which is only for an
   * unopposed Hero (empty enemy lane) or an explicit PLAYER_DAMAGE effect. `side` is the side whose
   * HP changed (the lane's loser), matching DIRECT_DAMAGE's convention.
   */
  | { type: 'OVERFLOW_DAMAGE'; side: Side; lane: LaneId; amount: number; from: number; to: number; winnerName: string; loserName: string }
  | { type: 'HEAL'; side: Side; amount: number; from: number; to: number; sourceName: string }
  | { type: 'HERO_DESTROYED'; side: Side; instanceId: string; cardId: string; name: string; lane: LaneId }
  | { type: 'SPELL_ZONE_DESTROYED'; side: Side; instanceId: string; cardId: string; name: string; lane: LaneId }
  /** `usedSpellZoneLane`, when present, is the Spell zone whose once-per-round reaction just fired (e.g. Grave Totem). */
  | { type: 'RETURNED_TO_HAND'; side: Side; cardId: string; name: string; graveyardIndex: number; handId: string; usedSpellZoneLane?: LaneId }
  | { type: 'RETURNED_TO_DECK'; side: Side; cardId: string; name: string }
  /** `power` is the Power the revived Hero actually enters with - not necessarily the card's base Power (Vharos revives at a reduced, fixed value). */
  | { type: 'REVIVED'; side: Side; instanceId: string; cardId: string; name: string; lane: LaneId; power: number; graveyardIndex: number }
  | { type: 'DRAW'; side: Side; cardId?: string; cardName?: string; fizzled: boolean }
  | { type: 'TEMP_POWER_EXPIRED'; side: Side; name: string; amount: number }
  /** `side` is the Graveyard's owner (the side that lost the card) - the caster is the opposing side. */
  | { type: 'EXILED'; side: Side; cardId: string; name: string; graveyardIndex: number }
  /** A death-trigger chain hit the engine's safety cap and was cut short - see `destroyAndChain`. Should never fire from a well-designed card; logged loudly if it ever does. */
  | { type: 'SAFEGUARD_TRIPPED'; reason: string }
  /** A hostile Spell or Hero-effect action had its target filtered out by that target's live PASSIVE immunity - the action simply skipped this one target rather than fizzling entirely (other, non-immune targets of the same action still resolve normally). Purely informational; no state changes. */
  | { type: 'IMMUNITY_BLOCKED'; side: Side; lane: LaneId; immunity: ImmunityKind; sourceName: string }
  | { type: 'SHIELD_GRANTED'; side: Side; instanceId: string; name: string; lane: LaneId }
  /** The shield absorbed a destruction attempt - the Hero survives, still occupying `lane`. */
  | { type: 'SHIELD_CONSUMED'; side: Side; instanceId: string; name: string; lane: LaneId }
  | { type: 'SILENCED'; side: Side; instanceId: string; name: string; lane: LaneId }
  /** An `oncePerRound` ability fired and marked its own instance used for the rest of the round - see AbilityDefinition.oncePerRound. */
  | { type: 'ONCE_PER_ROUND_USED'; side: Side; instanceId: string; zone: 'hero' | 'spell' }
  /**
   * A Mastery fired at the start of a round (after draws, before Deploy). It is the announcement/label
   * for whatever follows - the actual state changes reuse the existing events (RETURNED_TO_HAND,
   * SHIELD_GRANTED) so replay and animation keep working unchanged. `outcome` is 'no-target' when it
   * fired but had nothing to act on (empty Graveyard, no eligible Hero, ...), in which case nothing else changed.
   */
  | { type: 'MASTERY_TRIGGERED'; side: Side; masteryId: string; name: string; rank: number; outcome: 'applied' | 'no-target'; detail: string }
  | { type: 'ROUND_END'; round: number }
  | { type: 'MATCH_END'; winner: Side | 'draw'; reason: string };

export interface ResolveResult {
  nextState: GameState;
  events: GameEvent[];
}
