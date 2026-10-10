import type { AbilityDefinition, ActionDef, CardDefinition, ConditionDef, CountBasis, Faction, GraveyardPick, TargetScope, Trigger } from '../types/index.js';
import { getCard } from './cardSource.js';
import { nextRandom } from '../engine/rng.js';
import { type CardStats, type MasterySetup, type StatModel, masteredStats, masteryEffectCharges } from './statModels.js';
import { type SimAction, asSimAction } from './simActions.js';

// Seeded, deterministic resolver for the card-combat model under test (docs/CARD-COMBAT-SIMULATION.md).
// It is a design tool, not the production resolver, and nothing in the game imports it.
//
// Rules modelled (the spec's authoritative model):
//   - A Unit has ATK. It has no health. HP Contribution only sets the owner's Starting HP.
//   - Starting HP = sum of the deck's Unit HP Contributions. Spells contribute 0.
//   - 3 lanes. Opposed Units compare ATK: higher wins and stays unchanged, lower is destroyed.
//     Equal ATK destroys both (tie rule 'both'), or neither ('none') as an alternative.
//   - An unopposed Unit deals its ATK to the opposing player.
//   - Clash Damage (ATK difference damage, approved 2026-09-29): with `clashDamage: true` the losing Unit's player
//     takes winner ATK - loser ATK. The loser's ATK is absorbed; it is Player damage, never Unit damage.
//     BASE_RULES keeps it off so the pre-2026-09-29 studies (batch 2 and 3, where a lost clash cost only the
//     Unit) stay byte-reproducible; the approved rule set is DIFFERENCE_RULES in balance/differenceDamage.ts.
// Round structure, draws, placement-as-targeting and every ability trigger/condition/action follow the live
// engine (engine/resolveRound.ts, engine/abilities.ts) so real cards are simulated as written, with their
// Power numbers converted by the stat model (see statModels.ts).

export const LANE_COUNT = 3;
export const HAND_TARGET = 3;
const LANES = [0, 1, 2] as const;
type Lane = 0 | 1 | 2;
export type SideIndex = 0 | 1;

/** 'expert' is the search pilot in ai.ts (rollouts over candidate plays); the others are single-pass heuristics. */
export type PolicyId = 'aggressive' | 'balanced' | 'defensive' | 'random' | 'expert';

export interface Rules {
  tie: 'both' | 'none';
  /** Multiplier on an unopposed Unit's ATK (1 = full ATK, the spec's baseline). */
  directScale: number;
  /** ATK difference damage: the loser's player takes winner ATK - loser ATK (minus Clash Damage reductions). */
  clashDamage: boolean;
  /** Units at or below this ATK are destroyed. 'power0' = the model's ATK for Power 0 (the legacy Power <= 0 rule). */
  deathAtk: number | 'power0';
  maxRounds: number;
  /** Times each card id may come back from the Graveyard per side per match (return to hand/deck, revive). null = unlimited, as printed. */
  recursionCap: number | null;
  /** How recursionCap is counted: 'name' (default) per card id, 'copy' per physical copy (cap x copies of that card in the deck). */
  recursionScope?: 'name' | 'copy';
  /** Most ATK a Unit can gain above the ATK it entered with from PERMANENT effects. null/undefined = unlimited, as printed. */
  growthCap?: number | null;
  /** 'persist' (default): tokens stay until destroyed. 'oneCombat': a token fades at Round End after the first Combat it was on the board for. */
  tokenLifetime?: 'persist' | 'oneCombat';
  /** Before Combat lane order: 'fixed' (default, side A first, the batch 2-3 studies) or 'initiative' (side A first on odd rounds, side B on even, the production resolver's order). */
  beforeCombatOrder?: 'fixed' | 'initiative';
}

export const BASE_RULES: Rules = { tie: 'both', directScale: 1, clashDamage: false, deathAtk: 'power0', maxRounds: 40, recursionCap: null };

export interface SideSetup {
  deck: string[];
  policy: PolicyId;
  mastery?: MasterySetup;
}

export interface MatchConfig {
  model: StatModel;
  rules: Rules;
  sides: [SideSetup, SideSetup];
  seed: number;
  /** Collect a human-readable event log (tests/debug). Off for sweeps. */
  log?: boolean;
  /** Optional shared per-card counters (outlier report). */
  cardStats?: Map<string, CardCounters>;
}

export interface CardCounters {
  played: number;
  clashWins: number;
  clashLosses: number;
  clashTies: number;
  directDamage: number;
  effectDamage: number;
  /** Clash Damage this card dealt as a clash winner. */
  clashDamage: number;
  /** Clash Damage this card absorbed as a clash loser (its ATK, plus reductions), versus an empty lane. */
  absorbed: number;
  heal: number;
}

export interface Unit {
  uid: number;
  cardId: string;
  atk: number;
  /** Portion of `atk` that expires at Round End. */
  temp: number;
  shielded: boolean;
  silenced: boolean;
  stalled: boolean;
  used: boolean;
  entered: number;
  token: boolean;
  /** Sim-only PACIFY: deals no damage this round (no clash, no direct hit). */
  pacified?: boolean;
  /** ATK on entry, the reference for Rules.growthCap. */
  baseAtk: number;
  /** A token that was on the board during a Combat (Rules.tokenLifetime 'oneCombat'). */
  fought: boolean;
}

interface ZoneSpell {
  cardId: string;
  used: boolean;
}

export interface SidePlayer {
  hp: number;
  maxHp: number;
  deck: string[];
  hand: string[];
  grave: string[];
  units: (Unit | null)[];
  spells: (ZoneSpell | null)[];
  barrier: number;
  /** Sim-only PLAYER_SHIELD: HP of damage still preventable this round. */
  shield: number;
  /** Card-combat CLASH_SHIELD: Clash Damage still preventable this round. */
  clashShield: number;
  charges: Record<string, number>;
  /** Graveyard recursions used per card id (for Rules.recursionCap). */
  returns: Record<string, number>;
  stats: Map<string, CardStats>;
}

export interface SideTotals {
  directHits: number;
  directDamage: number;
  clashDamage: number;
  effectDamage: number;
  healed: number;
  /** Damage this side's PLAYER_SHIELD / barrier prevented. */
  prevented: number;
  clashWins: number;
  unitsLost: number;
  spellsPlayed: number;
  unitsPlayed: number;
  maxHitPct: number;
  /** Rounds in which this side hit the opponent through exactly 1/2/3 open lanes. */
  openLaneRounds: [number, number, number];
  openLaneDamagePct: [number, number, number];
  /** Graveyard recursions (return to hand/deck, revive) this side made. */
  returns: number;
  /** Largest permanent ATK gain above entry ATK any of this side's Units reached. */
  peakGain: number;
  /** Times Rules.growthCap clipped a permanent gain. */
  growthClipped: number;
  tokensSummoned: number;
  /** Clashes a token of this side took part in (it blocked an enemy Unit). */
  tokenClashes: number;
  tokensFaded: number;
  /** Clash Damage this side's reductions (Guard, CLASH_SHIELD) prevented. */
  clashReduced: number;
}

