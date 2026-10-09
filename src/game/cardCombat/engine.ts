import type { ConditionDef, CountBasis, DeployPlay, Faction, GameEvent, GameState, GraveyardPick, HandCard, HeroInstance, LaneId, Placement, PlayerAction, PlayerState, ResolveResult, Side, SpellZoneInstance, TargetScope, Trigger } from '../types/index.js';
import { LANES, TRIGGER_LABEL, adjacentLanes } from '../types/index.js';
import { nextRandom } from '../engine/rng.js';
import { type CombatAbility, type CombatAction, type CombatCard, getCombatCard, isAttachedSpell, isCardOnlyAction, isPacify } from './cards.js';
import { ATK_PER_POWER, DEATH_LINE_ATK, GROWTH_CAP_ATK, HP_PER_LEGACY_POINT, atkFromPower, deckStartingHp, hpContribution, printedStats } from './stats.js';

// The production card-combat resolver (docs/CARD-COMBAT-DESIGN.md, Phase 1/2 of section 12).
//
// Promoted from the seeded simulator in src/game/cardSim/engine.ts, which measured every approved number,
// with the study switches that lost removed and a typed event log added. Rules, all fixed:
//   - A Unit has ATK (`HeroInstance.power` holds it) and no health. There is no Unit HP, no Unit damage and
//     no Unit healing anywhere in this file.
//   - Starting HP = the deck's summed Unit HP Contributions (stats.ts deckStartingHp, the Deck Builder's helper).
//   - 3 lanes. Opposed Units compare effective ATK: higher wins and stays unchanged, lower is destroyed.
//   - Clash Damage (ATK difference damage, approved 2026-09-29): the losing Unit's player takes winner ATK -
//     loser ATK. A blocker absorbs attacks equal to its own ATK; only the rest reaches the Player. Equal ATK
//     destroys both and deals no Player damage. Clash Damage is never negative and is never Unit damage.
//   - An unopposed Unit deals its full effective ATK to the opposing player.
//   - Each physical card copy may return from the Graveyard once per match (a returned copy is marked).
//   - Permanent effects raise a Unit at most +45 ATK above the ATK it entered with.
//   - Tokens are battle-only and never enter the Graveyard.
//   - Effects keep their legacy units in data: 1 Power step = 15 ATK, 1 legacy HP point = 45 Player HP.
//   - A player at 0 HP loses; both at 0 in the same round is a draw. Round 40 ends the match as a draw.
//   - There is no On Play timing (v4, docs/CARD-COMBAT-DESIGN.md section 18). A Unit's effects are Passive (always on while
//     it is in play, read live), Round Start, Round End, Before Combat, Destroyed or reactions; a one-time Spell's effect
//     is CAST once when it resolves. A Passive ATK aura (Royal Guard, Forest Wolf) is an overlay like a Continuous Spell's:
//     nothing is stored on the Unit, so it ends the moment its source leaves or its condition fails. A printed Shield
//     (Paladin) is read live too and used once per Unit in play.
//   - A Continuous Spell belongs to its lane, or (an Attached Spell, `spellBinding: 'UNIT'`) to the Unit it was cast
//     onto: when that Unit leaves play the Spell goes to the Graveyard with it (SPELL_EXPIRED) and the lane is free.
// Round order: Round Start -> draw to 3 -> Deploy -> Reveal -> Spells (left to right) -> Before Combat -> Combat
// -> death chains -> After Combat -> Round End -> expiry.
//
// Deterministic: every random pick draws from the match's own seeded stream (engine/rng.ts), carried in
// GameState.rngState. Same seed + same plays = same events and the same end state.

/**
 * v5 (launch set): the 116-card roster, Units-only Graveyard counts, capped counts, "would lose its lane" targeting, revive
 * into an empty lane, Attached Spell return on expiry, Grave Totem's once-per-battle return and the enemy-Spell condition.
 * Changed cards resolve differently, so a stored v4 match ends with the rules-changed notice.
 * v4 (timing cleanup): no On Play timing, Passive auras, printed Shields and Attached Spells. Several cards resolve
 * differently from v3, so a stored v2/v3 match is not continued under v4 rules (combat/resolver.ts
 * CONTINUABLE_CARD_RESOLVER_VERSIONS); it ends with the rules-changed notice instead of being silently reinterpreted.
 * v3 (combat Card Mastery removed): a match is built from the two deck lists alone and every card plays at its printed values.
 */
