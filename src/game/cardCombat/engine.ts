import type { ConditionDef, CountBasis, DeployPlay, Faction, GameEvent, GameState, GraveyardPick, HandCard, HeroInstance, LaneId, Placement, PlayerAction, PlayerState, ResolveResult, Side, SpellZoneInstance, TargetScope, Trigger } from '../types/index.js';
import { LANES, TRIGGER_LABEL, adjacentLanes } from '../types/index.js';
import { nextRandom } from '../engine/rng.js';
import { type CombatAbility, type CombatAction, type CombatCard, getCombatCard, isPacify } from './cards.js';
import { ATK_PER_POWER, DEATH_LINE_ATK, GROWTH_CAP_ATK, HP_PER_LEGACY_POINT, type MasteryStages, atkFromPower, deckStartingHp, hpContributionAt, printedStats } from './stats.js';

// The production card-combat resolver (docs/CARD-COMBAT-DESIGN.md, Phase 1/2 of section 12).
//
// Promoted from the seeded simulator in src/game/cardSim/engine.ts, which measured every approved number,
// with the study switches that lost removed and a typed event log added. Rules, all fixed:
//   - A Unit has ATK (`HeroInstance.power` holds it) and no health. There is no Unit HP, no Unit damage and
//     no Unit healing anywhere in this file.
//   - Starting HP = the deck's summed Unit HP Contributions (stats.ts deckStartingHp, the Deck Builder's helper).
//   - 3 lanes. Opposed Units compare effective ATK: higher wins and stays unchanged, lower is destroyed.
//     Equal ATK destroys both. No overflow: losing a clash costs the Unit, never Player HP.
//   - An unopposed Unit deals its full effective ATK to the opposing player.
//   - Each physical card copy may return from the Graveyard once per match (a returned copy is marked).
//   - Permanent effects raise a Unit at most +45 ATK above the ATK it entered with.
//   - Tokens are battle-only and never enter the Graveyard.
//   - Effects keep their legacy units in data: 1 Power step = 15 ATK, 1 legacy HP point = 45 Player HP.
//   - A player at 0 HP loses; both at 0 in the same round is a draw. Round 40 ends the match as a draw.
// Round order follows the live engine: Round Start -> draw to 3 -> Deploy -> Reveal -> Spells (left to right)
// -> Unit On Play -> Before Combat -> Combat -> death chains -> After Combat -> Round End -> expiry.
//
// Deterministic: every random pick draws from the match's own seeded stream (engine/rng.ts), carried in
// GameState.rngState. Same seed + same plays = same events and the same end state.

export const CARD_RESOLVER_VERSION = 1;
export const CARD_MAX_ROUNDS = 40;
export const CARD_HAND_TARGET = 3;

const opposite = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');
const SIDES: Side[] = ['player', 'enemy'];

interface Ctx {
  state: GameState;
  events: GameEvent[];
  rng: number;
}

interface Exec {
  owner: Side;
  kind: 'hero' | 'spell';
  lane?: LaneId;
  instanceId?: string;
  /** Card name, for the event log. */
  name: string;
  deathCardId?: string;
  deathLane?: LaneId;
  /** The dying copy had already returned once (its Graveyard entry is marked). */
  deathMarked?: boolean;
}

function playerOf(ctx: Ctx, side: Side): PlayerState {
  return side === 'player' ? ctx.state.player : ctx.state.enemy;
}

function meta(ctx: Ctx) {
  const m = ctx.state.cardCombat;
  if (!m) throw new Error('card resolver called on a match that is not a card-combat match');
  return m;
}

function push(ctx: Ctx, event: GameEvent): void {
  ctx.events.push(event);
}

function rand(ctx: Ctx): number {
  const r = nextRandom(ctx.rng);
  ctx.rng = r.nextState;
  return r.value;
}

function nextId(ctx: Ctx, kind: 'h' | 's' | 't', side: Side, lane: LaneId): string {
  const m = meta(ctx);
  m.seq += 1;
  return `${kind}-${side}-${lane}-r${ctx.state.round}-${m.seq}`;
}

// ---------------------------------------------------------------------------
// Stats and ATK
// ---------------------------------------------------------------------------

/** Printed ATK of a Unit card in card combat (tokens included). */
export function cardAtk(cardId: string): number {
  return printedStats(getCombatCard(cardId) as never)?.atk ?? 0;
}

function continuousContribution(cardId: string, target: 'ALLY_SAME_LANE' | 'ENEMY_SAME_LANE'): number {
  let total = 0;
  for (const ability of getCombatCard(cardId).abilities) {
    if (ability.trigger !== 'CONTINUOUS') continue;
    for (const action of ability.actions) if (action.type === 'CHANGE_POWER' && action.target === target) total += action.amount;
  }
  return total;
}

/** ATK a Continuous Spell overlay adds to the Unit at (side, lane) right now (Battle Banner, Burning Ground, ...). */
export function continuousAtkBonus(state: GameState, side: Side, lane: LaneId): number {
  let steps = 0;
  const own = (side === 'player' ? state.player : state.enemy).spellZones[lane];
  if (own) steps += continuousContribution(own.cardId, 'ALLY_SAME_LANE');
  const foe = (side === 'player' ? state.enemy : state.player).spellZones[lane];
  if (foe) steps += continuousContribution(foe.cardId, 'ENEMY_SAME_LANE');
  return steps * ATK_PER_POWER;
}

/** A Unit's clash ATK right now: its stored ATK plus any Continuous Spell overlay. 0 for an empty lane. */
export function effectiveAtk(state: GameState, side: Side, lane: LaneId): number {
  const unit = (side === 'player' ? state.player : state.enemy).heroZones[lane];
  return unit ? unit.power + continuousAtkBonus(state, side, lane) : 0;
}

/** Display copy of `side`'s board with every Unit's `power` replaced by its effective ATK. */
export function withEffectiveAtk(state: GameState, side: Side): PlayerState {
  const p = side === 'player' ? state.player : state.enemy;
  const heroZones = { ...p.heroZones };
  for (const lane of LANES) {
    const hero = heroZones[lane];
    if (hero) heroZones[lane] = { ...hero, power: effectiveAtk(state, side, lane) };
  }
  return { ...p, heroZones };
}

// ---------------------------------------------------------------------------
// Targets and conditions
// ---------------------------------------------------------------------------

function unitAt(ctx: Ctx, side: Side, lane: LaneId): HeroInstance | null {
  return playerOf(ctx, side).heroZones[lane];
}

function livingUnits(ctx: Ctx, side: Side): { lane: LaneId; unit: HeroInstance }[] {
  const out: { lane: LaneId; unit: HeroInstance }[] = [];
  for (const lane of LANES) {
    const unit = unitAt(ctx, side, lane);
    if (unit) out.push({ lane, unit });
  }
  return out;
}

function locations(ctx: Ctx, exec: Exec, scope: TargetScope): { side: Side; lane: LaneId }[] {
  if (exec.lane === undefined) return [];
  const lane = exec.lane;
  switch (scope) {
    case 'SELF':
    case 'ALLY_SAME_LANE':
      return [{ side: exec.owner, lane }];
    case 'ENEMY_SAME_LANE':
      return [{ side: opposite(exec.owner), lane }];
    case 'ALL_ALLIES':
      return LANES.filter((l) => unitAt(ctx, exec.owner, l)).map((l) => ({ side: exec.owner, lane: l }));
    case 'ALL_ENEMIES':
      return LANES.filter((l) => unitAt(ctx, opposite(exec.owner), l)).map((l) => ({ side: opposite(exec.owner), lane: l }));
    case 'ADJACENT_ALLIES':
      return adjacentLanes(lane).map((l) => ({ side: exec.owner, lane: l }));
    case 'ADJACENT_ENEMIES':
      return adjacentLanes(lane).map((l) => ({ side: opposite(exec.owner), lane: l }));
  }
}

