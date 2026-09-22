import type { AbilityDefinition, ActionDef, CountBasis, ConditionDef, ConditionSide, Faction, GraveyardPick, GameState, HeroInstance, ImmunityKind, LaneId, Side, TargetScope, Trigger } from '../types';
import { LANES, TRIGGER_LABEL, adjacentLanes } from '../types';
import { getCard } from '../cards';
import { effectiveAbilities } from '../ascension/effective';
import { nextRandom } from './rng';
import { STARTING_HP } from './constants';
import { effectivePower } from './power';
import { type Ctx, getHero, getSpellZone, livingHeroes, makeInstanceId, occupiedSpellZones, opposite, playerOf, push, setHero, setSpellZone } from './board';

/** Everything an ability's actions need to know about who/what triggered it. Fully determines every automatic target. */
export interface AbilityContext {
  ownerSide: Side;
  sourceName: string;
  /** 'hero' for a Hero's own ability (including its own ON_DEATH); 'spell' for a one-time or Continuous Spell's ability. Decides which ImmunityKind a hostile action must beat. */
  sourceKind: 'hero' | 'spell';
  selfLane?: LaneId;
  selfInstanceId?: string;
  /** Set when dispatched from a dying Hero's own ON_DEATH (RETURN_TO_DECK, REVIVE_SELF), or when
   *  dispatched to another zone reacting to that death via ON_ALLY_DEATH/ON_ENEMY_DEATH (Grave Totem). */
  deathCardId?: string;
  /** The lane the death happened in - lets a reacting Spell zone check "did this happen in MY lane". */
  deathLane?: LaneId;
}