export const CARD_RESOLVER_VERSION = 5;
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
  /** The death this reaction answers was caused by its owner's own effect (a sacrifice). */
  deathByOwnEffect?: boolean;
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

/** Conditions an ATK aura may not use: they read ATK, which the aura itself changes. */
const ATK_READING_CONDITIONS = new Set<ConditionDef['type']>(['SELF_LOSING_LANE', 'SELF_WINNING_LANE']);

/**
 * ATK that Passive auras on the board add to the Unit at (side, lane) right now: "Adjacent allied Units have +15 ATK"
 * (Royal Guard), "Enemy Units have −15 ATK" (Infernal Lord), "While the enemy has no Unit in this lane, this Unit has
 * +30 ATK" (Forest Wolf). Read live, like a Continuous Spell: a Silenced source gives nothing, an aura ends when its
 * source leaves play, and a hostile aura does not reach a Unit that is immune to Unit effects.
 */
export function passiveAtkBonus(state: GameState, side: Side, lane: LaneId): number {
  return passiveAtkSources(state, side, lane).reduce((sum, source) => sum + source.atk, 0);
}

/** The Passive auras reaching the Unit at (side, lane) right now, one entry per source Unit (the focus panel names them). */
export function passiveAtkSources(state: GameState, side: Side, lane: LaneId): { instanceId: string; name: string; atk: number }[] {
  if (!state.cardCombat) return [];
  const ctx: Ctx = { state, events: [], rng: state.rngState };
  if (!unitAt(ctx, side, lane)) return [];
  const out: { instanceId: string; name: string; atk: number }[] = [];
  for (const srcSide of SIDES) {
    for (const { lane: srcLane, unit } of livingUnits(ctx, srcSide)) {
      if (isSilencedIn(ctx, srcSide, srcLane)) continue;
      const exec: Exec = { owner: srcSide, kind: 'hero', lane: srcLane, instanceId: unit.instanceId, name: unit.name };
      let steps = 0;
      for (const ability of getCombatCard(unit.cardId).abilities) {
        if (ability.trigger !== 'PASSIVE') continue;
        if (ability.conditions?.some((c) => ATK_READING_CONDITIONS.has(c.type))) continue;
        for (const action of ability.actions) {
          if (action.type !== 'CHANGE_POWER') continue;
          if (!locations(ctx, exec, action.target).some((l) => l.side === side && l.lane === lane)) continue;
          if (!conditionsHold(ctx, exec, ability.conditions)) continue;
          if (action.amount < 0 && srcSide !== side && hasImmunity(ctx, side, lane, 'HERO_EFFECT')) continue;
          steps += action.amount;
        }
      }
      if (steps !== 0) out.push({ instanceId: unit.instanceId, name: unit.name, atk: steps * ATK_PER_POWER });
    }
  }
  return out;
}

/** A Unit's clash ATK right now: its stored ATK plus any Continuous Spell overlay and Passive aura. 0 for an empty lane. */
export function effectiveAtk(state: GameState, side: Side, lane: LaneId): number {
  const unit = (side === 'player' ? state.player : state.enemy).heroZones[lane];
  return unit ? unit.power + continuousAtkBonus(state, side, lane) + passiveAtkBonus(state, side, lane) : 0;
}

/** Display copy of `side`'s board: every Unit's `power` is its effective ATK and `shielded` includes a printed Shield that is still ready. */
export function withEffectiveAtk(state: GameState, side: Side): PlayerState {
  const p = side === 'player' ? state.player : state.enemy;
  const heroZones = { ...p.heroZones };
  if (!state.cardCombat) return p;
  const ctx: Ctx = { state, events: [], rng: state.rngState };
  for (const lane of LANES) {
    const hero = heroZones[lane];
    if (hero) heroZones[lane] = { ...hero, power: effectiveAtk(state, side, lane), shielded: hero.shielded || printedShieldReady(ctx, side, lane) };
  }
  return { ...p, heroZones };
}