function passiveAbilities(ctx: Ctx, side: Side, lane: LaneId): { ability: CombatAbility; unit: HeroInstance }[] {
  const unit = unitAt(ctx, side, lane);
  if (!unit || unit.silenced) return [];
  const exec: Exec = { owner: side, kind: 'hero', lane, instanceId: unit.instanceId, name: unit.name };
  return getCombatCard(unit.cardId)
    .abilities.filter((a) => a.trigger === 'PASSIVE' && conditionsHold(ctx, exec, a.conditions))
    .map((ability) => ({ ability, unit }));
}

function blockedByImmunity(ctx: Ctx, side: Side, lane: LaneId, kind: 'SPELL' | 'HERO_EFFECT', sourceName: string): boolean {
  for (const { ability, unit } of passiveAbilities(ctx, side, lane)) {
    if (ability.oncePerRound && unit.usedThisRound) continue;
    if (!ability.actions.some((a) => a.type === 'GRANT_IMMUNITY' && a.immunity === kind && a.target === 'SELF')) continue;
    if (ability.oncePerRound) {
      unit.usedThisRound = true;
      push(ctx, { type: 'ONCE_PER_ROUND_USED', side, instanceId: unit.instanceId, zone: 'hero' });
    }
    push(ctx, { type: 'IMMUNITY_BLOCKED', side, lane, immunity: kind, sourceName });
    return true;
  }
  return false;
}

function bypassReduction(ctx: Ctx, side: Side, lane: LaneId): number | null {
  let best: number | null = null;
  for (const { ability } of passiveAbilities(ctx, side, lane)) {
    for (const a of ability.actions) if (a.type === 'GRANT_BYPASS') best = best === null ? a.reduction : Math.min(best, a.reduction);
  }
  return best;
}

function spellEchoSource(ctx: Ctx, side: Side): string | null {
  for (const lane of LANES) {
    for (const { ability, unit } of passiveAbilities(ctx, side, lane)) if (ability.actions.some((a) => a.type === 'SPELL_ECHO')) return unit.name;
  }
  return null;
}