interface DeadHero {
  side: Side;
  lane: LaneId;
  instanceId: string;
  cardId: string;
  name: string;
  /** Captured from the Hero at the moment of removal - a silenced Hero's own ON_DEATH does not fire. */
  silenced: boolean;
  /** A token vanishes: it triggers no death effects at all. */
  token: boolean;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** The Ascension rank `side` brought for this card into the match (0 = Base). */
export function ascensionRank(state: GameState, side: Side, cardId: string): number {
  return state.ascensions?.[side]?.[cardId] ?? 0;
}

/** A Hero's live abilities: base card + that side's Ascension modifiers. The one place the engine asks "what does this Hero do". */
function heroAbilities(state: GameState, side: Side, cardId: string): AbilityDefinition[] {
  return effectiveAbilities(cardId, ascensionRank(state, side, cardId));
}

function changeHeroPower(ctx: Ctx, side: Side, lane: LaneId, amount: number, duration: 'PERMANENT' | 'UNTIL_ROUND_END', sourceName: string): void {
  const hero = getHero(ctx, side, lane);
  if (!hero) return;
  const from = hero.power;
  hero.power += amount;
  if (duration === 'UNTIL_ROUND_END') hero.tempPower += amount;
  push(ctx, { type: 'POWER_CHANGED', side, instanceId: hero.instanceId, name: hero.name, from, to: hero.power, reason: sourceName, permanent: duration === 'PERMANENT' });
}

function setHeroPower(ctx: Ctx, side: Side, lane: LaneId, value: number, duration: 'PERMANENT' | 'UNTIL_ROUND_END', sourceName: string): void {
  const hero = getHero(ctx, side, lane);
  if (!hero) return;
  const from = hero.power;
  const delta = value - from;
  hero.power = value;
  if (duration === 'UNTIL_ROUND_END') hero.tempPower += delta;
  push(ctx, { type: 'POWER_CHANGED', side, instanceId: hero.instanceId, name: hero.name, from, to: hero.power, reason: sourceName, permanent: duration === 'PERMANENT' });
}

/**
 * Gives the Hero at (side, lane) a one-time destruction shield. The single shield primitive: GRANT_SHIELD
 * effects and the Fortification Mastery both go through here, and the shield is consumed at the same
 * destruction choke point either way. Returns false (and emits nothing) if there's no Hero or it is
 * already shielded.
 */
export function grantShield(ctx: Ctx, side: Side, lane: LaneId): boolean {
  const hero = getHero(ctx, side, lane);
  if (!hero || hero.shielded) return false;
  hero.shielded = true;
  push(ctx, { type: 'SHIELD_GRANTED', side, instanceId: hero.instanceId, name: hero.name, lane });
  return true;
}

/** PREVENT_NEXT_DAMAGE: if the side's player has a barrier up, this damage instance is absorbed (one barrier charge per instance). */
function absorbedByBarrier(ctx: Ctx, side: Side, amount: number, sourceName: string): boolean {
  const p = playerOf(ctx, side);
  if (amount <= 0 || !p.barrier) return false;
  p.barrier -= 1;
  if (p.barrier <= 0) delete p.barrier;
  push(ctx, { type: 'DAMAGE_PREVENTED', side, amount, sourceName });
  return true;
}

function dealDirectDamage(ctx: Ctx, side: Side, amount: number, sourceName: string): void {
  if (absorbedByBarrier(ctx, side, amount, sourceName)) return;
  const p = playerOf(ctx, side);
  const from = p.hp;
  p.hp = Math.max(0, p.hp - amount);
  push(ctx, { type: 'DIRECT_DAMAGE', side, amount, from, to: p.hp, sourceName });
}


function healPlayer(ctx: Ctx, side: Side, amount: number, sourceName: string): void {
  const p = playerOf(ctx, side);
  // A player already at 0 HP is defeated - the win check just hasn't run yet (it runs at Round End). Healing must not
  // undo lethal damage taken earlier in the same round (found by the AI sweep: Grave Knight mirrors looped forever).
  if (p.hp <= 0) return;
  const from = p.hp;
  p.hp = Math.min(STARTING_HP, p.hp + amount);
  push(ctx, { type: 'HEAL', side, amount, from, to: p.hp, sourceName });
}

function destroySpellZone(ctx: Ctx, side: Side, lane: LaneId): void {
  const spell = getSpellZone(ctx, side, lane);
  if (!spell) return;
  setSpellZone(ctx, side, lane, null);
  playerOf(ctx, side).graveyard.push(spell.cardId);
  push(ctx, { type: 'SPELL_ZONE_DESTROYED', side, instanceId: spell.instanceId, cardId: spell.cardId, name: spell.name, lane });
}

/** Every board location a TargetScope resolves to, from the ability-owner's own side/lane. Never player-chosen. */
function resolveTargetLocations(ctx: Ctx, exec: AbilityContext, scope: TargetScope): { side: Side; lane: LaneId }[] {
  if (!exec.selfLane) return [];
  switch (scope) {
    case 'SELF':
    case 'ALLY_SAME_LANE':
      return [{ side: exec.ownerSide, lane: exec.selfLane }];
    case 'ENEMY_SAME_LANE':
      return [{ side: opposite(exec.ownerSide), lane: exec.selfLane }];
    case 'ALL_ALLIES':
      return livingHeroes(ctx, exec.ownerSide).map(({ lane }) => ({ side: exec.ownerSide, lane }));
    case 'ALL_ENEMIES':
      return livingHeroes(ctx, opposite(exec.ownerSide)).map(({ lane }) => ({ side: opposite(exec.ownerSide), lane }));
    case 'ADJACENT_ALLIES':
      return adjacentLanes(exec.selfLane).map((lane) => ({ side: exec.ownerSide, lane }));
    case 'ADJACENT_ENEMIES':
      return adjacentLanes(exec.selfLane).map((lane) => ({ side: opposite(exec.ownerSide), lane }));
  }
}

// ---------------------------------------------------------------------------
// Passive immunity / overflow reduction - PASSIVE-trigger abilities are never dispatched; they're
// read live, exactly like CONTINUOUS Spell bonuses, at the moment a hostile effect or overflow damage
// is about to land. This is the whole point of PASSIVE: a condition-gated immunity ("while another
// Kingdom Hero is in play, immune to Spells") turns on and off automatically as the board changes,
// with no stored "immune" flag to fall out of sync.
// ---------------------------------------------------------------------------

/**
 * The live PASSIVE ability (if any) currently granting the Hero at (side, lane) immunity to a hostile
 * source kind. A silenced Hero's PASSIVE abilities never apply, and an oncePerRound immunity is skipped
 * once this Hero has already used its round ("the first Spell that targets it each round has no effect").
 */
function findImmunityAbility(ctx: Ctx, side: Side, lane: LaneId, kind: ImmunityKind): AbilityDefinition | null {
  const hero = getHero(ctx, side, lane);
  if (!hero || hero.silenced) return null;
  const exec: AbilityContext = { ownerSide: side, sourceName: hero.name, sourceKind: 'hero', selfLane: lane, selfInstanceId: hero.instanceId };
  for (const ability of heroAbilities(ctx.state, side, hero.cardId)) {
    if (ability.trigger !== 'PASSIVE') continue;
    if (ability.oncePerRound && hero.usedThisRound) continue;
    if (!evalConditions(ctx, exec, ability.conditions)) continue;
    for (const action of ability.actions) {
      if (action.type !== 'GRANT_IMMUNITY' || action.immunity !== kind) continue;
      for (const loc of resolveTargetLocations(ctx, exec, action.target)) {
        if (loc.side === side && loc.lane === lane) return ability;
      }
    }
  }
  return null;
}

/** True (and, for a once-per-round immunity, consumes it) if the Hero at (side, lane) is immune to a hostile source of this kind right now. */
function blockedByImmunity(ctx: Ctx, side: Side, lane: LaneId, kind: ImmunityKind): boolean {
  const ability = findImmunityAbility(ctx, side, lane, kind);
  if (!ability) return false;
  const hero = getHero(ctx, side, lane);
  if (ability.oncePerRound && hero) {
    hero.usedThisRound = true;
    push(ctx, { type: 'ONCE_PER_ROUND_USED', side, instanceId: hero.instanceId, zone: 'hero' });
  }
  return true;
}

/**
 * The bypass rule (GRANT_BYPASS): null if the Hero at (side, lane) can't bypass right now, else the
 * Power reduction its bypass attack suffers. Read live like every other PASSIVE, so it switches off the
 * instant its support (a Continuous Spell, ...) goes away or the Hero is Silenced.
 */
export function bypassReductionFor(ctx: Ctx, side: Side, lane: LaneId): number | null {
  const hero = getHero(ctx, side, lane);
  if (!hero || hero.silenced) return null;
  const exec: AbilityContext = { ownerSide: side, sourceName: hero.name, sourceKind: 'hero', selfLane: lane, selfInstanceId: hero.instanceId };
  let best: number | null = null;
  for (const ability of heroAbilities(ctx.state, side, hero.cardId)) {
    if (ability.trigger !== 'PASSIVE') continue;
    if (!evalConditions(ctx, exec, ability.conditions)) continue;
    for (const action of ability.actions) {
      if (action.type === 'GRANT_BYPASS') best = best === null ? action.reduction : Math.min(best, action.reduction);
    }
  }
  return best;
}

/** The name of a live, unsilenced Hero on the side whose PASSIVE SPELL_ECHO applies right now, else null. */
function spellEchoSource(ctx: Ctx, side: Side): string | null {
  for (const { lane, hero } of livingHeroes(ctx, side)) {
    if (hero.silenced) continue;
    const exec: AbilityContext = { ownerSide: side, sourceName: hero.name, sourceKind: 'hero', selfLane: lane, selfInstanceId: hero.instanceId };
    for (const ability of heroAbilities(ctx.state, side, hero.cardId)) {
      if (ability.trigger !== 'PASSIVE' || !ability.actions.some((a) => a.type === 'SPELL_ECHO')) continue;
      if (evalConditions(ctx, exec, ability.conditions)) return hero.name;
    }
  }
  return null;
}

/** Sum of every live PASSIVE REDUCE_OVERFLOW_DAMAGE the Hero at (side, lane) grants itself right now. Used when THIS Hero is the combat loser. */
export function overflowReductionFor(ctx: Ctx, side: Side, lane: LaneId): number {
  const hero = getHero(ctx, side, lane);
  if (!hero || hero.silenced) return 0;
  const exec: AbilityContext = { ownerSide: side, sourceName: hero.name, sourceKind: 'hero', selfLane: lane, selfInstanceId: hero.instanceId };
  let total = 0;
  for (const ability of heroAbilities(ctx.state, side, hero.cardId)) {
    if (ability.trigger !== 'PASSIVE') continue;
    if (!evalConditions(ctx, exec, ability.conditions)) continue;
    for (const action of ability.actions) {
      if (action.type !== 'REDUCE_OVERFLOW_DAMAGE') continue;
      for (const loc of resolveTargetLocations(ctx, exec, action.target)) {
        if (loc.side === side && loc.lane === lane) total += action.amount;
      }
    }
  }
  return total;
}

function isHostileAction(action: ActionDef): boolean {
  switch (action.type) {
    case 'DESTROY':
    case 'SILENCE':
    case 'SET_POWER':
    case 'STALL_COMBAT':
      return true;
    case 'CHANGE_POWER':
      return action.amount < 0;
    case 'CHANGE_POWER_BY_COUNT':
      return action.perCount < 0;
    default:
      return false;
  }
}

/** Drops any enemy-side target that currently has live immunity to this action's source kind, logging IMMUNITY_BLOCKED for each. Same-side targets are never filtered - immunity only ever blocks a hostile foreign source. */
function filterHostileTargets(ctx: Ctx, exec: AbilityContext, action: ActionDef, locs: { side: Side; lane: LaneId }[]): { side: Side; lane: LaneId }[] {
  if (!isHostileAction(action)) return locs;
  const immunity: ImmunityKind = exec.sourceKind === 'spell' ? 'SPELL' : 'HERO_EFFECT';
  return locs.filter((loc) => {
    if (loc.side === exec.ownerSide) return true;
    if (blockedByImmunity(ctx, loc.side, loc.lane, immunity)) {
      push(ctx, { type: 'IMMUNITY_BLOCKED', side: loc.side, lane: loc.lane, immunity, sourceName: exec.sourceName });
      return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

function resolveConditionSide(exec: AbilityContext, side: ConditionSide | undefined): Side {
  return side === 'ENEMY' ? opposite(exec.ownerSide) : exec.ownerSide;
}

function evalOneCondition(ctx: Ctx, exec: AbilityContext, condition: ConditionDef): boolean {
  switch (condition.type) {
    case 'LANE_EMPTY_ENEMY_SIDE':
      return !!exec.selfLane && getHero(ctx, opposite(exec.ownerSide), exec.selfLane) === null;
    case 'LANE_OCCUPIED_ENEMY_SIDE':
      return !!exec.selfLane && getHero(ctx, opposite(exec.ownerSide), exec.selfLane) !== null;
    case 'SELF_LANE_OCCUPIED':
      return !!exec.selfLane && getHero(ctx, exec.ownerSide, exec.selfLane) !== null;
    case 'DEATH_IN_SELF_LANE':
      return !!exec.selfLane && exec.deathLane === exec.selfLane;
    case 'SPELL_ZONE_NOT_USED_THIS_ROUND':
      return !!exec.selfLane && getSpellZone(ctx, exec.ownerSide, exec.selfLane)?.usedThisRound !== true;
    case 'SELF_LANE_HAS_SPELL':
      return !!exec.selfLane && getSpellZone(ctx, exec.ownerSide, exec.selfLane) !== null;
    case 'ENEMY_LANE_HAS_SPELL':
      return !!exec.selfLane && getSpellZone(ctx, opposite(exec.ownerSide), exec.selfLane) !== null;
    case 'SELF_LOSING_LANE': {
      if (!exec.selfLane) return false;
      const enemy = getHero(ctx, opposite(exec.ownerSide), exec.selfLane);
      if (!enemy) return false; // unopposed is never "losing"
      return effectivePower(ctx.state, exec.ownerSide, exec.selfLane) < effectivePower(ctx.state, opposite(exec.ownerSide), exec.selfLane);
    }
    case 'SELF_WINNING_LANE': {
      if (!exec.selfLane) return false;
      const enemy = getHero(ctx, opposite(exec.ownerSide), exec.selfLane);
      if (!enemy) return false; // unopposed is neither winning nor losing a fight
      return effectivePower(ctx.state, exec.ownerSide, exec.selfLane) > effectivePower(ctx.state, opposite(exec.ownerSide), exec.selfLane);
    }
    case 'ALLY_FACTION_PRESENT':
      return livingHeroes(ctx, exec.ownerSide).some(({ hero }) => hero.instanceId !== exec.selfInstanceId && hero.faction === condition.faction);
    case 'ALLY_TAG_PRESENT':
      return livingHeroes(ctx, exec.ownerSide).some(({ hero }) => hero.instanceId !== exec.selfInstanceId && getCard(hero.cardId).tags.includes(condition.tag));
    case 'ENEMY_FACTION_PRESENT':
      return livingHeroes(ctx, opposite(exec.ownerSide)).some(({ hero }) => hero.faction === condition.faction);
    case 'ENEMY_TAG_PRESENT':
      return livingHeroes(ctx, opposite(exec.ownerSide)).some(({ hero }) => getCard(hero.cardId).tags.includes(condition.tag));
    case 'ADJACENT_ALLY_PRESENT':
      return !!exec.selfLane && adjacentLanes(exec.selfLane).some((lane) => getHero(ctx, exec.ownerSide, lane) !== null);
    case 'ALLY_HERO_COUNT_AT_LEAST':
      return livingHeroes(ctx, exec.ownerSide).length >= condition.count;
    case 'ALLY_FACTION_COUNT_AT_LEAST':
      return livingHeroes(ctx, exec.ownerSide).filter(({ hero }) => hero.faction === condition.faction).length >= condition.count;
    case 'GRAVEYARD_COUNT_AT_LEAST':
      return playerOf(ctx, resolveConditionSide(exec, condition.side)).graveyard.length >= condition.count;
    case 'GRAVEYARD_FACTION_COUNT_AT_LEAST':
      return playerOf(ctx, resolveConditionSide(exec, condition.side)).graveyard.filter((id) => getCard(id).faction === condition.faction).length >= condition.count;
    case 'HAND_SIZE_AT_LEAST':
      return playerOf(ctx, exec.ownerSide).hand.length >= condition.count;
    case 'HAND_SIZE_AT_MOST':
      return playerOf(ctx, exec.ownerSide).hand.length <= condition.count;
    case 'ALLY_DIED_THIS_ROUND':
      return ctx.events.some((e) => e.type === 'HERO_DESTROYED' && !e.token && e.side === exec.ownerSide);
    case 'ENEMY_DIED_THIS_ROUND':
      return ctx.events.some((e) => e.type === 'HERO_DESTROYED' && !e.token && e.side === opposite(exec.ownerSide));
    case 'SPELL_PLAYED_THIS_ROUND': {
      const side = resolveConditionSide(exec, condition.side);
      return ctx.events.some((e) => (e.type === 'SPELL_RESOLVED' && e.side === side && !e.fizzled) || (e.type === 'ON_PLAY' && e.side === side && e.zone === 'spell'));
    }
    case 'CONTINUOUS_SPELL_DESTROYED_THIS_ROUND': {
      const side = resolveConditionSide(exec, condition.side);
      return ctx.events.some((e) => e.type === 'SPELL_ZONE_DESTROYED' && e.side === side);
    }
    case 'SPELLS_PLAYED_THIS_ROUND_AT_LEAST':
      return spellsPlayedThisRound(ctx, resolveConditionSide(exec, condition.side)) >= condition.count;
    case 'SPELL_ZONES_OCCUPIED_AT_LEAST':
      return occupiedSpellZones(ctx, resolveConditionSide(exec, condition.side)).length >= condition.count;
    case 'SPELL_ZONES_OCCUPIED_AT_MOST':
      return occupiedSpellZones(ctx, resolveConditionSide(exec, condition.side)).length <= condition.count;
    case 'ENEMY_HERO_COUNT_HIGHER':
      return livingHeroes(ctx, opposite(exec.ownerSide)).length > livingHeroes(ctx, exec.ownerSide).length;
    case 'SELF_ENTERED_EARLIER': {
      const hero = exec.selfLane ? getHero(ctx, exec.ownerSide, exec.selfLane) : null;
      return !!hero && (hero.enteredRound ?? 0) < ctx.state.round;
    }
    case 'DEAD_HERO_HAS_TAG':
      return !!exec.deathCardId && getCard(exec.deathCardId).tags.includes(condition.tag);
    default:
      return true;
  }
}

/** Spells the side has played so far this round - one-time (SPELL_RESOLVED, counted once it finishes) and Continuous (ON_PLAY) alike, fizzled or not. Scanned from this round's own event log. */
function spellsPlayedThisRound(ctx: Ctx, side: Side): number {
  let n = 0;
  for (const e of ctx.events) {
    if (e.type === 'SPELL_RESOLVED' && e.side === side) n++;
    else if (e.type === 'ON_PLAY' && e.zone === 'spell' && e.side === side) n++;
  }
  return n;
}

function evalConditions(ctx: Ctx, exec: AbilityContext, conditions: ConditionDef[] | undefined): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => evalOneCondition(ctx, exec, c));
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function computeCountBasis(ctx: Ctx, exec: AbilityContext, basis: CountBasis, faction: Faction | undefined, tag: string | undefined): number {
  const side = exec.ownerSide;
  switch (basis) {
    case 'ALLY_HERO_COUNT':
      return livingHeroes(ctx, side).length;
    case 'ALLY_FACTION_HERO_COUNT':
      return livingHeroes(ctx, side).filter(({ hero }) => hero.faction === faction).length;
    case 'GRAVEYARD_COUNT':
      return playerOf(ctx, side).graveyard.length;
    case 'GRAVEYARD_FACTION_COUNT':
      return playerOf(ctx, side).graveyard.filter((id) => getCard(id).faction === faction).length;
    case 'OTHER_ALLY_TAG_COUNT':
      return livingHeroes(ctx, side).filter(({ hero }) => hero.instanceId !== exec.selfInstanceId && !!tag && getCard(hero.cardId).tags.includes(tag)).length;
    case 'ADJACENT_ALLY_TAG_COUNT':
      return !exec.selfLane
        ? 0
        : adjacentLanes(exec.selfLane).filter((lane) => {
            const hero = getHero(ctx, side, lane);
            return !!hero && !!tag && getCard(hero.cardId).tags.includes(tag);
          }).length;
  }
}

function executeAction(ctx: Ctx, action: ActionDef, exec: AbilityContext): void {
  switch (action.type) {
    case 'CHANGE_POWER': {
      const locs = filterHostileTargets(ctx, exec, action, resolveTargetLocations(ctx, exec, action.target));
      for (const loc of locs) changeHeroPower(ctx, loc.side, loc.lane, action.amount, action.duration, exec.sourceName);
      return;
    }
    case 'SET_POWER': {
      const locs = filterHostileTargets(ctx, exec, action, resolveTargetLocations(ctx, exec, action.target));
      for (const loc of locs) setHeroPower(ctx, loc.side, loc.lane, action.value, action.duration, exec.sourceName);
      return;
    }
    case 'CHANGE_POWER_BY_COUNT': {
      const count = computeCountBasis(ctx, exec, action.basis, action.faction, action.tag);
      const amount = count * action.perCount;
      if (amount === 0) return;
      const locs = filterHostileTargets(ctx, exec, action, resolveTargetLocations(ctx, exec, action.target));
      for (const loc of locs) changeHeroPower(ctx, loc.side, loc.lane, amount, action.duration, exec.sourceName);
      return;
    }
    case 'DESTROY': {
      const candidates = filterHostileTargets(ctx, exec, action, resolveTargetLocations(ctx, exec, action.target));
      const toDestroy: { side: Side; lane: LaneId }[] = [];
      for (const loc of candidates) {
        const hero = getHero(ctx, loc.side, loc.lane);
        if (!hero) continue;
        if (action.maxPower !== undefined && hero.power > action.maxPower) continue; // doesn't meet the threshold - fizzles for this one
        toDestroy.push(loc);
      }
      if (toDestroy.length > 0) destroyAndChain(ctx, toDestroy);
      return;
    }
    case 'DESTROY_SPELL_ZONE': {
      for (const loc of resolveTargetLocations(ctx, exec, action.target)) {
        if (getSpellZone(ctx, loc.side, loc.lane)) destroySpellZone(ctx, loc.side, loc.lane);
      }
      return;
    }
    case 'SILENCE': {
      const locs = filterHostileTargets(ctx, exec, action, resolveTargetLocations(ctx, exec, action.target));
      for (const loc of locs) {
        const hero = getHero(ctx, loc.side, loc.lane);
        if (!hero || hero.silenced) continue;
        hero.silenced = true;
        push(ctx, { type: 'SILENCED', side: loc.side, instanceId: hero.instanceId, name: hero.name, lane: loc.lane });
      }
      return;
    }
    case 'GRANT_SHIELD': {
      for (const loc of resolveTargetLocations(ctx, exec, action.target)) grantShield(ctx, loc.side, loc.lane);
      return;
    }
    case 'GRANT_IMMUNITY':
    case 'REDUCE_OVERFLOW_DAMAGE':
      // PASSIVE-trigger only actions - read live by hasImmunity()/overflowReductionFor(), never
      // dispatched through here (PASSIVE abilities never reach executeAbilityActions at all).
      return;
    case 'RETURN_TO_HAND': {
      const p = playerOf(ctx, exec.ownerSide);
      const pick = pickEligibleFromGraveyard(p.graveyard, action.maxPower, action.pick, ctx, action.faction, action.cardType ?? 'hero');
      if (!pick) return;
      p.graveyard.splice(pick.index, 1);
      const handId = makeReturnHandId(ctx, exec.ownerSide, pick.cardId);
      p.hand.push({ handId, cardId: pick.cardId });
      push(ctx, { type: 'RETURNED_TO_HAND', side: exec.ownerSide, cardId: pick.cardId, name: getCard(pick.cardId).name, graveyardIndex: pick.index, handId });
      return;
    }
    case 'RETURN_TO_DECK': {
      if (!exec.deathCardId) return;
      const p = playerOf(ctx, exec.ownerSide);
      const idx = p.graveyard.lastIndexOf(exec.deathCardId);
      if (idx < 0) return;
      p.graveyard.splice(idx, 1);
      p.deck.push(exec.deathCardId);
      push(ctx, { type: 'RETURNED_TO_DECK', side: exec.ownerSide, cardId: exec.deathCardId, name: getCard(exec.deathCardId).name });
      return;
    }
    case 'RETURN_DEATH_SOURCE_TO_HAND': {
      if (!exec.deathCardId || !exec.selfLane) return;
      const p = playerOf(ctx, exec.ownerSide);
      const idx = p.graveyard.lastIndexOf(exec.deathCardId);
      if (idx < 0) return;
      p.graveyard.splice(idx, 1);
      const handId = makeReturnHandId(ctx, exec.ownerSide, exec.deathCardId);
      p.hand.push({ handId, cardId: exec.deathCardId });
      const zone = getSpellZone(ctx, exec.ownerSide, exec.selfLane);
      if (zone) zone.usedThisRound = true;
      push(ctx, {
        type: 'RETURNED_TO_HAND',
        side: exec.ownerSide,
        cardId: exec.deathCardId,
        name: getCard(exec.deathCardId).name,
        graveyardIndex: idx,
        handId,
        usedSpellZoneLane: exec.selfLane,
      });
      return;
    }
    case 'REVIVE_TO_LANE': {
      if (!exec.selfLane) return;
      const p = playerOf(ctx, exec.ownerSide);
      if (getHero(ctx, exec.ownerSide, exec.selfLane) !== null) return; // this lane's Hero zone is already occupied - fizzles
      const pick = pickEligibleFromGraveyard(p.graveyard, action.maxPower, action.pick, ctx, action.faction);
      if (!pick) return;
      p.graveyard.splice(pick.index, 1);
      const revived = makeHeroInstance(exec.ownerSide, exec.selfLane, ctx.state.round, pick.cardId, ascensionRank(ctx.state, exec.ownerSide, pick.cardId));
      setHero(ctx, exec.ownerSide, exec.selfLane, revived);
      push(ctx, { type: 'REVIVED', side: exec.ownerSide, instanceId: revived.instanceId, cardId: pick.cardId, name: getCard(pick.cardId).name, lane: exec.selfLane, power: revived.power, graveyardIndex: pick.index });
      return;
    }
    case 'REVIVE_SELF': {
      if (!exec.deathCardId || !exec.selfLane) return;
      const p = playerOf(ctx, exec.ownerSide);
      if (getHero(ctx, exec.ownerSide, exec.selfLane) !== null) return; // something else already took the lane
      const idx = p.graveyard.lastIndexOf(exec.deathCardId);
      if (idx < 0) return;
      p.graveyard.splice(idx, 1);
      const instance = makeHeroInstance(exec.ownerSide, exec.selfLane, ctx.state.round, exec.deathCardId, ascensionRank(ctx.state, exec.ownerSide, exec.deathCardId));
      instance.power = action.power;
      setHero(ctx, exec.ownerSide, exec.selfLane, instance);
      push(ctx, { type: 'REVIVED', side: exec.ownerSide, instanceId: instance.instanceId, cardId: exec.deathCardId, name: getCard(exec.deathCardId).name, lane: exec.selfLane, power: instance.power, graveyardIndex: idx });
      return;
    }
    case 'PLAYER_DAMAGE':
      dealDirectDamage(ctx, opposite(exec.ownerSide), action.amount, exec.sourceName);
      return;
    case 'PLAYER_HEAL':
      healPlayer(ctx, exec.ownerSide, action.amount, exec.sourceName);
      return;
    case 'DEBUFF_ALL_OTHERS': {
      const immunity: ImmunityKind = exec.sourceKind === 'spell' ? 'SPELL' : 'HERO_EFFECT';
      const hostile = action.amount < 0;
      for (const side of ['player', 'enemy'] as Side[]) {
        for (const { lane, hero } of livingHeroes(ctx, side)) {
          if (hero.instanceId === exec.selfInstanceId) continue;
          if (hostile && blockedByImmunity(ctx, side, lane, immunity)) {
            push(ctx, { type: 'IMMUNITY_BLOCKED', side, lane, immunity, sourceName: exec.sourceName });
            continue;
          }
          changeHeroPower(ctx, side, lane, action.amount, action.duration, exec.sourceName);
        }
      }
      return;
    }
    case 'DRAW_CARDS': {
      const p = playerOf(ctx, exec.ownerSide);
      for (let i = 0; i < action.count; i++) {
        const cardId = p.deck.shift();
        if (cardId === undefined) return; // empty Deck: stop quietly, never a loss condition
        const handId = `hand-${exec.ownerSide}-draw-r${ctx.state.round}-e${ctx.events.length}-${cardId}`;
        p.hand.push({ handId, cardId });
        push(ctx, { type: 'CARD_DRAWN', side: exec.ownerSide, cardId, cardName: getCard(cardId).name, handId });
      }
      return;
    }
    case 'PREVENT_NEXT_DAMAGE': {
      const p = playerOf(ctx, exec.ownerSide);
      p.barrier = (p.barrier ?? 0) + action.count;
      return;
    }
    case 'STALL_COMBAT': {
      const locs = filterHostileTargets(ctx, exec, action, resolveTargetLocations(ctx, exec, action.target));
      for (const loc of locs) {
        const hero = getHero(ctx, loc.side, loc.lane);
        if (!hero || hero.stalled) continue;
        hero.stalled = true;
        push(ctx, { type: 'COMBAT_STALLED', side: loc.side, instanceId: hero.instanceId, name: hero.name, lane: loc.lane });
      }
      return;
    }
    case 'SUMMON_TOKEN': {
      let remaining = action.count;
      for (const lane of LANES) {
        if (remaining <= 0) break;
        if (getHero(ctx, exec.ownerSide, lane) !== null) continue; // tokens only ever fill EMPTY lanes
        const token = makeHeroInstance(exec.ownerSide, lane, ctx.state.round, action.tokenId);
        token.instanceId = `t-${exec.ownerSide}-${lane}-r${ctx.state.round}-e${ctx.events.length}`;
        token.token = true;
        setHero(ctx, exec.ownerSide, lane, token);
        push(ctx, { type: 'TOKEN_SUMMONED', side: exec.ownerSide, instanceId: token.instanceId, cardId: token.cardId, name: token.name, lane, power: token.power });
        remaining--;
      }
      return;
    }
    case 'GRANT_BYPASS':
    case 'SPELL_ECHO':
      // PASSIVE-trigger only - read live by bypassReductionFor()/spellEchoSource(), never dispatched.
      return;
    case 'EXILE_FROM_GRAVEYARD': {
      const foeSide = opposite(exec.ownerSide);
      const foe = playerOf(ctx, foeSide);
      const pick = pickEligibleFromGraveyard(foe.graveyard, Infinity, action.pick, ctx);
      if (!pick) return; // enemy Graveyard has nothing eligible - fizzles
      foe.graveyard.splice(pick.index, 1);
      push(ctx, { type: 'EXILED', side: foeSide, cardId: pick.cardId, name: getCard(pick.cardId).name, graveyardIndex: pick.index });
      return;
    }
  }
}

/**
 * A returned-to-hand card needs a fresh, unique handId - `ctx.events.length` is a deterministic,
 * strictly-increasing counter within a single resolveRound() call, so two copies of the SAME card
 * returning to hand in the SAME round (e.g. two deaths both triggering a return effect) never collide.
 * Colliding ids previously threw "Hand card used twice" the next time the AI tried to play one of them.
 */
function makeReturnHandId(ctx: Ctx, side: Side, cardId: string): string {
  return `hand-${side}-return-r${ctx.state.round}-e${ctx.events.length}-${cardId}`;
}

function pickEligibleFromGraveyard(graveyard: string[], maxPower: number, pick: GraveyardPick, ctx: Ctx, faction?: Faction, cardType: 'hero' | 'spell' = 'hero'): { cardId: string; index: number } | null {
  const eligible = graveyard
    .map((cardId, index) => ({ cardId, index, power: getCard(cardId).power ?? Infinity, faction: getCard(cardId).faction }))
    .filter((e) => getCard(e.cardId).type === cardType && e.power <= maxPower && (!faction || e.faction === faction));
  if (eligible.length === 0) return null;
  const { value, nextState } = nextRandom(ctx.rngState);
  ctx.rngState = nextState;
  if (pick === 'RANDOM') return eligible[Math.floor(value * eligible.length)];
  const target = pick === 'LOWEST_POWER' ? Math.min(...eligible.map((e) => e.power)) : Math.max(...eligible.map((e) => e.power));
  const candidates = eligible.filter((e) => e.power === target);
  return candidates[Math.floor(value * candidates.length)];
}

function executeAbilityActions(ctx: Ctx, actions: ActionDef[], exec: AbilityContext): void {
  for (const action of actions) executeAction(ctx, action, exec);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function dispatchTriggerForHero(ctx: Ctx, side: Side, lane: LaneId, trigger: Trigger, deathInfo?: { deathCardId: string; deathLane: LaneId }): void {
  const hero = getHero(ctx, side, lane);
  if (!hero || hero.silenced) return;
  const exec: AbilityContext = { ownerSide: side, sourceName: hero.name, sourceKind: 'hero', selfLane: lane, selfInstanceId: hero.instanceId, deathCardId: deathInfo?.deathCardId, deathLane: deathInfo?.deathLane };
  for (const ability of heroAbilities(ctx.state, side, hero.cardId)) {
    if (ability.trigger !== trigger) continue;
    if (ability.oncePerRound && hero.usedThisRound) continue;
    if (!evalConditions(ctx, exec, ability.conditions)) continue;
    push(ctx, { type: 'TRIGGER', side, sourceName: hero.name, trigger, label: TRIGGER_LABEL[trigger] });
    executeAbilityActions(ctx, ability.actions, exec);
    if (ability.oncePerRound) {
      hero.usedThisRound = true;
      push(ctx, { type: 'ONCE_PER_ROUND_USED', side, instanceId: hero.instanceId, zone: 'hero' });
    }
  }
}

export function dispatchTriggerForSpellZone(ctx: Ctx, side: Side, lane: LaneId, trigger: Trigger, deathInfo?: { deathCardId: string; deathLane: LaneId }): void {
  const spell = getSpellZone(ctx, side, lane);
  if (!spell) return;
  const card = getCard(spell.cardId);
  const exec: AbilityContext = {
    ownerSide: side,
    sourceName: spell.name,
    sourceKind: 'spell',
    selfLane: lane,
    selfInstanceId: spell.instanceId,
    deathCardId: deathInfo?.deathCardId,
    deathLane: deathInfo?.deathLane,
  };
  for (const ability of card.abilities) {
    if (ability.trigger !== trigger) continue;
    if (ability.oncePerRound && spell.usedThisRound) continue;
    if (!evalConditions(ctx, exec, ability.conditions)) continue;
    push(ctx, { type: 'TRIGGER', side, sourceName: spell.name, trigger, label: TRIGGER_LABEL[trigger] });
    executeAbilityActions(ctx, ability.actions, exec);
    if (ability.oncePerRound) {
      spell.usedThisRound = true;
      push(ctx, { type: 'ONCE_PER_ROUND_USED', side, instanceId: spell.instanceId, zone: 'spell' });
    }
  }
}

/** Fires `trigger` for every Hero AND every Spell zone on both boards, in a fixed lane-then-side order. */
export function dispatchTriggerForAllZones(ctx: Ctx, trigger: Trigger): void {
  for (const lane of ['left', 'center', 'right'] as LaneId[]) {
    for (const side of ['player', 'enemy'] as Side[]) {
      dispatchTriggerForHero(ctx, side, lane, trigger);
      dispatchTriggerForSpellZone(ctx, side, lane, trigger);
    }
  }
}

/** Dispatched to every living Hero right after a Spell resolves - ON_ALLY_SPELL_PLAYED to `playedSide`'s own Heroes, ON_ENEMY_SPELL_PLAYED to the opponent's. Fixed lane-then-side order, same as dispatchTriggerForAllZones. */
export function dispatchSpellPlayedTriggers(ctx: Ctx, playedSide: Side): void {
  for (const lane of ['left', 'center', 'right'] as LaneId[]) {
    for (const side of ['player', 'enemy'] as Side[]) {
      dispatchTriggerForHero(ctx, side, lane, side === playedSide ? 'ON_ALLY_SPELL_PLAYED' : 'ON_ENEMY_SPELL_PLAYED');
    }
  }
}

/** A one-time Spell's ON_PLAY, using its own placement lane as targeting context - it never occupies a zone. */
export function dispatchInstantSpellOnPlay(ctx: Ctx, side: Side, lane: LaneId, cardId: string): void {
  const card = getCard(cardId);
  const exec: AbilityContext = { ownerSide: side, sourceName: card.name, sourceKind: 'spell', selfLane: lane };
  let anyFired = false;
  // SPELL_ECHO: the first one-time Spell a side plays each round resolves twice while an echo Hero is live.
  const echoSource = spellsPlayedThisRound(ctx, side) === 0 ? spellEchoSource(ctx, side) : null;
  if (echoSource) push(ctx, { type: 'TRIGGER', side, sourceName: echoSource, trigger: 'PASSIVE', label: TRIGGER_LABEL.PASSIVE });
  for (let pass = 0; pass < (echoSource ? 2 : 1); pass++) {
    for (const ability of card.abilities) {
      if (ability.trigger !== 'ON_PLAY') continue;
      if (!evalConditions(ctx, exec, ability.conditions)) continue; // an unmet condition fizzles just this ability, same as a maxPower-gated DESTROY missing its target
      anyFired = true;
      push(ctx, { type: 'TRIGGER', side, sourceName: card.name, trigger: 'ON_PLAY', label: TRIGGER_LABEL.ON_PLAY });
      executeAbilityActions(ctx, ability.actions, exec);
    }
  }
  playerOf(ctx, side).graveyard.push(cardId); // one-time Spells always end up in the Graveyard once resolved, fizzled or not
  push(ctx, { type: 'SPELL_RESOLVED', side, lane, cardId, name: card.name, fizzled: !anyFired });
}

function dispatchDeathTriggerForDead(ctx: Ctx, dead: DeadHero, trigger: Trigger): void {
  if (dead.silenced) return; // a silenced Hero's own On Death never fires
  const exec: AbilityContext = { ownerSide: dead.side, sourceName: dead.name, sourceKind: 'hero', selfLane: dead.lane, deathCardId: dead.cardId, deathLane: dead.lane };
  for (const ability of heroAbilities(ctx.state, dead.side, dead.cardId)) {
    if (ability.trigger !== trigger) continue;
    push(ctx, { type: 'TRIGGER', side: dead.side, sourceName: dead.name, trigger, label: TRIGGER_LABEL[trigger] });
    executeAbilityActions(ctx, ability.actions, exec);
  }
}

function removeAndRecord(ctx: Ctx, side: Side, lane: LaneId): DeadHero | null {
  const hero = getHero(ctx, side, lane);
  if (!hero) return null;
  if (hero.shielded) {
    // The shield absorbs exactly one destruction attempt from ANY source (combat loss, DESTROY, a
    // Power<=0 sweep) - the Hero survives at its current Power, still occupying this lane.
    hero.shielded = false;
    push(ctx, { type: 'SHIELD_CONSUMED', side, instanceId: hero.instanceId, name: hero.name, lane });
    return null;
  }
  setHero(ctx, side, lane, null);
  if (hero.token) {
    // Tokens vanish: no Graveyard entry, no death triggers (see SUMMON_TOKEN).
    push(ctx, { type: 'HERO_DESTROYED', side, instanceId: hero.instanceId, cardId: hero.cardId, name: hero.name, lane, token: true });
    return { side, lane, instanceId: hero.instanceId, cardId: hero.cardId, name: hero.name, silenced: hero.silenced, token: true };
  }
  playerOf(ctx, side).graveyard.push(hero.cardId);
  push(ctx, { type: 'HERO_DESTROYED', side, instanceId: hero.instanceId, cardId: hero.cardId, name: hero.name, lane });
  return { side, lane, instanceId: hero.instanceId, cardId: hero.cardId, name: hero.name, silenced: hero.silenced, token: false };
}

/** Uses effective Power (base + any active Continuous Spell overlay) - the same number Combat and direct damage use. */
function findPowerZero(ctx: Ctx): { side: Side; lane: LaneId }[] {
  const out: { side: Side; lane: LaneId }[] = [];
  for (const side of ['player', 'enemy'] as Side[]) {
    for (const { lane } of livingHeroes(ctx, side)) {
      if (effectivePower(ctx.state, side, lane) <= 0) out.push({ side, lane });
    }
  }
  return out;
}

// Safety cap on the death-trigger chain below. Revival either goes to hand/deck (which requires a
// fresh Deploy action to come back) or lands on the board at positive Power (which can't immediately
// re-trigger destruction), and a destruction Shield can only ever absorb ONE attempt before it's
// consumed - none of that can loop on its own. The cap stays as a generic guardrail: only a future
// card that mis-designs a chain would ever hit it, and it fails loud (a logged event) rather than
// hanging the browser.
const MAX_CHAIN_ITERATIONS = 64;

/**
 * Removes each {side, lane} occupant, then resolves On Death / Ally Dies / Enemy Dies (Heroes AND
 * Spell zones both react) as a draining queue: every time a trigger's effect drops another Hero to
 * Power <= 0, that Hero is swept in and processed too, so chain reactions resolve correctly.
 */
export function destroyAndChain(ctx: Ctx, entries: { side: Side; lane: LaneId }[]): void {
  const queue: DeadHero[] = [];
  for (const entry of entries) {
    const dead = removeAndRecord(ctx, entry.side, entry.lane);
    if (dead) queue.push(dead);
  }

  let iterations = 0;
  while (queue.length > 0) {
    if (++iterations > MAX_CHAIN_ITERATIONS) {
      const reason = `destroyAndChain exceeded ${MAX_CHAIN_ITERATIONS} iterations - a card's death-trigger chain likely loops. Cutting short.`;
      console.warn(reason);
      push(ctx, { type: 'SAFEGUARD_TRIPPED', reason });
      return;
    }
    const dead = queue.shift()!;
    if (dead.token) continue; // a vanishing token reacts to nothing and nothing reacts to it
    const deathInfo = { deathCardId: dead.cardId, deathLane: dead.lane };
    dispatchDeathTriggerForDead(ctx, dead, 'ON_DEATH');
    for (const ally of livingHeroes(ctx, dead.side)) dispatchTriggerForHero(ctx, dead.side, ally.lane, 'ON_ALLY_DEATH', deathInfo);
    for (const foe of livingHeroes(ctx, opposite(dead.side))) dispatchTriggerForHero(ctx, opposite(dead.side), foe.lane, 'ON_ENEMY_DEATH', deathInfo);
    for (const lane of ['left', 'center', 'right'] as LaneId[]) {
      dispatchTriggerForSpellZone(ctx, dead.side, lane, 'ON_ALLY_DEATH', deathInfo);
      dispatchTriggerForSpellZone(ctx, opposite(dead.side), lane, 'ON_ENEMY_DEATH', deathInfo);
    }
    for (const coord of findPowerZero(ctx)) {
      const newDead = removeAndRecord(ctx, coord.side, coord.lane);
      if (newDead) queue.push(newDead);
    }
  }
}

/** Entry point for the destruction step: sweep every Power <= 0 Hero into the destruction/chain queue. */
export function sweepPowerZero(ctx: Ctx): void {
  destroyAndChain(ctx, findPowerZero(ctx));
}

export function makeHeroInstance(side: Side, lane: LaneId, round: number, cardId: string, ascension = 0): HeroInstance {
  const card = getCard(cardId);
  return {
    ...(ascension > 0 ? { ascension } : {}),
    instanceId: makeInstanceId('h', side, lane, round),
    cardId,
    faction: card.faction,
    name: card.name,
    shortName: card.shortName,
    power: card.power ?? 0,
    enteredRound: round,
    tempPower: 0,
    shielded: false,
    silenced: false,
    usedThisRound: false,
  };
}

export function makeSpellZoneInstance(side: Side, lane: LaneId, round: number, cardId: string) {
  const card = getCard(cardId);
  return {
    instanceId: makeInstanceId('s', side, lane, round),
    cardId,
    faction: card.faction,
    name: card.name,
    shortName: card.shortName,
    usedThisRound: false,
  };
}

export function dealDirectDamageAndTrigger(ctx: Ctx, attackerSide: Side, lane: LaneId, amount: number, sourceName: string): void {
  dealDirectDamage(ctx, opposite(attackerSide), amount, sourceName);
  dispatchTriggerForHero(ctx, attackerSide, lane, 'ON_DIRECT_DAMAGE');
}

/**
 * Combat overflow damage from a won lane - the losing side's player takes (winner Power - loser
 * Power), already reduced by the loser's own REDUCE_OVERFLOW_DAMAGE (if any - see
 * `overflowReductionFor`, applied by the caller before this is invoked). Pushes its own
 * OVERFLOW_DAMAGE event, kept distinct from DIRECT_DAMAGE (unopposed Hero/PLAYER_DAMAGE only) so the
 * UI and any future card effects can tell the two apart.
 *
 * Deliberately does NOT dispatch ON_DIRECT_DAMAGE for the winner - Flame Imp ("when this deals direct
 * damage, deal 1 extra damage") is the roster's only card on that trigger, and giving it a brand-new
 * trigger source from ordinary combat would be an implicit rebalance, not a mechanics change.
 */
export function dealOverflowDamage(ctx: Ctx, winnerSide: Side, lane: LaneId, amount: number, winner: { name: string; instanceId: string }, loser: { name: string; instanceId: string }): void {
  if (amount <= 0) return;
  const loserSide = opposite(winnerSide);
  if (absorbedByBarrier(ctx, loserSide, amount, winner.name)) return;
  const p = playerOf(ctx, loserSide);
  const from = p.hp;
  p.hp = Math.max(0, p.hp - amount);
  push(ctx, { type: 'OVERFLOW_DAMAGE', side: loserSide, lane, amount, from, to: p.hp, winnerName: winner.name, loserName: loser.name, winnerInstanceId: winner.instanceId, loserInstanceId: loser.instanceId });
}

/**
 * Would placing `card` in `lane` do anything right now? True when the card has no ON_PLAY ability (a pure
 * Continuous Spell) or at least one ON_PLAY ability's conditions currently hold. Read-only - it evaluates
 * against the given state without mutating it - and used by the AI to avoid wasting a conditional Spell.
 * Round-scoped history (Spells already played this round) isn't known at Deploy time and reads as zero.
 */
export function spellWouldFire(state: GameState, side: Side, card: { name: string; abilities: AbilityDefinition[] }, lane: LaneId): boolean {
  const onPlay = card.abilities.filter((a) => a.trigger === 'ON_PLAY');
  if (onPlay.length === 0) return true;
  const ctx: Ctx = { state, events: [], rngState: 0 };
  const exec: AbilityContext = { ownerSide: side, sourceName: card.name, sourceKind: 'spell', selfLane: lane };
  return onPlay.some((a) => evalConditions(ctx, exec, a.conditions));
}