export interface SimState {
  cfg: MatchConfig;
  round: number;
  rng: number;
  players: [SidePlayer, SidePlayer];
  died: [boolean, boolean];
  spellsThisRound: [number, number];
  contDestroyed: [boolean, boolean];
  uid: number;
  totals: [SideTotals, SideTotals];
  ties: number;
  clashes: number;
  lastDamage: [DamageKind | null, DamageKind | null];
  playsThisRound: number;
  /** Round in which the first deck ran out (0 = never). */
  firstDeckOut: number;
  /** False inside AI look-ahead copies: no logging, no shared counters. */
  live: boolean;
  log: string[];
}

export type DamageKind = 'direct' | 'clash' | 'effect';

export interface Play {
  cardId: string;
  lane: Lane;
}

export interface MatchResult {
  winner: SideIndex | null;
  endReason: 'hp' | 'exhausted' | 'cap';
  killShot: DamageKind | null;
  rounds: number;
  startHp: [number, number];
  endHp: [number, number];
  totals: [SideTotals, SideTotals];
  ties: number;
  clashes: number;
  /** Round in which the first deck ran out (0 = never). */
  firstDeckOut: number;
  log: string[];
}

const other = (side: SideIndex): SideIndex => (side === 0 ? 1 : 0);
const adjacent = (lane: Lane): Lane[] => (lane === 1 ? [0, 2] : [1]);

function emptyTotals(): SideTotals {
  return { directHits: 0, directDamage: 0, clashDamage: 0, effectDamage: 0, healed: 0, prevented: 0, clashWins: 0, unitsLost: 0, spellsPlayed: 0, unitsPlayed: 0, maxHitPct: 0, openLaneRounds: [0, 0, 0], openLaneDamagePct: [0, 0, 0], returns: 0, peakGain: 0, growthClipped: 0, tokensSummoned: 0, tokenClashes: 0, tokensFaded: 0, clashReduced: 0 };
}

function bumpCard(s: SimState, cardId: string, key: keyof CardCounters, amount = 1): void {
  if (!s.live || !s.cfg.cardStats) return;
  let c = s.cfg.cardStats.get(cardId);
  if (!c) {
    c = { played: 0, clashWins: 0, clashLosses: 0, clashTies: 0, directDamage: 0, effectDamage: 0, clashDamage: 0, absorbed: 0, heal: 0 };
    s.cfg.cardStats.set(cardId, c);
  }
  c[key] += amount;
}

function note(s: SimState, text: string): void {
  if (s.live && s.cfg.log) s.log.push(`R${s.round} ${text}`);
}

/** The match's own seeded stream; AI policies draw from it too, so a seed fixes the whole match. */
export function rand(s: SimState): number {
  const r = nextRandom(s.rng);
  s.rng = r.nextState;
  return r.value;
}