/** True when the Unit at (side, lane) is Silenced right now. */
export function isSilenced(state: GameState, side: Side, lane: LaneId): boolean {
  return !!(side === 'player' ? state.player : state.enemy).heroZones[lane]?.silenced;
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
    case 'ADJACENT_ALLIES_LOSING':
      // Shared Guard: read when the effect resolves (its Before Combat turn), with the same test as Guard's SELF_LOSING_LANE.
      return adjacentLanes(lane)
        .filter((l) => !!unitAt(ctx, exec.owner, l) && !!unitAt(ctx, opposite(exec.owner), l) && effectiveAtk(ctx.state, exec.owner, l) < effectiveAtk(ctx.state, opposite(exec.owner), l))
        .map((l) => ({ side: exec.owner, lane: l }));
    case 'OTHER_ENEMIES_WITH_LASTING_LOSS':
      return LANES.filter((l) => l !== lane && !!unitAt(ctx, opposite(exec.owner), l)?.lastingLoss).map((l) => ({ side: opposite(exec.owner), lane: l }));
  }
}

/** True when the Unit at (side, lane) is Silenced (by an effect this round). */
function isSilencedIn(ctx: Ctx, side: Side, lane: LaneId): boolean {
  return !!unitAt(ctx, side, lane)?.silenced;
}

/** Side-effect-free immunity check for auras: an always-on (not once-per-round) GRANT_IMMUNITY of `kind` whose conditions hold. */
function hasImmunity(ctx: Ctx, side: Side, lane: LaneId, kind: 'SPELL' | 'HERO_EFFECT'): boolean {
  const unit = unitAt(ctx, side, lane);
  if (!unit || unit.silenced) return false;
  const exec: Exec = { owner: side, kind: 'hero', lane, instanceId: unit.instanceId, name: unit.name };
  return getCombatCard(unit.cardId).abilities.some(
    (a) => a.trigger === 'PASSIVE' && !a.oncePerRound && a.actions.some((x) => x.type === 'GRANT_IMMUNITY' && x.immunity === kind && x.target === 'SELF') && conditionsHold(ctx, exec, a.conditions),
  );
}

/**
 * The Unit's printed Shield (a PASSIVE GRANT_SHIELD on SELF) is ready: not used yet and its conditions met. Silence does
 * not take it away: a Shield is a state the Unit carries (as a Shield granted by an effect is), not an effect it uses.
 */
function printedShieldReady(ctx: Ctx, side: Side, lane: LaneId): boolean {
  const unit = unitAt(ctx, side, lane);
  if (!unit || unit.printedShieldUsed) return false;
  const exec: Exec = { owner: side, kind: 'hero', lane, instanceId: unit.instanceId, name: unit.name };
  return getCombatCard(unit.cardId).abilities.some(
    (a) => a.trigger === 'PASSIVE' && a.actions.some((x) => x.type === 'GRANT_SHIELD' && x.target === 'SELF') && conditionsHold(ctx, exec, a.conditions),
  );
}

function passiveAbilities(ctx: Ctx, side: Side, lane: LaneId): { ability: CombatAbility; unit: HeroInstance }[] {
  const unit = unitAt(ctx, side, lane);
  if (!unit || isSilencedIn(ctx, side, lane)) return [];
  const exec: Exec = { owner: side, kind: 'hero', lane, instanceId: unit.instanceId, name: unit.name };
  return getCombatCard(unit.cardId)
    .abilities.filter((a) => a.trigger === 'PASSIVE' && conditionsHold(ctx, exec, a.conditions))
    .map((ability) => ({ ability, unit }));
}

/**
 * Display only (battle faces): for each Unit on `side`, whether each of its conditional always-on (PASSIVE) effects has
 * its condition met on this board, keyed by ability index. Reads the state, never changes it or logs anything.
 * A silenced Unit's passives are all off.
 */