function isHostile(action: CombatAction): boolean {
  if (isPacify(action)) return true;
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

function hostileFilter(ctx: Ctx, exec: Exec, action: CombatAction, locs: { side: Side; lane: LaneId }[]): { side: Side; lane: LaneId }[] {
  if (!isHostile(action)) return locs;
  const kind = exec.kind === 'spell' ? 'SPELL' : 'HERO_EFFECT';
  return locs.filter((loc) => loc.side === exec.owner || !unitAt(ctx, loc.side, loc.lane) || !blockedByImmunity(ctx, loc.side, loc.lane, kind, exec.name));
}

function conditionsHold(ctx: Ctx, exec: Exec, conditions: ConditionDef[] | undefined): boolean {
  return !conditions || conditions.every((c) => conditionHolds(ctx, exec, c));
}

function conditionHolds(ctx: Ctx, exec: Exec, c: ConditionDef): boolean {
  const m = meta(ctx);
  const me = playerOf(ctx, exec.owner);
  const foeSide = opposite(exec.owner);
  const foe = playerOf(ctx, foeSide);
  const lane = exec.lane;
  const sideOf = (cs: 'SELF' | 'ENEMY' | undefined): Side => (cs === 'ENEMY' ? foeSide : exec.owner);
  const combat = (id: string) => getCombatCard(id);
  switch (c.type) {
    case 'LANE_EMPTY_ENEMY_SIDE':
      return lane !== undefined && !foe.heroZones[lane];
    case 'LANE_OCCUPIED_ENEMY_SIDE':
      return lane !== undefined && !!foe.heroZones[lane];
    case 'SELF_LANE_OCCUPIED':
      return lane !== undefined && !!me.heroZones[lane];
    case 'DEATH_IN_SELF_LANE':
      return lane !== undefined && exec.deathLane === lane;
    case 'SPELL_ZONE_NOT_USED_THIS_ROUND':
      return lane !== undefined && me.spellZones[lane]?.usedThisRound !== true;
    case 'SELF_LANE_HAS_SPELL':
      return lane !== undefined && !!me.spellZones[lane];
    case 'ENEMY_LANE_HAS_SPELL':
      return lane !== undefined && !!foe.spellZones[lane];
    case 'SELF_LOSING_LANE':
      return lane !== undefined && !!foe.heroZones[lane] && effectiveAtk(ctx.state, exec.owner, lane) < effectiveAtk(ctx.state, foeSide, lane);
    case 'SELF_WINNING_LANE':
      return lane !== undefined && !!foe.heroZones[lane] && effectiveAtk(ctx.state, exec.owner, lane) > effectiveAtk(ctx.state, foeSide, lane);
    case 'ALLY_FACTION_PRESENT':
      return livingUnits(ctx, exec.owner).some(({ unit }) => unit.instanceId !== exec.instanceId && combat(unit.cardId).faction === c.faction);
    case 'ALLY_TAG_PRESENT':
      return livingUnits(ctx, exec.owner).some(({ unit }) => unit.instanceId !== exec.instanceId && combat(unit.cardId).tags.includes(c.tag));
    case 'ENEMY_FACTION_PRESENT':
      return livingUnits(ctx, foeSide).some(({ unit }) => combat(unit.cardId).faction === c.faction);
    case 'ENEMY_TAG_PRESENT':
      return livingUnits(ctx, foeSide).some(({ unit }) => combat(unit.cardId).tags.includes(c.tag));
    case 'ADJACENT_ALLY_PRESENT':
      return lane !== undefined && adjacentLanes(lane).some((l) => !!me.heroZones[l]);
    case 'ALLY_HERO_COUNT_AT_LEAST':
      return livingUnits(ctx, exec.owner).length >= c.count;
    case 'ALLY_FACTION_COUNT_AT_LEAST':
      return livingUnits(ctx, exec.owner).filter(({ unit }) => combat(unit.cardId).faction === c.faction).length >= c.count;
    case 'GRAVEYARD_COUNT_AT_LEAST':
      return playerOf(ctx, sideOf(c.side)).graveyard.length >= c.count;
    case 'GRAVEYARD_FACTION_COUNT_AT_LEAST':
      return playerOf(ctx, sideOf(c.side)).graveyard.filter((id) => combat(id).faction === c.faction).length >= c.count;
    case 'HAND_SIZE_AT_LEAST':
      return me.hand.length >= c.count;
    case 'HAND_SIZE_AT_MOST':
      return me.hand.length <= c.count;
    case 'ALLY_DIED_THIS_ROUND':
      return m.died[exec.owner];
    case 'ENEMY_DIED_THIS_ROUND':
      return m.died[foeSide];
    case 'SPELL_PLAYED_THIS_ROUND':
      return m.spellsThisRound[sideOf(c.side)] > 0;
    case 'CONTINUOUS_SPELL_DESTROYED_THIS_ROUND':
      return m.contDestroyed[sideOf(c.side)];
    case 'SPELLS_PLAYED_THIS_ROUND_AT_LEAST':
      return m.spellsThisRound[sideOf(c.side)] >= c.count;
    case 'SPELL_ZONES_OCCUPIED_AT_LEAST':
      return LANES.filter((l) => playerOf(ctx, sideOf(c.side)).spellZones[l]).length >= c.count;
    case 'SPELL_ZONES_OCCUPIED_AT_MOST':
      return LANES.filter((l) => playerOf(ctx, sideOf(c.side)).spellZones[l]).length <= c.count;
    case 'ENEMY_HERO_COUNT_HIGHER':
      return livingUnits(ctx, foeSide).length > livingUnits(ctx, exec.owner).length;
    case 'SELF_ENTERED_EARLIER': {
      const unit = lane !== undefined ? me.heroZones[lane] : null;
      return !!unit && (unit.enteredRound ?? ctx.state.round) < ctx.state.round;
    }
    case 'DEAD_HERO_HAS_TAG':
      return !!exec.deathCardId && combat(exec.deathCardId).tags.includes(c.tag);
    default:
      return true;
  }
}

function countBasis(ctx: Ctx, exec: Exec, basis: CountBasis, faction: Faction | undefined, tag: string | undefined): number {
  const side = exec.owner;
  switch (basis) {
    case 'ALLY_HERO_COUNT':
      return livingUnits(ctx, side).length;
    case 'ALLY_FACTION_HERO_COUNT':
      return livingUnits(ctx, side).filter(({ unit }) => getCombatCard(unit.cardId).faction === faction).length;
    case 'GRAVEYARD_COUNT':
      return playerOf(ctx, side).graveyard.length;
    case 'GRAVEYARD_FACTION_COUNT':
      return playerOf(ctx, side).graveyard.filter((id) => getCombatCard(id).faction === faction).length;
    case 'OTHER_ALLY_TAG_COUNT':
      return livingUnits(ctx, side).filter(({ unit }) => unit.instanceId !== exec.instanceId && !!tag && getCombatCard(unit.cardId).tags.includes(tag)).length;
    case 'ADJACENT_ALLY_TAG_COUNT':
      return exec.lane === undefined
        ? 0
        : adjacentLanes(exec.lane).filter((l) => {
            const unit = unitAt(ctx, side, l);
            return !!unit && !!tag && getCombatCard(unit.cardId).tags.includes(tag);
          }).length;
  }
}

// ---------------------------------------------------------------------------
// State changes (each one logs its event)
// ---------------------------------------------------------------------------

function changeAtk(ctx: Ctx, side: Side, lane: LaneId, delta: number, duration: 'PERMANENT' | 'UNTIL_ROUND_END', reason: string): void {
  const unit = unitAt(ctx, side, lane);
  if (!unit) return;
  if (duration === 'PERMANENT' && delta > 0) {
    // Growth cap: permanent gains stop at +45 above the ATK this Unit entered with.
    const entry = unit.entryAtk ?? unit.power - unit.tempPower;
    const room = Math.max(0, entry + GROWTH_CAP_ATK - (unit.power - unit.tempPower));
    if (delta > room) delta = room;
  }
  if (delta === 0) return;
  const from = unit.power;
  unit.power += delta;
  if (duration === 'UNTIL_ROUND_END') unit.tempPower += delta;
  push(ctx, { type: 'POWER_CHANGED', side, instanceId: unit.instanceId, name: unit.name, from, to: unit.power, reason, permanent: duration === 'PERMANENT' });
}

function damagePlayer(ctx: Ctx, target: Side, amount: number, sourceName: string): boolean {
  const p = playerOf(ctx, target);
  if (amount <= 0) return false;
  if ((p.barrier ?? 0) > 0) {
    p.barrier = (p.barrier ?? 0) - 1;
    push(ctx, { type: 'DAMAGE_PREVENTED', side: target, amount, sourceName });
    return false;
  }
  const from = p.hp;
  p.hp = Math.max(0, p.hp - amount);
  push(ctx, { type: 'DIRECT_DAMAGE', side: target, amount: from - p.hp, from, to: p.hp, sourceName });
  return true;
}

function healPlayer(ctx: Ctx, side: Side, amount: number, sourceName: string): void {
  const p = playerOf(ctx, side);
  if (p.hp <= 0) return;
  const max = p.maxHp ?? p.hp;
  const from = p.hp;
  p.hp = Math.min(max, p.hp + amount);
  if (p.hp > from) push(ctx, { type: 'HEAL', side, amount: p.hp - from, from, to: p.hp, sourceName });
}

function makeUnit(ctx: Ctx, side: Side, lane: LaneId, cardId: string, opts: { atk?: number; token?: boolean; returned?: boolean } = {}): HeroInstance {
  const card = getCombatCard(cardId);
  const atk = opts.atk ?? cardAtk(cardId);
  return {
    instanceId: nextId(ctx, opts.token ? 't' : 'h', side, lane),
    cardId,
    faction: card.faction,
    name: card.name,
    shortName: card.shortName,
    power: atk,
    tempPower: 0,
    shielded: false,
    silenced: false,
    usedThisRound: false,
    enteredRound: ctx.state.round,
    entryAtk: atk,
    ...(opts.token ? { token: true } : {}),
    ...(opts.returned ? { returned: true } : {}),
  };
}

function pushGrave(ctx: Ctx, side: Side, cardId: string, marked: boolean): void {
  playerOf(ctx, side).graveyard.push(cardId);
  meta(ctx).graveMarks[side].push(marked);
}

function takeFromGrave(ctx: Ctx, side: Side, index: number): string {
  meta(ctx).graveMarks[side].splice(index, 1);
  return playerOf(ctx, side).graveyard.splice(index, 1)[0];
}

/**
 * Picks a Graveyard copy for a return effect. Copies that already returned once are not eligible (the
 * once-per-copy rule); when the only matching copies are marked, the return is blocked and logged.
 */
function pickFromGrave(ctx: Ctx, side: Side, maxPower: number | null | undefined, pick: GraveyardPick, faction: Faction | undefined, cardType: 'hero' | 'spell', sourceName: string, onlyUnmarked = true): number {
  const p = playerOf(ctx, side);
  const marks = meta(ctx).graveMarks[side];
  const limit = maxPower === null || maxPower === undefined ? Infinity : maxPower;
  const matching = p.graveyard
    .map((cardId, index) => ({ cardId, index, card: getCombatCard(cardId) }))
    .filter((e) => e.card.type === cardType && (e.card.power ?? Infinity) <= limit && (!faction || e.card.faction === faction));
  const eligible = onlyUnmarked ? matching.filter((e) => !marks[e.index]) : matching;
  if (eligible.length === 0) {
    if (matching.length > 0) push(ctx, { type: 'RETURN_BLOCKED', side, cardId: matching[0].cardId, name: matching[0].card.name, sourceName });
    return -1;
  }
  const withAtk = eligible.map((e) => ({ ...e, atk: e.card.type === 'hero' ? cardAtk(e.cardId) : 0 }));
  const r = rand(ctx);
  if (pick === 'RANDOM') return withAtk[Math.floor(r * withAtk.length)].index;
  const target = pick === 'LOWEST_POWER' ? Math.min(...withAtk.map((e) => e.atk)) : Math.max(...withAtk.map((e) => e.atk));
  const candidates = withAtk.filter((e) => e.atk === target);
  return candidates[Math.floor(r * candidates.length)].index;
}

/** Index of the copy that just died, when it may still return (its Graveyard entry is unmarked). -1 when it can't. */
function deathSourceIndex(ctx: Ctx, exec: Exec): number {
  if (!exec.deathCardId) return -1;
  const p = playerOf(ctx, exec.owner);
  const idx = p.graveyard.lastIndexOf(exec.deathCardId);
  if (idx < 0) return -1;
  if (meta(ctx).graveMarks[exec.owner][idx]) {
    push(ctx, { type: 'RETURN_BLOCKED', side: exec.owner, cardId: exec.deathCardId, name: getCombatCard(exec.deathCardId).name, sourceName: exec.name });
    return -1;
  }
  return idx;
}

function returnToHand(ctx: Ctx, side: Side, index: number, usedSpellZoneLane?: LaneId): void {
  const p = playerOf(ctx, side);
  const m = meta(ctx);
  const cardId = takeFromGrave(ctx, side, index);
  m.seq += 1;
  const hand: HandCard = { handId: `hand-${side}-ret-r${ctx.state.round}-${m.seq}`, cardId, returned: true };
  p.hand.push(hand);
  push(ctx, { type: 'RETURNED_TO_HAND', side, cardId, name: getCombatCard(cardId).name, graveyardIndex: index, handId: hand.handId, ...(usedSpellZoneLane ? { usedSpellZoneLane } : {}) });
}

function execute(ctx: Ctx, action: CombatAction, exec: Exec): void {
  const me = playerOf(ctx, exec.owner);
  if (isPacify(action)) {
    for (const loc of hostileFilter(ctx, exec, action, locations(ctx, exec, action.target))) {
      const unit = unitAt(ctx, loc.side, loc.lane);
      if (!unit) continue;
      unit.pacified = true;
      push(ctx, { type: 'PACIFIED', side: loc.side, instanceId: unit.instanceId, name: unit.name, lane: loc.lane });
    }
    return;
  }
  switch (action.type) {
    case 'CHANGE_POWER':
      for (const loc of hostileFilter(ctx, exec, action, locations(ctx, exec, action.target))) changeAtk(ctx, loc.side, loc.lane, action.amount * ATK_PER_POWER, action.duration, exec.name);
      return;
    case 'SET_POWER':
      for (const loc of hostileFilter(ctx, exec, action, locations(ctx, exec, action.target))) {
        const unit = unitAt(ctx, loc.side, loc.lane);
        if (unit) changeAtk(ctx, loc.side, loc.lane, atkFromPower(action.value) - unit.power, action.duration, exec.name);
      }
      return;
    case 'CHANGE_POWER_BY_COUNT': {
      const steps = countBasis(ctx, exec, action.basis, action.faction, action.tag) * action.perCount;
      if (steps === 0) return;
      for (const loc of hostileFilter(ctx, exec, action, locations(ctx, exec, action.target))) changeAtk(ctx, loc.side, loc.lane, steps * ATK_PER_POWER, action.duration, exec.name);
      return;
    }
    case 'DAMAGE_HERO':
      // Fireball: there is no Unit HP in this model, so only its approved ATK branch applies (a permanent ATK loss, or "set to the Power 1 line").
      for (const loc of hostileFilter(ctx, exec, action, locations(ctx, exec, action.target))) {
        const unit = unitAt(ctx, loc.side, loc.lane);
        if (!unit) continue;
        if (action.legacyPowerSet !== undefined) changeAtk(ctx, loc.side, loc.lane, atkFromPower(action.legacyPowerSet) - unit.power, 'PERMANENT', exec.name);
        else if (action.legacyPowerChange) changeAtk(ctx, loc.side, loc.lane, -action.legacyPowerChange * ATK_PER_POWER, 'PERMANENT', exec.name);
      }
      return;
    case 'HEAL_HERO':
    case 'APPLY_COMBAT_SHIELD':
      return; // per-Unit HP actions (Combat V2 only): Units have no health in card combat
    case 'GRANT_IMMUNITY':
    case 'GRANT_BYPASS':
    case 'SPELL_ECHO':
      return; // read live as PASSIVE
    case 'REDUCE_OVERFLOW_DAMAGE':
      return; // there is no overflow damage in card combat
    case 'DESTROY': {
      const targets = hostileFilter(ctx, exec, action, locations(ctx, exec, action.target)).filter((loc) => {
        if (!unitAt(ctx, loc.side, loc.lane)) return false;
        return action.maxPower === undefined || effectiveAtk(ctx.state, loc.side, loc.lane) <= atkFromPower(action.maxPower);
      });
      if (targets.length > 0) destroyAndChain(ctx, targets);
      return;
    }
    case 'DESTROY_SPELL_ZONE':
      for (const loc of locations(ctx, exec, action.target)) {
        const zone = playerOf(ctx, loc.side).spellZones[loc.lane];
        if (!zone) continue;
        playerOf(ctx, loc.side).spellZones[loc.lane] = null;
        pushGrave(ctx, loc.side, zone.cardId, !!zone.returned);
        meta(ctx).contDestroyed[loc.side] = true;
        push(ctx, { type: 'SPELL_ZONE_DESTROYED', side: loc.side, instanceId: zone.instanceId, cardId: zone.cardId, name: zone.name, lane: loc.lane });
      }
      return;
    case 'SILENCE':
      for (const loc of hostileFilter(ctx, exec, action, locations(ctx, exec, action.target))) {
        const unit = unitAt(ctx, loc.side, loc.lane);
        if (!unit) continue;
        unit.silenced = true;
        push(ctx, { type: 'SILENCED', side: loc.side, instanceId: unit.instanceId, name: unit.name, lane: loc.lane });
      }
      return;
    case 'GRANT_SHIELD':
      for (const loc of locations(ctx, exec, action.target)) {
        const unit = unitAt(ctx, loc.side, loc.lane);
        if (!unit) continue;
        unit.shielded = true;
        push(ctx, { type: 'SHIELD_GRANTED', side: loc.side, instanceId: unit.instanceId, name: unit.name, lane: loc.lane });
      }
      return;
    case 'RETURN_TO_HAND': {
      const idx = pickFromGrave(ctx, exec.owner, action.maxPower, action.pick, action.faction, action.cardType ?? 'hero', exec.name);
      if (idx >= 0) returnToHand(ctx, exec.owner, idx);
      return;
    }
    case 'RETURN_TO_DECK': {
      const idx = deathSourceIndex(ctx, exec);
      if (idx < 0) return;
      const cardId = takeFromGrave(ctx, exec.owner, idx);
      me.deck.push(cardId);
      meta(ctx).deckMarks[exec.owner].push(true);
      push(ctx, { type: 'RETURNED_TO_DECK', side: exec.owner, cardId, name: getCombatCard(cardId).name });
      return;
    }
    case 'RETURN_DEATH_SOURCE_TO_HAND': {
      if (exec.lane === undefined) return;
      const idx = deathSourceIndex(ctx, exec);
      if (idx < 0) return;
      const zone = me.spellZones[exec.lane];
      if (zone) zone.usedThisRound = true;
      returnToHand(ctx, exec.owner, idx, zone ? exec.lane : undefined);
      return;
    }
    case 'REVIVE_TO_LANE': {
      if (exec.lane === undefined || me.heroZones[exec.lane]) return;
      const idx = pickFromGrave(ctx, exec.owner, action.maxPower, action.pick, action.faction, 'hero', exec.name);
      if (idx < 0) return;
      const cardId = takeFromGrave(ctx, exec.owner, idx);
      const unit = makeUnit(ctx, exec.owner, exec.lane, cardId, { returned: true });
      me.heroZones[exec.lane] = unit;
      push(ctx, { type: 'REVIVED', side: exec.owner, instanceId: unit.instanceId, cardId, name: unit.name, lane: exec.lane, power: unit.power, graveyardIndex: idx });
      return;
    }
    case 'REVIVE_SELF': {
      if (exec.lane === undefined || me.heroZones[exec.lane]) return;
      const idx = deathSourceIndex(ctx, exec);
      if (idx < 0) return;
      const cardId = takeFromGrave(ctx, exec.owner, idx);
      const unit = makeUnit(ctx, exec.owner, exec.lane, cardId, { atk: atkFromPower(action.power), returned: true });
      me.heroZones[exec.lane] = unit;
      push(ctx, { type: 'REVIVED', side: exec.owner, instanceId: unit.instanceId, cardId, name: unit.name, lane: exec.lane, power: unit.power, graveyardIndex: idx });
      return;
    }
    case 'PLAYER_DAMAGE':
      damagePlayer(ctx, opposite(exec.owner), Math.round(action.amount * HP_PER_LEGACY_POINT), exec.name);
      return;
    case 'PLAYER_HEAL':
      healPlayer(ctx, exec.owner, Math.round(action.amount * HP_PER_LEGACY_POINT), exec.name);
      return;
    case 'DEBUFF_ALL_OTHERS': {
      const kind = exec.kind === 'spell' ? 'SPELL' : 'HERO_EFFECT';
      for (const side of SIDES) {
        for (const { lane, unit } of livingUnits(ctx, side)) {
          if (unit.instanceId === exec.instanceId) continue;
          if (action.amount < 0 && blockedByImmunity(ctx, side, lane, kind, exec.name)) continue;
          changeAtk(ctx, side, lane, action.amount * ATK_PER_POWER, action.duration, exec.name);
        }
      }
      return;
    }
    case 'EXILE_FROM_GRAVEYARD': {
      const foeSide = opposite(exec.owner);
      const idx = pickFromGrave(ctx, foeSide, null, action.pick, undefined, 'hero', exec.name, false);
      if (idx < 0) return;
      const cardId = takeFromGrave(ctx, foeSide, idx);
      push(ctx, { type: 'EXILED', side: foeSide, cardId, name: getCombatCard(cardId).name, graveyardIndex: idx });
      return;
    }
    case 'DRAW_CARDS':
      for (let i = 0; i < action.count && me.deck.length > 0; i++) drawOne(ctx, exec.owner, 'effect');
      return;
    case 'PREVENT_NEXT_DAMAGE':
      me.barrier = (me.barrier ?? 0) + action.count;
      return;
    case 'STALL_COMBAT':
      for (const loc of hostileFilter(ctx, exec, action, locations(ctx, exec, action.target))) {
        const unit = unitAt(ctx, loc.side, loc.lane);
        if (!unit) continue;
        unit.stalled = true;
        push(ctx, { type: 'COMBAT_STALLED', side: loc.side, instanceId: unit.instanceId, name: unit.name, lane: loc.lane });
      }
      return;
    case 'SUMMON_TOKEN': {
      // Tokens are battle-only and fill empty lanes only; every token effect in the card data is once per card played or once per round.
      let remaining = action.count;
      for (const lane of LANES) {
        if (remaining <= 0) break;
        if (me.heroZones[lane]) continue;
        const token = makeUnit(ctx, exec.owner, lane, action.tokenId, { token: true });
        me.heroZones[lane] = token;
        push(ctx, { type: 'TOKEN_SUMMONED', side: exec.owner, instanceId: token.instanceId, cardId: token.cardId, name: token.name, lane, power: token.power });
        remaining--;
      }
      return;
    }
  }
}

function drawOne(ctx: Ctx, side: Side, reason: 'round' | 'effect', seq?: number): void {
  const p = playerOf(ctx, side);
  const m = meta(ctx);
  const cardId = p.deck.shift();
  const marked = m.deckMarks[side].shift() ?? false;
  if (!cardId) return;
  m.seq += 1;
  const handId = reason === 'round' ? `hand-${side}-r${ctx.state.round}-${seq ?? 0}` : `hand-${side}-draw-r${ctx.state.round}-${m.seq}`;
  p.hand.push({ handId, cardId, ...(marked ? { returned: true } : {}) });
  const name = getCombatCard(cardId).name;
  if (reason === 'round') push(ctx, { type: 'DRAW', side, cardId, cardName: name, fizzled: false });
  else push(ctx, { type: 'CARD_DRAWN', side, cardId, cardName: name, handId });
}

function runAbilities(ctx: Ctx, abilities: CombatAbility[], trigger: Trigger, exec: Exec, once?: { holder: HeroInstance | SpellZoneInstance; zone: 'hero' | 'spell' }): void {
  let announced = false;
  for (const ability of abilities) {
    if (ability.trigger !== trigger) continue;
    if (ability.oncePerRound && once?.holder.usedThisRound) continue;
    if (!conditionsHold(ctx, exec, ability.conditions)) continue;
    if (!announced) {
      push(ctx, { type: 'TRIGGER', side: exec.owner, sourceName: exec.name, trigger, label: TRIGGER_LABEL[trigger] });
      announced = true;
    }
    for (const action of ability.actions) execute(ctx, action, exec);
    if (ability.oncePerRound && once) {
      once.holder.usedThisRound = true;
      push(ctx, { type: 'ONCE_PER_ROUND_USED', side: exec.owner, instanceId: once.holder.instanceId, zone: once.zone });
    }
  }
}

function dispatchUnit(ctx: Ctx, side: Side, lane: LaneId, trigger: Trigger, death?: { cardId: string; lane: LaneId }): void {
  const unit = unitAt(ctx, side, lane);
  if (!unit || unit.silenced) return;
  runAbilities(ctx, getCombatCard(unit.cardId).abilities, trigger, { owner: side, kind: 'hero', lane, instanceId: unit.instanceId, name: unit.name, deathCardId: death?.cardId, deathLane: death?.lane }, { holder: unit, zone: 'hero' });
}

function dispatchZone(ctx: Ctx, side: Side, lane: LaneId, trigger: Trigger, death?: { cardId: string; lane: LaneId }): void {
  const zone = playerOf(ctx, side).spellZones[lane];
  if (!zone) return;
  runAbilities(ctx, getCombatCard(zone.cardId).abilities, trigger, { owner: side, kind: 'spell', lane, name: zone.name, deathCardId: death?.cardId, deathLane: death?.lane }, { holder: zone, zone: 'spell' });
}

function dispatchAll(ctx: Ctx, trigger: Trigger): void {
  for (const lane of LANES) {
    for (const side of SIDES) {
      dispatchUnit(ctx, side, lane, trigger);
      dispatchZone(ctx, side, lane, trigger);
    }
  }
}

interface Dead {
  side: Side;
  lane: LaneId;
  cardId: string;
  name: string;
  silenced: boolean;
  token: boolean;
  marked: boolean;
}

function removeUnit(ctx: Ctx, side: Side, lane: LaneId): Dead | null {
  const unit = unitAt(ctx, side, lane);
  if (!unit) return null;
  if (unit.shielded) {
    unit.shielded = false;
    push(ctx, { type: 'SHIELD_CONSUMED', side, instanceId: unit.instanceId, name: unit.name, lane });
    return null;
  }
  playerOf(ctx, side).heroZones[lane] = null;
  if (!unit.token) {
    pushGrave(ctx, side, unit.cardId, !!unit.returned);
    meta(ctx).died[side] = true;
  }
  push(ctx, { type: 'HERO_DESTROYED', side, instanceId: unit.instanceId, cardId: unit.cardId, name: unit.name, lane, ...(unit.token ? { token: true } : {}) });
  return { side, lane, cardId: unit.cardId, name: unit.name, silenced: unit.silenced, token: !!unit.token, marked: !!unit.returned };
}

function belowDeathLine(ctx: Ctx): { side: Side; lane: LaneId }[] {
  const out: { side: Side; lane: LaneId }[] = [];
  for (const side of SIDES) for (const { lane } of livingUnits(ctx, side)) if (effectiveAtk(ctx.state, side, lane) <= DEATH_LINE_ATK) out.push({ side, lane });
  return out;
}

function destroyAndChain(ctx: Ctx, entries: { side: Side; lane: LaneId }[]): void {
  const queue: Dead[] = [];
  for (const e of entries) {
    const dead = removeUnit(ctx, e.side, e.lane);
    if (dead) queue.push(dead);
  }
  let guard = 0;
  while (queue.length > 0) {
    if (guard++ >= 64) {
      push(ctx, { type: 'SAFEGUARD_TRIPPED', reason: 'Card combat death chain exceeded 64 steps' });
      return;
    }
    const dead = queue.shift()!;
    if (dead.token) continue; // tokens trigger no death effects
    const death = { cardId: dead.cardId, lane: dead.lane };
    if (!dead.silenced) runAbilities(ctx, getCombatCard(dead.cardId).abilities, 'ON_DEATH', { owner: dead.side, kind: 'hero', lane: dead.lane, name: dead.name, deathCardId: dead.cardId, deathLane: dead.lane, deathMarked: dead.marked });
    for (const { lane } of livingUnits(ctx, dead.side)) dispatchUnit(ctx, dead.side, lane, 'ON_ALLY_DEATH', death);
    for (const { lane } of livingUnits(ctx, opposite(dead.side))) dispatchUnit(ctx, opposite(dead.side), lane, 'ON_ENEMY_DEATH', death);
    for (const lane of LANES) {
      dispatchZone(ctx, dead.side, lane, 'ON_ALLY_DEATH', death);
      dispatchZone(ctx, opposite(dead.side), lane, 'ON_ENEMY_DEATH', death);
    }
    for (const loc of belowDeathLine(ctx)) {
      const more = removeUnit(ctx, loc.side, loc.lane);
      if (more) queue.push(more);
    }
  }
}

function sweep(ctx: Ctx): void {
  const low = belowDeathLine(ctx);
  if (low.length > 0) destroyAndChain(ctx, low);
}

// ---------------------------------------------------------------------------
// Legality
// ---------------------------------------------------------------------------

/** Same-lane DESTROY / STALL / DESTROY_SPELL_ZONE / PACIFY Spells need something to hit (thresholds read as ATK). */
export function cardSpellHasTarget(state: GameState, side: Side, card: CombatCard, lane: LaneId): boolean {
  const foe = opposite(side);
  const zonesOf = (s: Side) => (s === 'player' ? state.player : state.enemy);
  for (const ability of card.abilities) {
    if (ability.trigger !== 'ON_PLAY') continue;
    for (const action of ability.actions) {
      if (isPacify(action)) {
        if (action.target === 'ENEMY_SAME_LANE' && !zonesOf(foe).heroZones[lane]) return false;
        continue;
      }
      if (action.type === 'DESTROY' && (action.target === 'ENEMY_SAME_LANE' || action.target === 'ALLY_SAME_LANE')) {
        const targetSide = action.target === 'ENEMY_SAME_LANE' ? foe : side;
        if (!zonesOf(targetSide).heroZones[lane]) return false;
        if (action.maxPower !== undefined && effectiveAtk(state, targetSide, lane) > atkFromPower(action.maxPower)) return false;
      }
      if (action.type === 'STALL_COMBAT' && action.target === 'ENEMY_SAME_LANE' && !zonesOf(foe).heroZones[lane]) return false;
      if (action.type === 'DESTROY_SPELL_ZONE' && action.target === 'ENEMY_SAME_LANE' && !zonesOf(foe).spellZones[lane]) return false;
    }
  }
  return true;
}

export interface CardValidation {
  legal: boolean;
  reason?: string;
}

export function validateCardDeployment(state: GameState, side: Side, action: PlayerAction): CardValidation {
  const p = side === 'player' ? state.player : state.enemy;
  const usedHand = new Set<string>();
  const unitLanes = new Set<LaneId>();
  const spellLanes = new Set<LaneId>();
  for (const play of action.plays) {
    if (usedHand.has(play.handId)) return { legal: false, reason: `Hand card ${play.handId} used twice` };
    usedHand.add(play.handId);
    const hand = p.hand.find((h) => h.handId === play.handId);
    if (!hand || hand.cardId !== play.cardId) return { legal: false, reason: `${play.handId} is not in ${side}'s hand` };
    const card = getCombatCard(play.cardId);
    if (card.type === 'hero') {
      if (unitLanes.has(play.lane) || p.heroZones[play.lane]) return { legal: false, reason: `Unit lane ${play.lane} is taken` };
      unitLanes.add(play.lane);
    } else {
      if (spellLanes.has(play.lane)) return { legal: false, reason: `Spell lane ${play.lane} targeted twice` };
      if (card.spellKind === 'CONTINUOUS' && p.spellZones[play.lane]) return { legal: false, reason: `Spell lane ${play.lane} already holds a Continuous Spell` };
      if (!cardSpellHasTarget(state, side, card, play.lane)) return { legal: false, reason: `${card.name} has no valid target in ${play.lane}` };
      spellLanes.add(play.lane);
    }
  }
  return { legal: true };
}

// ---------------------------------------------------------------------------
// Match setup and rounds
// ---------------------------------------------------------------------------

export interface CardMatchSetup {
  seed: number;
  playerDeck: string[];
  enemyDeck: string[];
  /** Card Mastery stage per card id. Changes HP Contribution (so Starting HP) only. Omit for Mastery I. */
  playerMastery?: MasteryStages;
  enemyMastery?: MasteryStages;
}

function shuffleDeck(ctx: Ctx, cards: string[]): string[] {
  const arr = [...cards];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(ctx) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const EMPTY_ZONES = { left: null, center: null, right: null };

function playerMasteryTable(deck: string[], stages: MasteryStages | undefined): Record<string, number> {
  const table: Record<string, number> = {};
  for (const id of new Set(deck)) if (getCombatCard(id).type === 'hero') table[id] = Math.max(1, Math.min(5, Math.floor(stages?.[id] ?? 1)));
  return table;
}

/** Builds a card-combat match through Round 1's draw. Starting HP comes from `deckStartingHp`, the Deck Builder's helper. */
export function createCardMatch(setup: CardMatchSetup): ResolveResult {
  const decks: Record<Side, string[]> = { player: setup.playerDeck, enemy: setup.enemyDeck };
  const stages: Record<Side, Record<string, number>> = { player: playerMasteryTable(setup.playerDeck, setup.playerMastery), enemy: playerMasteryTable(setup.enemyDeck, setup.enemyMastery) };
  const hp: Record<Side, ReturnType<typeof deckStartingHp>> = { player: deckStartingHp(setup.playerDeck, stages.player), enemy: deckStartingHp(setup.enemyDeck, stages.enemy) };
  const shell: GameState = {
    round: 1,
    rngState: setup.seed >>> 0,
    player: { side: 'player', hp: hp.player.total, maxHp: hp.player.total, deck: [], hand: [], graveyard: [], heroZones: { ...EMPTY_ZONES }, spellZones: { ...EMPTY_ZONES } },
    enemy: { side: 'enemy', hp: hp.enemy.total, maxHp: hp.enemy.total, deck: [], hand: [], graveyard: [], heroZones: { ...EMPTY_ZONES }, spellZones: { ...EMPTY_ZONES } },
    status: 'IN_PROGRESS',
    combatModel: 'card',
    cardCombat: {
      version: CARD_RESOLVER_VERSION,
      startingHp: { player: hp.player.total, enemy: hp.enemy.total },
      masteryStage: stages,
      deckMarks: { player: [], enemy: [] },
      graveMarks: { player: [], enemy: [] },
      died: { player: false, enemy: false },
      spellsThisRound: { player: 0, enemy: 0 },
      contDestroyed: { player: false, enemy: false },
      playsThisRound: 0,
      seq: 0,
    },
  };
  const ctx: Ctx = { state: shell, events: [], rng: shell.rngState };
  for (const side of SIDES) {
    const p = playerOf(ctx, side);
    p.deck = shuffleDeck(ctx, decks[side]);
    meta(ctx).deckMarks[side] = p.deck.map(() => false);
    push(ctx, { type: 'STARTING_HP', side, hp: hp[side].total, units: hp[side].units, masteryBonus: hp[side].masteryBonus });
  }
  shell.rngState = ctx.rng;
  const begun = beginCardRound(shell);
  return { nextState: begun.nextState, events: [...ctx.events, ...begun.events] };
}

/** Start of a round: reset round flags, Round Start triggers, then each hand draws up to 3. */
export function beginCardRound(state: GameState): ResolveResult {
  const ctx: Ctx = { state: structuredClone(state), events: [], rng: state.rngState };
  const m = meta(ctx);
  push(ctx, { type: 'ROUND_START', round: ctx.state.round });
  m.died = { player: false, enemy: false };
  m.spellsThisRound = { player: 0, enemy: 0 };
  m.contDestroyed = { player: false, enemy: false };
  m.playsThisRound = 0;
  for (const side of SIDES) {
    const p = playerOf(ctx, side);
    for (const lane of LANES) {
      const zone = p.spellZones[lane];
      if (zone) zone.usedThisRound = false;
      const unit = p.heroZones[lane];
      if (unit) {
        unit.usedThisRound = false;
        unit.silenced = false;
      }
    }
  }
  dispatchAll(ctx, 'ROUND_START');
  for (const side of SIDES) {
    const p = playerOf(ctx, side);
    const missing = Math.max(0, CARD_HAND_TARGET - p.hand.length);
    for (let seq = 0; seq < missing; seq++) {
      if (p.deck.length === 0) {
        push(ctx, { type: 'DRAW', side, fizzled: true });
        continue;
      }
      drawOne(ctx, side, 'round', seq);
    }
  }
  ctx.state.rngState = ctx.rng;
  return { nextState: ctx.state, events: ctx.events };
}

/** True when nobody can do anything any more: nothing was played this round, both decks are empty and the board is clear. */
function isExhausted(ctx: Ctx): boolean {
  return meta(ctx).playsThisRound === 0 && SIDES.every((side) => playerOf(ctx, side).deck.length === 0 && LANES.every((l) => !unitAt(ctx, side, l)));
}

/**
 * Resolves one round from both sides' committed plays, through the win check. `rngState` is the stream to
 * continue from (the AI's returned state, like the legacy resolver).
 */
export function resolveCardRound(state: GameState, playerAction: PlayerAction, enemyAction: PlayerAction, rngState: number = state.rngState): ResolveResult {
  for (const [side, action] of [['player', playerAction], ['enemy', enemyAction]] as const) {
    const v = validateCardDeployment(state, side, action);
    if (!v.legal) throw new Error(`Illegal ${side} action: ${v.reason}`);
  }
  const ctx: Ctx = { state: structuredClone(state), events: [], rng: rngState };
  const m = meta(ctx);
  const round = ctx.state.round;
  const order: Side[] = round % 2 === 1 ? ['player', 'enemy'] : ['enemy', 'player'];
  const plays: Record<Side, DeployPlay[]> = { player: playerAction.plays, enemy: enemyAction.plays };
  const playFor = (side: Side, lane: LaneId, type: 'hero' | 'spell') => plays[side].find((p) => p.lane === lane && getCombatCard(p.cardId).type === type);
  const returnedHand = new Set<string>();

  // 1. Reveal
  const handRemovals: { side: Side; handId: string }[] = [];
  const placements: Placement[] = [];
  for (const side of order) {
    const p = playerOf(ctx, side);
    for (const play of plays[side]) {
      const hand = p.hand.find((h) => h.handId === play.handId)!;
      p.hand = p.hand.filter((h) => h.handId !== play.handId);
      handRemovals.push({ side, handId: play.handId });
      if (hand.returned) returnedHand.add(play.handId);
      m.playsThisRound += 1;
      const card = getCombatCard(play.cardId);
      if (card.type === 'hero') {
        const unit = makeUnit(ctx, side, play.lane, play.cardId, { returned: hand.returned });
        p.heroZones[play.lane] = unit;
        placements.push({ side, lane: play.lane, zone: 'hero', instanceId: unit.instanceId, cardId: unit.cardId, power: unit.power, ...(hand.returned ? { returned: true } : {}) });
      } else if (card.spellKind === 'CONTINUOUS') {
        const zone: SpellZoneInstance = { instanceId: nextId(ctx, 's', side, play.lane), cardId: card.id, faction: card.faction, name: card.name, shortName: card.shortName, usedThisRound: false, ...(hand.returned ? { returned: true } : {}) };
        p.spellZones[play.lane] = zone;
        placements.push({ side, lane: play.lane, zone: 'spell', instanceId: zone.instanceId, cardId: zone.cardId });
      }
    }
  }
  push(ctx, { type: 'REVEAL', handRemovals, placements });

  // 2. Spells, left to right; initiative breaks lane ties.
  for (const lane of LANES) {
    for (const side of order) {
      const play = playFor(side, lane, 'spell');
      if (!play) continue;
      const card = getCombatCard(play.cardId);
      if (card.spellKind === 'ONE_TIME') {
        const exec: Exec = { owner: side, kind: 'spell', lane, name: card.name };
        const echo = m.spellsThisRound[side] === 0 ? spellEchoSource(ctx, side) : null;
        if (echo) push(ctx, { type: 'TRIGGER', side, sourceName: echo, trigger: 'PASSIVE', label: TRIGGER_LABEL.PASSIVE });
        const before = ctx.events.length;
        for (let pass = 0; pass < (echo ? 2 : 1); pass++) runAbilities(ctx, card.abilities, 'ON_PLAY', exec);
        pushGrave(ctx, side, card.id, returnedHand.has(play.handId));
        m.spellsThisRound[side] += 1;
        push(ctx, { type: 'SPELL_RESOLVED', side, lane, cardId: card.id, name: card.name, fizzled: ctx.events.length === before });
      } else {
        m.spellsThisRound[side] += 1;
        const zone = playerOf(ctx, side).spellZones[lane];
        if (zone) push(ctx, { type: 'ON_PLAY', side, instanceId: zone.instanceId, cardId: card.id, name: card.name, lane, zone: 'spell' });
        dispatchZone(ctx, side, lane, 'ON_PLAY');
      }
      for (const l of LANES) for (const sd of SIDES) dispatchUnit(ctx, sd, l, sd === side ? 'ON_ALLY_SPELL_PLAYED' : 'ON_ENEMY_SPELL_PLAYED');
    }
  }
  sweep(ctx);

  // 3. Unit On Play
  for (const lane of LANES) {
    for (const side of order) {
      if (!playFor(side, lane, 'hero')) continue;
      const unit = unitAt(ctx, side, lane);
      if (!unit) continue;
      push(ctx, { type: 'ON_PLAY', side, instanceId: unit.instanceId, cardId: unit.cardId, name: unit.name, lane, zone: 'hero' });
      dispatchUnit(ctx, side, lane, 'ON_PLAY');
    }
  }
  sweep(ctx);

  // 4. Before Combat
  dispatchAll(ctx, 'BEFORE_COMBAT');

  // 5. Combat: higher effective ATK wins and stays; the loser is destroyed; a tie destroys both; an unopposed
  //    Unit hits the opposing player for its full ATK. No overflow, and no damage to any Unit.
  const losers: { side: Side; lane: LaneId }[] = [];
  const direct = (attacker: Side, lane: LaneId, amount: number, name: string) => {
    damagePlayer(ctx, opposite(attacker), Math.max(0, amount), name);
    dispatchUnit(ctx, attacker, lane, 'ON_DIRECT_DAMAGE');
  };
  for (const lane of LANES) {
    const a = unitAt(ctx, 'player', lane);
    const b = unitAt(ctx, 'enemy', lane);
    const atkA = effectiveAtk(ctx.state, 'player', lane);
    const atkB = effectiveAtk(ctx.state, 'enemy', lane);
    const pInfo = a ? { name: a.name, power: atkA } : null;
    const eInfo = b ? { name: b.name, power: atkB } : null;
    if (a && b && (a.stalled || b.stalled)) {
      push(ctx, { type: 'COMBAT', lane, outcome: 'STALLED', player: pInfo, enemy: eInfo });
      continue;
    }
    if (a?.pacified || b?.pacified) {
      // Stasis Field: a pacified Unit neither clashes nor hits, and the Unit facing it is held too.
      if (a && !a.pacified && !b) {
        push(ctx, { type: 'COMBAT', lane, outcome: 'PLAYER_DIRECT', player: pInfo, enemy: null });
        direct('player', lane, atkA, a.name);
      } else if (b && !b.pacified && !a) {
        push(ctx, { type: 'COMBAT', lane, outcome: 'ENEMY_DIRECT', player: null, enemy: eInfo });
        direct('enemy', lane, atkB, b.name);
      } else push(ctx, { type: 'COMBAT', lane, outcome: 'STALLED', player: pInfo, enemy: eInfo });
      continue;
    }
    if (a && b) {
      const byA = bypassReduction(ctx, 'player', lane);
      const byB = bypassReduction(ctx, 'enemy', lane);
      if (byA !== null || byB !== null) {
        if (byA !== null) {
          push(ctx, { type: 'COMBAT', lane, outcome: 'PLAYER_DIRECT', player: pInfo, enemy: eInfo, bypass: true });
          direct('player', lane, atkA - byA * ATK_PER_POWER, a.name);
        }
        if (byB !== null) {
          push(ctx, { type: 'COMBAT', lane, outcome: 'ENEMY_DIRECT', player: pInfo, enemy: eInfo, bypass: true });
          direct('enemy', lane, atkB - byB * ATK_PER_POWER, b.name);
        }
        continue;
      }
      if (atkA === atkB) {
        push(ctx, { type: 'COMBAT', lane, outcome: 'TIE', player: pInfo, enemy: eInfo });
        losers.push({ side: 'player', lane }, { side: 'enemy', lane });
      } else if (atkA > atkB) {
        push(ctx, { type: 'COMBAT', lane, outcome: 'PLAYER_WINS', player: pInfo, enemy: eInfo });
        losers.push({ side: 'enemy', lane });
      } else {
        push(ctx, { type: 'COMBAT', lane, outcome: 'ENEMY_WINS', player: pInfo, enemy: eInfo });
        losers.push({ side: 'player', lane });
      }
    } else if (a) {
      push(ctx, { type: 'COMBAT', lane, outcome: 'PLAYER_DIRECT', player: pInfo, enemy: null });
      direct('player', lane, atkA, a.name);
    } else if (b) {
      push(ctx, { type: 'COMBAT', lane, outcome: 'ENEMY_DIRECT', player: null, enemy: eInfo });
      direct('enemy', lane, atkB, b.name);
    } else push(ctx, { type: 'COMBAT', lane, outcome: 'EMPTY', player: null, enemy: null });
  }
  if (losers.length > 0) destroyAndChain(ctx, losers);

  // 6-8. After Combat, Round End, then this-round effects expire.
  dispatchAll(ctx, 'AFTER_COMBAT');
  dispatchAll(ctx, 'ROUND_END');
  for (const side of SIDES) {
    const p = playerOf(ctx, side);
    delete p.barrier;
    for (const lane of LANES) {
      const unit = p.heroZones[lane];
      if (!unit) continue;
      if (unit.tempPower !== 0) {
        const from = unit.power;
        unit.power -= unit.tempPower;
        push(ctx, { type: 'TEMP_POWER_EXPIRED', side, name: unit.name, amount: unit.tempPower });
        push(ctx, { type: 'POWER_CHANGED', side, instanceId: unit.instanceId, name: unit.name, from, to: unit.power, reason: 'Round End', permanent: false });
        unit.tempPower = 0;
      }
      delete unit.stalled;
      delete unit.pacified;
    }
  }
  sweep(ctx);
  push(ctx, { type: 'ROUND_END', round });
  ctx.state.round = round + 1;

  // 9. Win check: 0 HP loses (both at once is a draw); an exhausted board or the round cap is a draw.
  const playerDead = ctx.state.player.hp <= 0;
  const enemyDead = ctx.state.enemy.hp <= 0;
  if (playerDead || enemyDead) {
    m.endReason = 'hp';
    ctx.state.status = playerDead && enemyDead ? 'DRAW' : enemyDead ? 'PLAYER_WIN' : 'ENEMY_WIN';
    push(ctx, { type: 'MATCH_END', winner: playerDead && enemyDead ? 'draw' : enemyDead ? 'player' : 'enemy', reason: playerDead && enemyDead ? 'Both players reached 0 HP in the same round' : enemyDead ? 'Enemy HP reached 0' : 'Your HP reached 0' });
  } else if (isExhausted(ctx)) {
    m.endReason = 'exhausted';
    ctx.state.status = 'DRAW';
    push(ctx, { type: 'MATCH_END', winner: 'draw', reason: 'Both decks and the board are empty' });
  } else if (round >= CARD_MAX_ROUNDS) {
    m.endReason = 'round-cap';
    ctx.state.status = 'DRAW';
    push(ctx, { type: 'MATCH_END', winner: 'draw', reason: `Round ${CARD_MAX_ROUNDS} reached` });
  }

  ctx.state.rngState = ctx.rng;
  return { nextState: ctx.state, events: ctx.events };
}

/** HP Contribution of one copy in this match (Mastery applied), for Card Inspect in battle. */
export function matchHpContribution(state: GameState, side: Side, cardId: string): number {
  const stage = state.cardCombat?.masteryStage[side][cardId] ?? 1;
  return hpContributionAt(getCombatCard(cardId) as never, stage);
}