function shuffle<T>(s: SimState, items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function sideStatTable(model: StatModel, deck: string[], mastery?: MasterySetup): Map<string, CardStats> {
  const table = new Map<string, CardStats>();
  for (const id of new Set(deck)) {
    const card = getCard(id);
    if (card.type !== 'hero') continue;
    table.set(id, masteredStats(model.stats(card), mastery));
  }
  return table;
}

export function startingHp(model: StatModel, deck: string[], mastery?: MasterySetup): number {
  const table = sideStatTable(model, deck, mastery);
  return deck.reduce((hp, id) => hp + (table.get(id)?.hpc ?? 0), 0);
}

export function statsOf(s: SimState, side: SideIndex, cardId: string): CardStats {
  const known = s.players[side].stats.get(cardId);
  if (known) return known;
  const card = getCard(cardId);
  const computed = card.type === 'hero' ? s.cfg.model.stats(card) : { atk: 0, hpc: 0 };
  s.players[side].stats.set(cardId, computed);
  return computed;
}

function deathAtk(s: SimState): number {
  const rule = s.cfg.rules.deathAtk;
  return rule === 'power0' ? s.cfg.model.atkFromPower(0) : rule;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createSimState(cfg: MatchConfig): SimState {
  const s: SimState = {
    cfg,
    round: 1,
    rng: cfg.seed >>> 0,
    players: [null, null] as unknown as [SidePlayer, SidePlayer],
    died: [false, false],
    spellsThisRound: [0, 0],
    contDestroyed: [false, false],
    uid: 1,
    totals: [emptyTotals(), emptyTotals()],
    ties: 0,
    clashes: 0,
    lastDamage: [null, null],
    playsThisRound: 0,
    firstDeckOut: 0,
    live: true,
    log: [],
  };
  for (const side of [0, 1] as SideIndex[]) {
    const setup = cfg.sides[side];
    const stats = sideStatTable(cfg.model, setup.deck, setup.mastery);
    const hp = setup.deck.reduce((sum, id) => sum + (stats.get(id)?.hpc ?? 0), 0);
    const charges: Record<string, number> = {};
    const perCard = masteryEffectCharges(setup.mastery);
    if (perCard > 0) for (const id of stats.keys()) charges[id] = perCard;
    s.players[side] = {
      hp,
      maxHp: hp,
      deck: shuffle(s, setup.deck),
      hand: [],
      grave: [],
      units: [null, null, null],
      spells: [null, null, null],
      barrier: 0,
      shield: 0,
      clashShield: 0,
      charges,
      returns: {},
      stats,
    };
  }
  return s;
}

/** Cheap structural copy for AI look-ahead. Card stat tables and config are shared (read-only). */
export function cloneState(s: SimState): SimState {
  const copyPlayer = (p: SidePlayer): SidePlayer => ({
    ...p,
    deck: [...p.deck],
    hand: [...p.hand],
    grave: [...p.grave],
    units: p.units.map((u) => (u ? { ...u } : null)),
    spells: p.spells.map((z) => (z ? { ...z } : null)),
    charges: { ...p.charges },
    returns: { ...p.returns },
  });
  return {
    ...s,
    players: [copyPlayer(s.players[0]), copyPlayer(s.players[1])],
    died: [...s.died] as [boolean, boolean],
    spellsThisRound: [...s.spellsThisRound] as [number, number],
    contDestroyed: [...s.contDestroyed] as [boolean, boolean],
    totals: [structuredTotals(s.totals[0]), structuredTotals(s.totals[1])],
    lastDamage: [...s.lastDamage] as [DamageKind | null, DamageKind | null],
    live: false,
    log: [],
  };
}

function structuredTotals(t: SideTotals): SideTotals {
  return { ...t, openLaneRounds: [...t.openLaneRounds] as [number, number, number], openLaneDamagePct: [...t.openLaneDamagePct] as [number, number, number] };
}

// ---------------------------------------------------------------------------
// ATK
// ---------------------------------------------------------------------------

export function continuousBonus(s: SimState, side: SideIndex, lane: Lane): number {
  let bonus = 0;
  const own = s.players[side].spells[lane];
  if (own) bonus += continuousContribution(own.cardId, 'ALLY_SAME_LANE');
  const foe = s.players[other(side)].spells[lane];
  if (foe) bonus += continuousContribution(foe.cardId, 'ENEMY_SAME_LANE');
  return bonus * s.cfg.model.atkStep;
}

function continuousContribution(cardId: string, target: TargetScope): number {
  let total = 0;
  for (const ability of getCard(cardId).abilities) {
    if (ability.trigger !== 'CONTINUOUS') continue;
    for (const action of ability.actions) if (action.type === 'CHANGE_POWER' && action.target === target) total += action.amount;
  }
  return total;
}

export function effectiveAtk(s: SimState, side: SideIndex, lane: Lane): number {
  const unit = s.players[side].units[lane];
  return unit ? unit.atk + continuousBonus(s, side, lane) : 0;
}

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

interface Exec {
  owner: SideIndex;
  kind: 'hero' | 'spell';
  lane?: Lane;
  uid?: number;
  name: string;
  deathCardId?: string;
  deathLane?: Lane;
}

function locations(s: SimState, exec: Exec, scope: TargetScope): { side: SideIndex; lane: Lane }[] {
  if (exec.lane === undefined) return [];
  const lane = exec.lane;
  switch (scope) {
    case 'SELF':
    case 'ALLY_SAME_LANE':
      return [{ side: exec.owner, lane }];
    case 'ENEMY_SAME_LANE':
      return [{ side: other(exec.owner), lane }];
    case 'ALL_ALLIES':
      return LANES.filter((l) => s.players[exec.owner].units[l]).map((l) => ({ side: exec.owner, lane: l }));
    case 'ALL_ENEMIES':
      return LANES.filter((l) => s.players[other(exec.owner)].units[l]).map((l) => ({ side: other(exec.owner), lane: l }));
    case 'ADJACENT_ALLIES':
      return adjacent(lane).map((l) => ({ side: exec.owner, lane: l }));
    case 'ADJACENT_ENEMIES':
      return adjacent(lane).map((l) => ({ side: other(exec.owner), lane: l }));
    case 'ADJACENT_ALLIES_LOSING':
    case 'OTHER_ENEMIES_WITH_LASTING_LOSS':
      return []; // production card resolver only (launch set); the historical simulator never measured it
  }
}

function livingUnits(s: SimState, side: SideIndex): { lane: Lane; unit: Unit }[] {
  const out: { lane: Lane; unit: Unit }[] = [];
  for (const lane of LANES) {
    const unit = s.players[side].units[lane];
    if (unit) out.push({ lane, unit });
  }
  return out;
}

function passiveAbilities(s: SimState, side: SideIndex, lane: Lane): { ability: AbilityDefinition; exec: Exec; unit: Unit }[] {
  const unit = s.players[side].units[lane];
  if (!unit || unit.silenced) return [];
  const exec: Exec = { owner: side, kind: 'hero', lane, uid: unit.uid, name: unit.cardId };
  return getCard(unit.cardId).abilities.filter((a) => a.trigger === 'PASSIVE' && conditionsHold(s, exec, a.conditions)).map((ability) => ({ ability, exec, unit }));
}

function blockedByImmunity(s: SimState, side: SideIndex, lane: Lane, kind: 'SPELL' | 'HERO_EFFECT'): boolean {
  for (const { ability, unit } of passiveAbilities(s, side, lane)) {
    if (ability.oncePerRound && unit.used) continue;
    if (!ability.actions.some((a) => a.type === 'GRANT_IMMUNITY' && a.immunity === kind && a.target === 'SELF')) continue;
    if (ability.oncePerRound) unit.used = true;
    return true;
  }
  return false;
}

function bypassReduction(s: SimState, side: SideIndex, lane: Lane): number | null {
  let best: number | null = null;
  for (const { ability } of passiveAbilities(s, side, lane)) {
    for (const a of ability.actions) if (a.type === 'GRANT_BYPASS') best = best === null ? a.reduction : Math.min(best, a.reduction);
  }
  return best;
}

/**
 * Clash Damage the losing Unit in (side, lane) takes off its player's hit: printed REDUCE_OVERFLOW_DAMAGE lines
 * (the legacy name) and card-combat Guard (REDUCE_CLASH_DAMAGE), both in legacy Power steps.
 */
export function clashReduction(s: SimState, side: SideIndex, lane: Lane): number {
  let total = 0;
  for (const { ability } of passiveAbilities(s, side, lane)) {
    for (const a of ability.actions as { type: string; amount?: number }[]) if (a.type === 'REDUCE_OVERFLOW_DAMAGE' || a.type === 'REDUCE_CLASH_DAMAGE') total += a.amount ?? 0;
  }
  return total * s.cfg.model.atkStep;
}

function spellEcho(s: SimState, side: SideIndex): boolean {
  return LANES.some((lane) => passiveAbilities(s, side, lane).some(({ ability }) => ability.actions.some((a) => a.type === 'SPELL_ECHO')));
}

function isHostile(action: ActionDef): boolean {
  const sim = asSimAction(action);
  if (sim) return sim.type === 'PACIFY';
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

function hostileFilter(s: SimState, exec: Exec, action: ActionDef, locs: { side: SideIndex; lane: Lane }[]): { side: SideIndex; lane: Lane }[] {
  if (!isHostile(action)) return locs;
  const kind = exec.kind === 'spell' ? 'SPELL' : 'HERO_EFFECT';
  return locs.filter((loc) => loc.side === exec.owner || !blockedByImmunity(s, loc.side, loc.lane, kind));
}

function conditionsHold(s: SimState, exec: Exec, conditions: ConditionDef[] | undefined): boolean {
  return !conditions || conditions.every((c) => conditionHolds(s, exec, c));
}

function conditionHolds(s: SimState, exec: Exec, c: ConditionDef): boolean {
  const me = s.players[exec.owner];
  const foeSide = other(exec.owner);
  const foe = s.players[foeSide];
  const lane = exec.lane;
  const sideOf = (cs: 'SELF' | 'ENEMY' | undefined): SideIndex => (cs === 'ENEMY' ? foeSide : exec.owner);
  switch (c.type) {
    case 'LANE_EMPTY_ENEMY_SIDE':
      return lane !== undefined && !foe.units[lane];
    case 'LANE_OCCUPIED_ENEMY_SIDE':
      return lane !== undefined && !!foe.units[lane];
    case 'SELF_LANE_OCCUPIED':
      return lane !== undefined && !!me.units[lane];
    case 'DEATH_IN_SELF_LANE':
      return lane !== undefined && exec.deathLane === lane;
    case 'SPELL_ZONE_NOT_USED_THIS_ROUND':
      return lane !== undefined && me.spells[lane]?.used !== true;
    case 'SELF_LANE_HAS_SPELL':
      return lane !== undefined && !!me.spells[lane];
    case 'ENEMY_LANE_HAS_SPELL':
      return lane !== undefined && !!foe.spells[lane];
    case 'SELF_LOSING_LANE':
      return lane !== undefined && !!foe.units[lane] && effectiveAtk(s, exec.owner, lane) < effectiveAtk(s, foeSide, lane);
    case 'SELF_WINNING_LANE':
      return lane !== undefined && !!foe.units[lane] && effectiveAtk(s, exec.owner, lane) > effectiveAtk(s, foeSide, lane);
    case 'ALLY_FACTION_PRESENT':
      return livingUnits(s, exec.owner).some(({ unit }) => unit.uid !== exec.uid && getCard(unit.cardId).faction === c.faction);
    case 'ALLY_TAG_PRESENT':
      return livingUnits(s, exec.owner).some(({ unit }) => unit.uid !== exec.uid && getCard(unit.cardId).tags.includes(c.tag));
    case 'ENEMY_FACTION_PRESENT':
      return livingUnits(s, foeSide).some(({ unit }) => getCard(unit.cardId).faction === c.faction);
    case 'ENEMY_TAG_PRESENT':
      return livingUnits(s, foeSide).some(({ unit }) => getCard(unit.cardId).tags.includes(c.tag));
    case 'ADJACENT_ALLY_PRESENT':
      return lane !== undefined && adjacent(lane).some((l) => !!me.units[l]);
    case 'ALLY_HERO_COUNT_AT_LEAST':
      return livingUnits(s, exec.owner).length >= c.count;
    case 'ALLY_FACTION_COUNT_AT_LEAST':
      return livingUnits(s, exec.owner).filter(({ unit }) => getCard(unit.cardId).faction === c.faction).length >= c.count;
    case 'GRAVEYARD_COUNT_AT_LEAST':
      return s.players[sideOf(c.side)].grave.length >= c.count;
    case 'GRAVEYARD_FACTION_COUNT_AT_LEAST':
      return s.players[sideOf(c.side)].grave.filter((id) => getCard(id).faction === c.faction).length >= c.count;
    case 'HAND_SIZE_AT_LEAST':
      return me.hand.length >= c.count;
    case 'HAND_SIZE_AT_MOST':
      return me.hand.length <= c.count;
    case 'ALLY_DIED_THIS_ROUND':
      return s.died[exec.owner];
    case 'ENEMY_DIED_THIS_ROUND':
      return s.died[foeSide];
    case 'SPELL_PLAYED_THIS_ROUND':
      return s.spellsThisRound[sideOf(c.side)] > 0;
    case 'CONTINUOUS_SPELL_DESTROYED_THIS_ROUND':
      return s.contDestroyed[sideOf(c.side)];
    case 'SPELLS_PLAYED_THIS_ROUND_AT_LEAST':
      return s.spellsThisRound[sideOf(c.side)] >= c.count;
    case 'SPELL_ZONES_OCCUPIED_AT_LEAST':
      return s.players[sideOf(c.side)].spells.filter(Boolean).length >= c.count;
    case 'SPELL_ZONES_OCCUPIED_AT_MOST':
      return s.players[sideOf(c.side)].spells.filter(Boolean).length <= c.count;
    case 'ENEMY_HERO_COUNT_HIGHER':
      return livingUnits(s, foeSide).length > livingUnits(s, exec.owner).length;
    case 'SELF_ENTERED_EARLIER': {
      const unit = lane !== undefined ? me.units[lane] : null;
      return !!unit && unit.entered < s.round;
    }
    case 'DEAD_HERO_HAS_TAG':
      return !!exec.deathCardId && getCard(exec.deathCardId).tags.includes(c.tag);
    default:
      return true;
  }
}

function countBasis(s: SimState, exec: Exec, basis: CountBasis, faction: Faction | undefined, tag: string | undefined): number {
  const side = exec.owner;
  switch (basis) {
    case 'ALLY_HERO_COUNT':
      return livingUnits(s, side).length;
    case 'ALLY_FACTION_HERO_COUNT':
      return livingUnits(s, side).filter(({ unit }) => getCard(unit.cardId).faction === faction).length;
    case 'GRAVEYARD_COUNT':
      return s.players[side].grave.length;
    case 'GRAVEYARD_UNIT_COUNT':
      return s.players[side].grave.filter((id) => getCard(id).type === 'hero').length;
    case 'GRAVEYARD_FACTION_COUNT':
      return s.players[side].grave.filter((id) => getCard(id).faction === faction).length;
    case 'OTHER_ALLY_TAG_COUNT':
      return livingUnits(s, side).filter(({ unit }) => unit.uid !== exec.uid && !!tag && getCard(unit.cardId).tags.includes(tag)).length;
    case 'ADJACENT_ALLY_TAG_COUNT':
      return exec.lane === undefined ? 0 : adjacent(exec.lane).filter((l) => {
        const unit = s.players[side].units[l];
        return !!unit && !!tag && getCard(unit.cardId).tags.includes(tag);
      }).length;
  }
}

function changeAtk(s: SimState, side: SideIndex, lane: Lane, delta: number, duration: 'PERMANENT' | 'UNTIL_ROUND_END'): void {
  const unit = s.players[side].units[lane];
  if (!unit) return;
  const cap = s.cfg.rules.growthCap;
  if (duration === 'PERMANENT' && delta > 0 && cap !== null && cap !== undefined) {
    const room = Math.max(0, unit.baseAtk + cap - (unit.atk - unit.temp));
    if (delta > room) {
      delta = room;
      s.totals[side].growthClipped++;
    }
  }
  unit.atk += delta;
  if (duration === 'UNTIL_ROUND_END') unit.temp += delta;
  else s.totals[side].peakGain = Math.max(s.totals[side].peakGain, unit.atk - unit.temp - unit.baseAtk);
}

function setAtk(s: SimState, side: SideIndex, lane: Lane, value: number, duration: 'PERMANENT' | 'UNTIL_ROUND_END'): void {
  const unit = s.players[side].units[lane];
  if (!unit) return;
  changeAtk(s, side, lane, value - unit.atk, duration);
}

function damagePlayer(s: SimState, target: SideIndex, amount: number, kind: DamageKind, sourceCardId: string): boolean {
  const p = s.players[target];
  if (amount <= 0) return false;
  if (p.barrier > 0) {
    p.barrier -= 1;
    s.totals[target].prevented += amount;
    note(s, `${target === 0 ? 'A' : 'B'} barrier absorbs ${amount}`);
    return false;
  }
  if (kind === 'clash' && p.clashShield > 0) {
    const absorbed = Math.min(p.clashShield, amount);
    p.clashShield -= absorbed;
    s.totals[target].prevented += absorbed;
    amount -= absorbed;
    if (amount <= 0) return false;
  }
  if (p.shield > 0) {
    const absorbed = Math.min(p.shield, amount);
    p.shield -= absorbed;
    s.totals[target].prevented += absorbed;
    amount -= absorbed;
    if (amount <= 0) return false;
  }
  p.hp = Math.max(0, p.hp - amount);
  s.lastDamage[target] = kind;
  const attacker = s.totals[other(target)];
  if (kind === 'direct') attacker.directDamage += amount;
  else if (kind === 'clash') attacker.clashDamage += amount;
  else attacker.effectDamage += amount;
  if (kind === 'direct') {
    attacker.directHits += 1;
    attacker.maxHitPct = Math.max(attacker.maxHitPct, amount / p.maxHp);
    bumpCard(s, sourceCardId, 'directDamage', amount);
  } else if (kind === 'effect') bumpCard(s, sourceCardId, 'effectDamage', amount);
  else bumpCard(s, sourceCardId, 'clashDamage', amount);
  return true;
}

function healPlayer(s: SimState, side: SideIndex, amount: number, sourceCardId: string): void {
  const p = s.players[side];
  if (p.hp <= 0) return;
  const healed = Math.min(p.maxHp, p.hp + amount) - p.hp;
  p.hp += healed;
  s.totals[side].healed += healed;
  bumpCard(s, sourceCardId, 'heal', healed);
}

function makeUnit(s: SimState, side: SideIndex, cardId: string, atk?: number, token = false): Unit {
  const entry = atk ?? statsOf(s, side, cardId).atk;
  return { uid: s.uid++, cardId, atk: entry, temp: 0, shielded: false, silenced: false, stalled: false, used: false, entered: s.round, token, baseAtk: entry, fought: false };
}

function pickFromGrave(s: SimState, side: SideIndex, grave: string[], maxPower: number | null | undefined, pick: GraveyardPick, faction?: Faction, cardType: 'hero' | 'spell' = 'hero'): number {
  const limit = maxPower === null || maxPower === undefined ? Infinity : maxPower;
  const eligible = grave
    .map((cardId, index) => ({ cardId, index, card: getCard(cardId) }))
    .filter((e) => e.card.type === cardType && (e.card.power ?? Infinity) <= limit && (!faction || e.card.faction === faction))
    .map((e) => ({ ...e, atk: e.card.type === 'hero' ? statsOf(s, side, e.cardId).atk : 0 }));
  if (eligible.length === 0) return -1;
  const r = rand(s);
  if (pick === 'RANDOM') return eligible[Math.floor(r * eligible.length)].index;
  const target = pick === 'LOWEST_POWER' ? Math.min(...eligible.map((e) => e.atk)) : Math.max(...eligible.map((e) => e.atk));
  const candidates = eligible.filter((e) => e.atk === target);
  return candidates[Math.floor(r * candidates.length)].index;
}

/** Spends one Graveyard recursion for `cardId`; false when Rules.recursionCap is reached. */
function mayRecur(s: SimState, side: SideIndex, cardId: string): boolean {
  const perName = s.cfg.rules.recursionCap;
  const p = s.players[side];
  const cap = perName === null || s.cfg.rules.recursionScope !== 'copy' ? perName : perName * Math.max(1, s.cfg.sides[side].deck.filter((id) => id === cardId).length);
  if (cap !== null && (p.returns[cardId] ?? 0) >= cap) return false;
  p.returns[cardId] = (p.returns[cardId] ?? 0) + 1;
  s.totals[side].returns++;
  return true;
}

function executeSim(s: SimState, action: SimAction, exec: Exec): void {
  switch (action.type) {
    case 'PACIFY':
      for (const loc of hostileFilter(s, exec, action as unknown as ActionDef, locations(s, exec, action.target))) {
        const unit = s.players[loc.side].units[loc.lane];
        if (unit) unit.pacified = true;
      }
      return;
    case 'PLAYER_SHIELD':
      s.players[exec.owner].shield += Math.round(action.amount * s.cfg.model.hpUnit);
      return;
    case 'CLASH_SHIELD':
      s.players[exec.owner].clashShield += action.amount * s.cfg.model.atkStep;
      return;
    case 'REDUCE_CLASH_DAMAGE':
      return; // read live as PASSIVE
  }
}

function execute(s: SimState, action: ActionDef, exec: Exec): void {
  const sim = asSimAction(action);
  if (sim) return executeSim(s, sim, exec);
  const step = s.cfg.model.atkStep;
  const me = s.players[exec.owner];
  switch (action.type) {
    case 'CHANGE_POWER':
      for (const loc of hostileFilter(s, exec, action, locations(s, exec, action.target))) changeAtk(s, loc.side, loc.lane, action.amount * step, action.duration);
      return;
    case 'SET_POWER':
      for (const loc of hostileFilter(s, exec, action, locations(s, exec, action.target))) setAtk(s, loc.side, loc.lane, s.cfg.model.atkFromPower(action.value), action.duration);
      return;
    case 'CHANGE_POWER_BY_COUNT': {
      const amount = countBasis(s, exec, action.basis, action.faction, action.tag) * action.perCount;
      if (amount === 0) return;
      for (const loc of hostileFilter(s, exec, action, locations(s, exec, action.target))) changeAtk(s, loc.side, loc.lane, amount * step, action.duration);
      return;
    }
    case 'DAMAGE_HERO':
      // Fireball: the legacy engine applies its Power loss/set; the card model keeps that (there is no Unit HP).
      for (const loc of hostileFilter(s, exec, action, locations(s, exec, action.target))) {
        if (action.legacyPowerSet !== undefined) setAtk(s, loc.side, loc.lane, s.cfg.model.atkFromPower(action.legacyPowerSet), 'PERMANENT');
        else if (action.legacyPowerChange) changeAtk(s, loc.side, loc.lane, -action.legacyPowerChange * step, 'PERMANENT');
      }
      return;
    case 'HEAL_HERO':
    case 'APPLY_COMBAT_SHIELD':
    case 'GRANT_IMMUNITY':
    case 'REDUCE_OVERFLOW_DAMAGE':
    case 'GRANT_BYPASS':
    case 'SPELL_ECHO':
      return; // Unit-HP only (no-op in the card model) or read live as PASSIVE.
    case 'DESTROY': {
      const targets = hostileFilter(s, exec, action, locations(s, exec, action.target)).filter((loc) => {
        if (!s.players[loc.side].units[loc.lane]) return false;
        return action.maxPower === undefined || effectiveAtk(s, loc.side, loc.lane) <= s.cfg.model.atkFromPower(action.maxPower);
      });
      if (targets.length > 0) destroyAndChain(s, targets);
      return;
    }
    case 'DESTROY_SPELL_ZONE':
      for (const loc of locations(s, exec, action.target)) {
        const zone = s.players[loc.side].spells[loc.lane];
        if (!zone) continue;
        s.players[loc.side].spells[loc.lane] = null;
        s.players[loc.side].grave.push(zone.cardId);
        s.contDestroyed[loc.side] = true;
      }
      return;
    case 'SILENCE':
      for (const loc of hostileFilter(s, exec, action, locations(s, exec, action.target))) {
        const unit = s.players[loc.side].units[loc.lane];
        if (unit) unit.silenced = true;
      }
      return;
    case 'GRANT_SHIELD':
      for (const loc of locations(s, exec, action.target)) {
        const unit = s.players[loc.side].units[loc.lane];
        if (unit) unit.shielded = true;
      }
      return;
    case 'RETURN_TO_HAND': {
      const idx = pickFromGrave(s, exec.owner, me.grave, action.maxPower, action.pick, action.faction, action.cardType ?? 'hero');
      if (idx < 0 || !mayRecur(s, exec.owner, me.grave[idx])) return;
      me.hand.push(me.grave.splice(idx, 1)[0]);
      return;
    }
    case 'RETURN_TO_DECK': {
      if (!exec.deathCardId) return;
      const idx = me.grave.lastIndexOf(exec.deathCardId);
      if (idx < 0 || !mayRecur(s, exec.owner, exec.deathCardId)) return;
      me.grave.splice(idx, 1);
      me.deck.push(exec.deathCardId);
      return;
    }
    case 'RETURN_DEATH_SOURCE_TO_HAND': {
      if (!exec.deathCardId || exec.lane === undefined) return;
      const idx = me.grave.lastIndexOf(exec.deathCardId);
      if (idx < 0 || !mayRecur(s, exec.owner, exec.deathCardId)) return;
      me.grave.splice(idx, 1);
      me.hand.push(exec.deathCardId);
      const zone = me.spells[exec.lane];
      if (zone) zone.used = true;
      return;
    }
    case 'REVIVE_TO_LANE': {
      if (exec.lane === undefined || me.units[exec.lane]) return;
      const idx = pickFromGrave(s, exec.owner, me.grave, action.maxPower, action.pick, action.faction);
      if (idx < 0 || !mayRecur(s, exec.owner, me.grave[idx])) return;
      const cardId = me.grave.splice(idx, 1)[0];
      me.units[exec.lane] = makeUnit(s, exec.owner, cardId);
      return;
    }
    case 'REVIVE_SELF': {
      if (!exec.deathCardId || exec.lane === undefined || me.units[exec.lane]) return;
      const idx = me.grave.lastIndexOf(exec.deathCardId);
      if (idx < 0 || !mayRecur(s, exec.owner, exec.deathCardId)) return;
      me.grave.splice(idx, 1);
      me.units[exec.lane] = makeUnit(s, exec.owner, exec.deathCardId, s.cfg.model.atkFromPower(action.power));
      return;
    }
    case 'PLAYER_DAMAGE':
      damagePlayer(s, other(exec.owner), Math.round(action.amount * s.cfg.model.hpUnit), 'effect', exec.name);
      return;
    case 'PLAYER_HEAL':
      healPlayer(s, exec.owner, Math.round(action.amount * s.cfg.model.hpUnit), exec.name);
      return;
    case 'DEBUFF_ALL_OTHERS': {
      const kind = exec.kind === 'spell' ? 'SPELL' : 'HERO_EFFECT';
      for (const side of [0, 1] as SideIndex[]) {
        for (const { lane, unit } of livingUnits(s, side)) {
          if (unit.uid === exec.uid) continue;
          if (action.amount < 0 && blockedByImmunity(s, side, lane, kind)) continue;
          changeAtk(s, side, lane, action.amount * step, action.duration);
        }
      }
      return;
    }
    case 'EXILE_FROM_GRAVEYARD': {
      const foe = s.players[other(exec.owner)];
      const idx = pickFromGrave(s, other(exec.owner), foe.grave, null, action.pick);
      if (idx >= 0) foe.grave.splice(idx, 1);
      return;
    }
    case 'DRAW_CARDS':
      for (let i = 0; i < action.count && me.deck.length > 0; i++) me.hand.push(me.deck.shift()!);
      return;
    case 'PREVENT_NEXT_DAMAGE':
      me.barrier += action.count;
      return;
    case 'STALL_COMBAT':
      for (const loc of hostileFilter(s, exec, action, locations(s, exec, action.target))) {
        const unit = s.players[loc.side].units[loc.lane];
        if (unit) unit.stalled = true;
      }
      return;
    case 'SUMMON_TOKEN': {
      let remaining = action.count;
      for (const lane of LANES) {
        if (remaining <= 0) break;
        if (me.units[lane]) continue;
        me.units[lane] = makeUnit(s, exec.owner, action.tokenId, s.cfg.model.atkFromPower(getCard(action.tokenId).power ?? 2), true);
        s.totals[exec.owner].tokensSummoned++;
        remaining--;
      }
      return;
    }
  }
}

function runAbilities(s: SimState, abilities: AbilityDefinition[], trigger: Trigger, exec: Exec, onceFlag?: { used: boolean }): void {
  for (const ability of abilities) {
    if (ability.trigger !== trigger) continue;
    if (ability.oncePerRound && onceFlag?.used) continue;
    if (!conditionsHold(s, exec, ability.conditions)) continue;
    for (const action of ability.actions) execute(s, action, exec);
    if (ability.oncePerRound && onceFlag) onceFlag.used = true;
  }
}

function dispatchUnit(s: SimState, side: SideIndex, lane: Lane, trigger: Trigger, death?: { cardId: string; lane: Lane }): void {
  const unit = s.players[side].units[lane];
  if (!unit || unit.silenced) return;
  runAbilities(s, getCard(unit.cardId).abilities, trigger, { owner: side, kind: 'hero', lane, uid: unit.uid, name: unit.cardId, deathCardId: death?.cardId, deathLane: death?.lane }, unit);
}

function dispatchZone(s: SimState, side: SideIndex, lane: Lane, trigger: Trigger, death?: { cardId: string; lane: Lane }): void {
  const zone = s.players[side].spells[lane];
  if (!zone) return;
  runAbilities(s, getCard(zone.cardId).abilities, trigger, { owner: side, kind: 'spell', lane, name: zone.cardId, deathCardId: death?.cardId, deathLane: death?.lane }, zone);
}

function dispatchAll(s: SimState, trigger: Trigger, order: readonly SideIndex[] = [0, 1]): void {
  for (const lane of LANES) {
    for (const side of order) {
      dispatchUnit(s, side, lane, trigger);
      dispatchZone(s, side, lane, trigger);
    }
  }
}

interface Dead {
  side: SideIndex;
  lane: Lane;
  cardId: string;
  silenced: boolean;
  token: boolean;
}

function removeUnit(s: SimState, side: SideIndex, lane: Lane): Dead | null {
  const unit = s.players[side].units[lane];
  if (!unit) return null;
  if (unit.shielded) {
    unit.shielded = false;
    return null;
  }
  s.players[side].units[lane] = null;
  s.totals[side].unitsLost += 1;
  if (!unit.token) {
    s.players[side].grave.push(unit.cardId);
    s.died[side] = true;
  }
  return { side, lane, cardId: unit.cardId, silenced: unit.silenced, token: unit.token };
}

function belowDeathLine(s: SimState): { side: SideIndex; lane: Lane }[] {
  const line = deathAtk(s);
  const out: { side: SideIndex; lane: Lane }[] = [];
  for (const side of [0, 1] as SideIndex[]) for (const { lane } of livingUnits(s, side)) if (effectiveAtk(s, side, lane) <= line) out.push({ side, lane });
  return out;
}

function destroyAndChain(s: SimState, entries: { side: SideIndex; lane: Lane }[]): void {
  const queue: Dead[] = [];
  for (const e of entries) {
    const dead = removeUnit(s, e.side, e.lane);
    if (dead) queue.push(dead);
  }
  let guard = 0;
  while (queue.length > 0 && guard++ < 64) {
    const dead = queue.shift()!;
    if (dead.token) continue;
    const death = { cardId: dead.cardId, lane: dead.lane };
    if (!dead.silenced) runAbilities(s, getCard(dead.cardId).abilities, 'ON_DEATH', { owner: dead.side, kind: 'hero', lane: dead.lane, name: dead.cardId, deathCardId: dead.cardId, deathLane: dead.lane });
    for (const { lane } of livingUnits(s, dead.side)) dispatchUnit(s, dead.side, lane, 'ON_ALLY_DEATH', death);
    for (const { lane } of livingUnits(s, other(dead.side))) dispatchUnit(s, other(dead.side), lane, 'ON_ENEMY_DEATH', death);
    for (const lane of LANES) {
      dispatchZone(s, dead.side, lane, 'ON_ALLY_DEATH', death);
      dispatchZone(s, other(dead.side), lane, 'ON_ENEMY_DEATH', death);
    }
    for (const loc of belowDeathLine(s)) {
      const more = removeUnit(s, loc.side, loc.lane);
      if (more) queue.push(more);
    }
  }
}

function sweep(s: SimState): void {
  const low = belowDeathLine(s);
  if (low.length > 0) destroyAndChain(s, low);
}

// ---------------------------------------------------------------------------
// Legality
// ---------------------------------------------------------------------------

/** Mirrors engine/resolveRound.ts spellHasAValidTarget: same-lane DESTROY / STALL / DESTROY_SPELL_ZONE need a target. */
export function spellHasTarget(s: SimState, side: SideIndex, card: CardDefinition, lane: Lane): boolean {
  for (const ability of card.abilities) {
    if (ability.trigger !== 'ON_PLAY') continue;
    for (const action of ability.actions) {
      if (action.type === 'DESTROY' && (action.target === 'ENEMY_SAME_LANE' || action.target === 'ALLY_SAME_LANE')) {
        const targetSide = action.target === 'ENEMY_SAME_LANE' ? other(side) : side;
        const unit = s.players[targetSide].units[lane];
        if (!unit) return false;
        if (action.maxPower !== undefined && effectiveAtk(s, targetSide, lane) > s.cfg.model.atkFromPower(action.maxPower)) return false;
      }
      if (action.type === 'STALL_COMBAT' && action.target === 'ENEMY_SAME_LANE' && !s.players[other(side)].units[lane]) return false;
      if (action.type === 'DESTROY_SPELL_ZONE' && action.target === 'ENEMY_SAME_LANE' && !s.players[other(side)].spells[lane]) return false;
      const sim = asSimAction(action);
      if (sim?.type === 'PACIFY' && sim.target === 'ENEMY_SAME_LANE' && !s.players[other(side)].units[lane]) return false;
    }
  }
  return true;
}

export function canPlay(s: SimState, side: SideIndex, cardId: string, lane: Lane, taken: { unit: Set<number>; spell: Set<number> }): boolean {
  const card = getCard(cardId);
  const p = s.players[side];
  if (card.type === 'hero') return !taken.unit.has(lane) && !p.units[lane];
  if (taken.spell.has(lane)) return false;
  if (card.spellKind === 'CONTINUOUS' && p.spells[lane]) return false;
  return spellHasTarget(s, side, card, lane);
}

// ---------------------------------------------------------------------------
// Round
// ---------------------------------------------------------------------------

export function beginRound(s: SimState): void {
  s.died = [false, false];
  s.spellsThisRound = [0, 0];
  s.contDestroyed = [false, false];
  s.playsThisRound = 0;
  for (const p of s.players) {
    for (const lane of LANES) {
      const zone = p.spells[lane];
      if (zone) zone.used = false;
      const unit = p.units[lane];
      if (unit) {
        unit.used = false;
        unit.silenced = false;
      }
    }
  }
  dispatchAll(s, 'ROUND_START');
  for (const p of s.players) {
    if (p.hand.length < HAND_TARGET && p.deck.length === 0 && s.firstDeckOut === 0) s.firstDeckOut = s.round;
    while (p.hand.length < HAND_TARGET && p.deck.length > 0) p.hand.push(p.deck.shift()!);
  }
}

function removeFromHand(p: SidePlayer, cardId: string): void {
  const idx = p.hand.indexOf(cardId);
  if (idx < 0) throw new Error(`card ${cardId} not in hand`);
  p.hand.splice(idx, 1);
}

/** Resolves one round from both sides' committed plays, in the live engine's phase order. */
export function resolveRound(s: SimState, plays: [Play[], Play[]]): void {
  const order: SideIndex[] = s.round % 2 === 1 ? [0, 1] : [1, 0];
  const playFor = (side: SideIndex, lane: Lane, type: 'hero' | 'spell') => plays[side].find((p) => p.lane === lane && getCard(p.cardId).type === type);

  // 1. Reveal
  for (const side of order) {
    const p = s.players[side];
    for (const play of plays[side]) {
      removeFromHand(p, play.cardId);
      s.playsThisRound++;
      bumpCard(s, play.cardId, 'played');
      const card = getCard(play.cardId);
      if (card.type === 'hero') {
        p.units[play.lane] = makeUnit(s, side, play.cardId);
        s.totals[side].unitsPlayed++;
      } else if (card.spellKind === 'CONTINUOUS') {
        p.spells[play.lane] = { cardId: play.cardId, used: false };
      }
    }
  }
  note(s, `plays A[${plays[0].map((p) => `${p.cardId}@${p.lane}`).join(' ')}] B[${plays[1].map((p) => `${p.cardId}@${p.lane}`).join(' ')}]`);

  // 2. Spells
  for (const lane of LANES) {
    for (const side of order) {
      const play = playFor(side, lane, 'spell');
      if (!play) continue;
      const card = getCard(play.cardId);
      s.totals[side].spellsPlayed++;
      if (card.spellKind === 'ONE_TIME') {
        const exec: Exec = { owner: side, kind: 'spell', lane, name: card.id };
        const passes = s.spellsThisRound[side] === 0 && spellEcho(s, side) ? 2 : 1;
        for (let pass = 0; pass < passes; pass++) runAbilities(s, card.abilities, 'ON_PLAY', exec);
        s.players[side].grave.push(card.id);
        s.spellsThisRound[side]++;
      } else {
        s.spellsThisRound[side]++;
        dispatchZone(s, side, lane, 'ON_PLAY');
      }
      for (const l of LANES) for (const sd of [0, 1] as SideIndex[]) dispatchUnit(s, sd, l, sd === side ? 'ON_ALLY_SPELL_PLAYED' : 'ON_ENEMY_SPELL_PLAYED');
    }
  }
  sweep(s);

  // 3. Unit On Play
  for (const lane of LANES) {
    for (const side of order) {
      if (playFor(side, lane, 'hero') && s.players[side].units[lane]) dispatchUnit(s, side, lane, 'ON_PLAY');
    }
  }
  sweep(s);

  // 4. Before Combat, then the Mastery effect stand-in (Thread D): a unit that is not winning its clash
  //    spends one use to gain +10% ATK this clash.
  dispatchAll(s, 'BEFORE_COMBAT', s.cfg.rules.beforeCombatOrder === 'initiative' ? order : [0, 1]);
  for (const lane of LANES) {
    for (const side of order) {
      const unit = s.players[side].units[lane];
      const foe = s.players[other(side)].units[lane];
      if (!unit || !foe || unit.token || unit.silenced) continue;
      const charges = s.players[side].charges[unit.cardId] ?? 0;
      if (charges <= 0 || effectiveAtk(s, side, lane) > effectiveAtk(s, other(side), lane)) continue;
      s.players[side].charges[unit.cardId] = charges - 1;
      changeAtk(s, side, lane, Math.round(unit.atk * 0.1), 'UNTIL_ROUND_END');
    }
  }

  // 5. Combat
  for (const p of s.players) for (const unit of p.units) if (unit?.token) unit.fought = true;
  const losers: { side: SideIndex; lane: Lane }[] = [];
  const directLanes: [number, number] = [0, 0];
  const directDamage: [number, number] = [0, 0];
  const direct = (attacker: SideIndex, lane: Lane, atk: number) => {
    const unit = s.players[attacker].units[lane]!;
    const amount = Math.max(0, Math.round(atk * s.cfg.rules.directScale));
    if (damagePlayer(s, other(attacker), amount, 'direct', unit.cardId)) {
      directLanes[attacker]++;
      directDamage[attacker] += amount;
    }
    dispatchUnit(s, attacker, lane, 'ON_DIRECT_DAMAGE');
  };
  for (const lane of LANES) {
    const a = s.players[0].units[lane];
    const b = s.players[1].units[lane];
    const atkA = effectiveAtk(s, 0, lane);
    const atkB = effectiveAtk(s, 1, lane);
    if (a && b && (a.stalled || b.stalled)) continue;
    if ((a && a.pacified) || (b && b.pacified)) {
      // Sim-only PACIFY: the pacified Unit neither clashes nor hits; an unpacified Unit facing it is blocked too.
      if (a && !a.pacified && !b) direct(0, lane, atkA);
      if (b && !b.pacified && !a) direct(1, lane, atkB);
      continue;
    }
    if (a && b) {
      const byA = bypassReduction(s, 0, lane);
      const byB = bypassReduction(s, 1, lane);
      if (byA !== null || byB !== null) {
        if (byA !== null) direct(0, lane, atkA - byA * s.cfg.model.atkStep);
        if (byB !== null) direct(1, lane, atkB - byB * s.cfg.model.atkStep);
        continue;
      }
      s.clashes++;
      if (a.token) s.totals[0].tokenClashes++;
      if (b.token) s.totals[1].tokenClashes++;
      if (atkA === atkB) {
        s.ties++;
        bumpCard(s, a.cardId, 'clashTies');
        bumpCard(s, b.cardId, 'clashTies');
        if (s.cfg.rules.tie === 'both') losers.push({ side: 0, lane }, { side: 1, lane });
        continue;
      }
      const winner: SideIndex = atkA > atkB ? 0 : 1;
      const loser = other(winner);
      s.totals[winner].clashWins++;
      bumpCard(s, (winner === 0 ? a : b).cardId, 'clashWins');
      bumpCard(s, (winner === 0 ? b : a).cardId, 'clashLosses');
      losers.push({ side: loser, lane });
      if (s.cfg.rules.clashDamage) {
        // Clash Damage: the loser's ATK is absorbed; the rest reaches its player (never negative).
        const diff = Math.abs(atkA - atkB);
        const reduced = Math.min(diff, clashReduction(s, loser, lane));
        s.totals[loser].clashReduced += reduced;
        bumpCard(s, (winner === 0 ? b : a).cardId, 'absorbed', Math.min(atkA, atkB) + reduced);
        damagePlayer(s, loser, diff - reduced, 'clash', (winner === 0 ? a : b).cardId);
      }
    } else if (a) direct(0, lane, atkA);
    else if (b) direct(1, lane, atkB);
  }
  for (const side of [0, 1] as SideIndex[]) {
    const k = directLanes[side];
    if (k > 0) {
      s.totals[side].openLaneRounds[k - 1]++;
      s.totals[side].openLaneDamagePct[k - 1] += directDamage[side] / s.players[other(side)].maxHp;
    }
  }
  if (losers.length > 0) destroyAndChain(s, losers);

  // 6-8. After Combat, Round End, temporary cleanup
  dispatchAll(s, 'AFTER_COMBAT');
  dispatchAll(s, 'ROUND_END');
  const fade = s.cfg.rules.tokenLifetime === 'oneCombat';
  for (const side of [0, 1] as SideIndex[]) {
    const p = s.players[side];
    p.barrier = 0;
    p.shield = 0;
    p.clashShield = 0;
    for (const lane of LANES) {
      const unit = p.units[lane];
      if (!unit) continue;
      if (fade && unit.token && unit.fought) {
        p.units[lane] = null;
        s.totals[side].tokensFaded++;
        continue;
      }
      if (unit.temp !== 0) {
        unit.atk -= unit.temp;
        unit.temp = 0;
      }
      unit.stalled = false;
      unit.pacified = false;
    }
  }
  sweep(s);
  note(s, `end HP A ${s.players[0].hp}/${s.players[0].maxHp} B ${s.players[1].hp}/${s.players[1].maxHp}`);
  s.round++;
}

export type Chooser = (s: SimState, side: SideIndex) => Play[];

export function isExhausted(s: SimState): boolean {
  return s.playsThisRound === 0 && s.players.every((p) => p.deck.length === 0 && p.units.every((u) => !u));
}

/** Plays a full match with the given decision function. */
export function playMatch(cfg: MatchConfig, choose: Chooser): MatchResult {
  const s = createSimState(cfg);
  const startHp: [number, number] = [s.players[0].maxHp, s.players[1].maxHp];
  let winner: SideIndex | null = null;
  let endReason: MatchResult['endReason'] = 'cap';
  let killShot: DamageKind | null = null;
  while (s.round <= cfg.rules.maxRounds) {
    beginRound(s);
    const plays: [Play[], Play[]] = [choose(s, 0), choose(s, 1)];
    resolveRound(s, plays);
    const deadA = s.players[0].hp <= 0;
    const deadB = s.players[1].hp <= 0;
    if (deadA || deadB) {
      endReason = 'hp';
      winner = deadA && deadB ? null : deadA ? 1 : 0;
      killShot = winner === null ? s.lastDamage[0] : s.lastDamage[other(winner)];
      break;
    }
    if (isExhausted(s)) {
      endReason = 'exhausted';
      break;
    }
  }
  return {
    winner,
    endReason,
    killShot,
    rounds: Math.min(s.round - 1, cfg.rules.maxRounds),
    startHp,
    endHp: [s.players[0].hp, s.players[1].hp],
    totals: s.totals,
    ties: s.ties,
    clashes: s.clashes,
    firstDeckOut: s.firstDeckOut,
    log: s.log,
  };
}