export function passiveEffectStates(state: GameState, side: Side): Map<string, Map<number, boolean>> {
  const ctx: Ctx = { state, events: [], rng: state.rngState };
  const out = new Map<string, Map<number, boolean>>();
  if (!state.cardCombat) return out;
  for (const lane of LANES) {
    const unit = unitAt(ctx, side, lane);
    if (!unit) continue;
    const exec: Exec = { owner: side, kind: 'hero', lane, instanceId: unit.instanceId, name: unit.name };
    const states = new Map<number, boolean>();
    getCombatCard(unit.cardId).abilities.forEach((ability, index) => {
      if (ability.trigger !== 'PASSIVE' || !ability.conditions?.length) return;
      states.set(index, !isSilencedIn(ctx, side, lane) && conditionsHold(ctx, exec, ability.conditions));
    });
    if (states.size > 0) out.set(unit.instanceId, states);
  }
  return out;
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

/**
 * Clash Damage the losing Unit in (side, lane) takes off its player's hit, in Power steps: REDUCE_CLASH_DAMAGE and
 * the legacy name for the same line, REDUCE_OVERFLOW_DAMAGE (the simulator reads both the same way).
 */
function clashReduction(ctx: Ctx, side: Side, lane: LaneId): number {
  let steps = 0;
  for (const { ability } of passiveAbilities(ctx, side, lane)) for (const a of ability.actions) if (a.type === 'REDUCE_CLASH_DAMAGE' || a.type === 'REDUCE_OVERFLOW_DAMAGE') steps += a.amount;
  return steps * ATK_PER_POWER;
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
    case 'SPELL_ZONE_NOT_USED_THIS_BATTLE':
      return lane !== undefined && !!me.spellZones[lane] && me.spellZones[lane]!.usedThisBattle !== true;
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
    case 'GRAVEYARD_COUNT_AT_LEAST': {
      const grave = playerOf(ctx, sideOf(c.side)).graveyard;
      return (c.units ? grave.filter((id) => combat(id).type === 'hero').length : grave.length) >= c.count;
    }
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
    case 'ENEMY_SPELL_ACTIVE':
      return m.spellsThisRound[foeSide] > 0 || LANES.some((l) => !!foe.spellZones[l]);
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
    case 'DEATH_BY_OWN_EFFECT':
      return !!exec.deathCardId && !!exec.deathByOwnEffect;
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
    case 'GRAVEYARD_UNIT_COUNT':
      return playerOf(ctx, side).graveyard.filter((id) => getCombatCard(id).type === 'hero').length;
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
  else if (delta < 0) unit.lastingLoss = true;
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

/**
 * Clash Damage to the losing player: winner ATK - loser ATK, minus the losing Unit's reductions, then player-level
 * prevention (a PREVENT_NEXT_DAMAGE barrier takes the whole hit; a CLASH_SHIELD takes up to its amount). Logged as
 * one CLASH_DAMAGE event with every number a replay needs.
 */
function clashDamage(ctx: Ctx, lane: LaneId, winner: Side, atk: Record<Side, number>, destroyed: { side: Side; instanceId: string; name: string }[]): void {
  const loser = opposite(winner);
  const p = playerOf(ctx, loser);
  const raw = Math.max(0, atk[winner] - atk[loser]);
  const reduced = Math.min(raw, clashReduction(ctx, loser, lane));
  let amount = raw - reduced;
  let prevented = 0;
  if (amount > 0 && (p.barrier ?? 0) > 0) {
    p.barrier = (p.barrier ?? 0) - 1;
    prevented = amount;
    amount = 0;
  }
  const shield = meta(ctx).clashShield?.[loser] ?? 0;
  if (amount > 0 && shield > 0) {
    const absorbed = Math.min(shield, amount);
    meta(ctx).clashShield![loser] = shield - absorbed;
    prevented += absorbed;
    amount -= absorbed;
  }
  const from = p.hp;
  p.hp = Math.max(0, p.hp - amount);
  push(ctx, { type: 'CLASH_DAMAGE', lane, side: loser, winner, playerAtk: atk.player, enemyAtk: atk.enemy, destroyed, clashDamage: raw, reduced, prevented, amount: from - p.hp, from, to: p.hp });
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
function pickFromGrave(ctx: Ctx, side: Side, maxPower: number | null | undefined, pick: GraveyardPick, faction: Faction | undefined, cardType: 'hero' | 'spell', sourceName: string, onlyUnmarked = true, excludeCardId?: string): number {
  const p = playerOf(ctx, side);
  const marks = meta(ctx).graveMarks[side];
  const limit = maxPower === null || maxPower === undefined ? Infinity : maxPower;
  const matching = p.graveyard
    .map((cardId, index) => ({ cardId, index, card: getCombatCard(cardId) }))
    .filter((e) => e.card.type === cardType && e.cardId !== excludeCardId && (e.card.power ?? Infinity) <= limit && (!faction || e.card.faction === faction));
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
  if (isCardOnlyAction(action)) {
    switch (action.type) {
      case 'PACIFY':
        for (const loc of hostileFilter(ctx, exec, action, locations(ctx, exec, action.target))) {
          const unit = unitAt(ctx, loc.side, loc.lane);
          if (!unit) continue;
          unit.pacified = true;
          push(ctx, { type: 'PACIFIED', side: loc.side, instanceId: unit.instanceId, name: unit.name, lane: loc.lane });
        }
        return;
      case 'CLASH_SHIELD': {
        const m = meta(ctx);
        m.clashShield = m.clashShield ?? { player: 0, enemy: 0 };
        m.clashShield[exec.owner] += action.amount * ATK_PER_POWER;
        return;
      }
      case 'REDUCE_CLASH_DAMAGE':
        return; // read live as PASSIVE at the clash
    }
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
      let steps = countBasis(ctx, exec, action.basis, action.faction, action.tag) * action.perCount;
      // A count cap ("+15 per Unit, up to +45"): at most `max` steps from one resolution, either sign.
      if (action.max !== undefined) steps = Math.sign(steps) * Math.min(Math.abs(steps), action.max);
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
    case 'RETURN_EXPIRED_ATTACHED':
      return; // read live as PASSIVE
    case 'REDUCE_OVERFLOW_DAMAGE':
      return; // read live as PASSIVE at the clash (clashReduction)
    case 'DESTROY': {
      const targets = hostileFilter(ctx, exec, action, locations(ctx, exec, action.target)).filter((loc) => {
        if (!unitAt(ctx, loc.side, loc.lane)) return false;
        return action.maxPower === undefined || effectiveAtk(ctx.state, loc.side, loc.lane) <= atkFromPower(action.maxPower);
      });
      if (targets.length > 0) destroyAndChain(ctx, targets, exec.owner);
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
      // "Other": never a copy of the card whose effect this is (Mira cannot return Mira).
      const self = action.excludeSelf ? (exec.deathCardId ?? (exec.lane ? unitAt(ctx, exec.owner, exec.lane)?.cardId : undefined)) : undefined;
      const idx = pickFromGrave(ctx, exec.owner, action.maxPower, action.pick, action.faction, action.cardType ?? 'hero', exec.name, true, self);
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
      // Once per battle (Grave Totem): only the Spell zone's own reaction spends its battle use.
      if (zone && exec.kind === 'spell') zone.usedThisBattle = true;
      returnToHand(ctx, exec.owner, idx, zone ? exec.lane : undefined);
      return;
    }
    case 'REVIVE_TO_LANE': {
      // `emptyLane` (Morwen): the first empty Unit lane of the owner, left to right; none empty means no revive.
      const lane = action.emptyLane ? LANES.find((l) => !me.heroZones[l]) : exec.lane;
      if (lane === undefined || me.heroZones[lane]) return;
      const idx = pickFromGrave(ctx, exec.owner, action.maxPower, action.pick, action.faction, 'hero', exec.name);
      if (idx < 0) return;
      const cardId = takeFromGrave(ctx, exec.owner, idx);
      const unit = makeUnit(ctx, exec.owner, lane, cardId, { returned: true });
      me.heroZones[lane] = unit;
      push(ctx, { type: 'REVIVED', side: exec.owner, instanceId: unit.instanceId, cardId, name: unit.name, lane, power: unit.power, graveyardIndex: idx });
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

interface DeathInfo {
  cardId: string;
  lane: LaneId;
  byOwnEffect?: boolean;
}

function dispatchUnit(ctx: Ctx, side: Side, lane: LaneId, trigger: Trigger, death?: DeathInfo): void {
  const unit = unitAt(ctx, side, lane);
  if (!unit || isSilencedIn(ctx, side, lane)) return;
  runAbilities(ctx, getCombatCard(unit.cardId).abilities, trigger, { owner: side, kind: 'hero', lane, instanceId: unit.instanceId, name: unit.name, deathCardId: death?.cardId, deathLane: death?.lane, deathByOwnEffect: death?.byOwnEffect }, { holder: unit, zone: 'hero' });
}

function dispatchZone(ctx: Ctx, side: Side, lane: LaneId, trigger: Trigger, death?: DeathInfo): void {
  const zone = playerOf(ctx, side).spellZones[lane];
  if (!zone) return;
  runAbilities(ctx, getCombatCard(zone.cardId).abilities, trigger, { owner: side, kind: 'spell', lane, name: zone.name, deathCardId: death?.cardId, deathLane: death?.lane, deathByOwnEffect: death?.byOwnEffect }, { holder: zone, zone: 'spell' });
}

function dispatchAll(ctx: Ctx, trigger: Trigger, order: readonly Side[] = SIDES): void {
  for (const lane of LANES) {
    for (const side of order) {
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
  /** Its owner's own effect destroyed it (a sacrifice). */
  byOwnEffect?: boolean;
}

function removeUnit(ctx: Ctx, side: Side, lane: LaneId, silencedAtDeath?: boolean): Dead | null {
  const unit = unitAt(ctx, side, lane);
  if (!unit) return null;
  if (unit.shielded) {
    unit.shielded = false;
    push(ctx, { type: 'SHIELD_CONSUMED', side, instanceId: unit.instanceId, name: unit.name, lane });
    return null;
  }
  if (printedShieldReady(ctx, side, lane)) {
    unit.printedShieldUsed = true;
    push(ctx, { type: 'SHIELD_CONSUMED', side, instanceId: unit.instanceId, name: unit.name, lane });
    return null;
  }
  const silenced = silencedAtDeath ?? isSilencedIn(ctx, side, lane);
  const p = playerOf(ctx, side);
  p.heroZones[lane] = null;
  if (!unit.token) {
    pushGrave(ctx, side, unit.cardId, !!unit.returned);
    meta(ctx).died[side] = true;
  }
  push(ctx, { type: 'HERO_DESTROYED', side, instanceId: unit.instanceId, cardId: unit.cardId, name: unit.name, lane, ...(unit.token ? { token: true } : {}) });
  // An Attached Spell leaves play with its Unit: to the Graveyard, and the lane's Spell zone is free.
  const zone = p.spellZones[lane];
  if (zone?.boundTo === unit.instanceId) {
    p.spellZones[lane] = null;
    pushGrave(ctx, side, zone.cardId, !!zone.returned);
    push(ctx, { type: 'SPELL_EXPIRED', side, instanceId: zone.instanceId, cardId: zone.cardId, name: zone.name, lane, unitName: unit.name });
    returnExpiredAttached(ctx, side, zone);
  }
  return { side, lane, cardId: unit.cardId, name: unit.name, silenced, token: !!unit.token, marked: !!unit.returned };
}

/**
 * Saint Aveline: an Attached Spell that just expired (its Unit left play) returns from the Graveyard to its owner's hand,
 * if a living, unsilenced allied Unit carries the Passive RETURN_EXPIRED_ATTACHED and has not used it this round. Only a
 * copy that never returned before qualifies (once per physical copy per match), so it can't loop: the returned copy is
 * marked, and its next expiry leaves it in the Graveyard. Dispel (destroying the Spell) is not an expiry.
 */
function returnExpiredAttached(ctx: Ctx, side: Side, zone: SpellZoneInstance): void {
  if (zone.returned) return;
  for (const { lane, unit } of livingUnits(ctx, side)) {
    if (isSilencedIn(ctx, side, lane) || unit.usedThisRound) continue;
    if (!getCombatCard(unit.cardId).abilities.some((a) => a.trigger === 'PASSIVE' && a.actions.some((x) => x.type === 'RETURN_EXPIRED_ATTACHED'))) continue;
    const idx = playerOf(ctx, side).graveyard.lastIndexOf(zone.cardId);
    if (idx < 0 || meta(ctx).graveMarks[side][idx]) return;
    unit.usedThisRound = true;
    push(ctx, { type: 'TRIGGER', side, sourceName: unit.name, trigger: 'PASSIVE', label: TRIGGER_LABEL.PASSIVE });
    push(ctx, { type: 'ONCE_PER_ROUND_USED', side, instanceId: unit.instanceId, zone: 'hero' });
    returnToHand(ctx, side, idx);
    return;
  }
}

function belowDeathLine(ctx: Ctx): { side: Side; lane: LaneId }[] {
  const out: { side: Side; lane: LaneId }[] = [];
  for (const side of SIDES) for (const { lane } of livingUnits(ctx, side)) if (effectiveAtk(ctx.state, side, lane) <= DEATH_LINE_ATK) out.push({ side, lane });
  return out;
}

/** `cause`: the side whose effect destroys these Units (a DESTROY action); a Unit of that side dies by its own effect. */
function destroyAndChain(ctx: Ctx, entries: { side: Side; lane: LaneId }[], cause?: Side): void {
  const queue: Dead[] = [];
  // Silence is read before anything leaves.
  const silencedNow = entries.map((e) => isSilencedIn(ctx, e.side, e.lane));
  entries.forEach((e, i) => {
    const dead = removeUnit(ctx, e.side, e.lane, silencedNow[i]);
    if (dead) queue.push(cause !== undefined && dead.side === cause ? { ...dead, byOwnEffect: true } : dead);
  });
  let guard = 0;
  while (queue.length > 0) {
    if (guard++ >= 64) {
      push(ctx, { type: 'SAFEGUARD_TRIPPED', reason: 'Card combat death chain exceeded 64 steps' });
      return;
    }
    const dead = queue.shift()!;
    if (dead.token) continue; // tokens trigger no death effects
    const death: DeathInfo = { cardId: dead.cardId, lane: dead.lane, byOwnEffect: dead.byOwnEffect };
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

/**
 * Same-lane DESTROY / STALL / DESTROY_SPELL_ZONE / PACIFY Spells need something to hit (thresholds read as ATK), and an
 * Attached Spell needs your Unit in its lane: one already in play, or one in `plannedUnitLanes` (placed this round).
 */
export function cardSpellHasTarget(state: GameState, side: Side, card: CombatCard, lane: LaneId, plannedUnitLanes: Iterable<LaneId> = []): boolean {
  const foe = opposite(side);
  const zonesOf = (s: Side) => (s === 'player' ? state.player : state.enemy);
  if (isAttachedSpell(card.id) && !zonesOf(side).heroZones[lane] && ![...plannedUnitLanes].includes(lane)) return false;
  for (const ability of card.abilities) {
    if (ability.trigger !== 'CAST') continue;
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
  const plannedUnitLanes = action.plays.filter((play) => getCombatCard(play.cardId).type === 'hero').map((play) => play.lane);
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
      if (!cardSpellHasTarget(state, side, card, play.lane, plannedUnitLanes)) return { legal: false, reason: isAttachedSpell(card.id) ? `${card.name} needs your Unit in ${play.lane}` : `${card.name} has no valid target in ${play.lane}` };
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
  /**
   * A fixed Starting HP for one side in place of its deck's total: a Campaign boss's HP pool, or a challenge rule
   * such as "start at 60% of your Starting HP". Units still have no HP; this is the player's HP bar only.
   */
  startingHpOverride?: Partial<Record<Side, number>>;
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

/**
 * Builds a card-combat match through Round 1's draw. Starting HP comes from `deckStartingHp`, the Deck Builder's helper:
 * the deck's printed Unit HP Contributions. The setup carries no progression of either player, so stored Mastery /
 * Ascension ranks, Legacy Level and the like cannot reach a battle.
 */
export function createCardMatch(setup: CardMatchSetup): ResolveResult {
  const decks: Record<Side, string[]> = { player: setup.playerDeck, enemy: setup.enemyDeck };
  const hp: Record<Side, ReturnType<typeof deckStartingHp>> = { player: deckStartingHp(setup.playerDeck), enemy: deckStartingHp(setup.enemyDeck) };
  for (const side of SIDES) {
    const override = setup.startingHpOverride?.[side];
    if (override !== undefined && Number.isFinite(override) && override > 0) hp[side] = { ...hp[side], total: Math.round(override) };
  }
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
    push(ctx, { type: 'STARTING_HP', side, hp: hp[side].total, units: hp[side].units });
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
  // Attached Spells attach to the Unit in their lane as it stands after the reveal.
  for (const side of SIDES) {
    const p = playerOf(ctx, side);
    for (const lane of LANES) {
      const zone = p.spellZones[lane];
      if (zone && !zone.boundTo && isAttachedSpell(zone.cardId) && playFor(side, lane, 'spell') && p.heroZones[lane]) zone.boundTo = p.heroZones[lane]!.instanceId;
    }
  }

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
        for (let pass = 0; pass < (echo ? 2 : 1); pass++) runAbilities(ctx, card.abilities, 'CAST', exec);
        pushGrave(ctx, side, card.id, returnedHand.has(play.handId));
        m.spellsThisRound[side] += 1;
        push(ctx, { type: 'SPELL_RESOLVED', side, lane, cardId: card.id, name: card.name, fizzled: ctx.events.length === before });
      } else {
        m.spellsThisRound[side] += 1;
        const zone = playerOf(ctx, side).spellZones[lane];
        const holder = zone?.boundTo ? unitAt(ctx, side, lane) : null;
        if (zone) push(ctx, { type: 'SPELL_ENTERED', side, instanceId: zone.instanceId, cardId: card.id, name: card.name, lane, ...(holder ? { attachedTo: { instanceId: holder.instanceId, name: holder.name } } : {}) });
      }
      for (const l of LANES) for (const sd of SIDES) dispatchUnit(ctx, sd, l, sd === side ? 'ON_ALLY_SPELL_PLAYED' : 'ON_ENEMY_SPELL_PLAYED');
    }
  }
  sweep(ctx);

  // 3. Before Combat, in initiative order (ozi, 2026-09-29): the side with initiative resolves first in each
  // lane, so the last word on a close contest alternates by round instead of always going to the enemy.
  dispatchAll(ctx, 'BEFORE_COMBAT', order);

  // 4. Combat: higher effective ATK wins and stays; the loser is destroyed and its player takes the ATK
  //    difference as Clash Damage; a tie destroys both with no Player damage; an unopposed Unit hits the
  //    opposing player for its full ATK. Lanes resolve left to right; no Unit ever takes damage.
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
      const atk = { player: atkA, enemy: atkB };
      const gone = (side: Side) => {
        const unit = side === 'player' ? a : b;
        return { side, instanceId: unit.instanceId, name: unit.name };
      };
      if (atkA === atkB) {
        push(ctx, { type: 'COMBAT', lane, outcome: 'TIE', player: pInfo, enemy: eInfo });
        push(ctx, { type: 'CLASH_DAMAGE', lane, side: null, winner: 'tie', playerAtk: atkA, enemyAtk: atkB, destroyed: [gone('player'), gone('enemy')], clashDamage: 0, reduced: 0, prevented: 0, amount: 0 });
        losers.push({ side: 'player', lane }, { side: 'enemy', lane });
      } else {
        const winner: Side = atkA > atkB ? 'player' : 'enemy';
        push(ctx, { type: 'COMBAT', lane, outcome: winner === 'player' ? 'PLAYER_WINS' : 'ENEMY_WINS', player: pInfo, enemy: eInfo });
        clashDamage(ctx, lane, winner, atk, [gone(opposite(winner))]);
        losers.push({ side: opposite(winner), lane });
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

  // 5-7. After Combat, Round End, then this-round effects expire.
  dispatchAll(ctx, 'AFTER_COMBAT');
  dispatchAll(ctx, 'ROUND_END');
  delete m.clashShield;
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

  // 8. Win check: 0 HP loses (both at once is a draw); an exhausted board or the round cap is a draw.
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

/** HP Contribution one copy added to its owner's Starting HP, for Card Inspect in battle: the printed value. */
export function matchHpContribution(cardId: string): number {
  return hpContribution(getCombatCard(cardId) as never);
}
