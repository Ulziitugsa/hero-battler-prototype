import { nextRandom } from '../engine/rng.js';
import { getCard } from './cardSource.js';
import { type Play, type PolicyId, type SideIndex, type SimState, HAND_TARGET, beginRound, canPlay, cloneState, continuousBonus, effectiveAtk, isExhausted, rand, resolveRound, statsOf } from './engine.js';

// Simple, consistent AI policies for balance comparisons. They are not meant to be smart; they are meant
// to behave the same way every time so two stat models can be compared on equal terms.
//
// Units: every way of assigning hand Units to empty lanes is scored with lane heuristics (win the clash,
// block an attacker, hit an open lane, don't waste a card) weighted by style.
// Spells: greedy one-ply look-ahead. Each legal (Spell, lane) is resolved on a copy of the round (with the
// Units just chosen, opponent assumed to add nothing) and the resulting position is scored by style.
// A Spell that barely helps is held while the hand is at or under the refill target, like the live AI.
// 'random' places Units in random empty lanes and casts every castable Spell in a random legal lane: the
// "poor decisions" pilot for the deck-quality vs decision-quality experiment.
// 'expert' searches: it scores a handful of candidate plays (the three styles' choices, a few random legal
// plays, passing) by playing the round out against sampled opponent hands and then rolling the match
// forward with the balanced heuristic. It never sees hidden cards: both decks and the opponent's hand are
// re-dealt from what is unseen before every sample. It is the "good decisions" pilot for measuring how
// much decisions are worth, because the heuristics can be worse than random on some decks.

type Lane = 0 | 1 | 2;
const LANES: Lane[] = [0, 1, 2];

interface Style {
  face: number;
  kill: number;
  block: number;
  card: number;
  enemyHp: number;
  myHp: number;
  board: number;
  /** Below this share of max HP the style blocks like a defensive player. */
  danger: number;
  /** A Spell must improve the look-ahead score by this share of an average ATK to be cast while holding is free. */
  spellThreshold: number;
}

export const STYLES: Record<Exclude<PolicyId, 'random' | 'expert'>, Style> = {
  aggressive: { face: 1.0, kill: 0.8, block: 0.3, card: 0.6, enemyHp: 1.3, myHp: 0.6, board: 0.8, danger: 0.3, spellThreshold: 0.15 },
  balanced: { face: 0.6, kill: 1.0, block: 0.7, card: 0.7, enemyHp: 1.0, myHp: 1.0, board: 1.0, danger: 0.3, spellThreshold: 0.2 },
  defensive: { face: 0.3, kill: 1.0, block: 1.2, card: 0.5, enemyHp: 0.7, myHp: 1.4, board: 1.0, danger: 0.5, spellThreshold: 0.2 },
};

export function choosePlays(s: SimState, side: SideIndex, policy: PolicyId = s.cfg.sides[side].policy): Play[] {
  if (policy === 'random') return randomPlays(s, side);
  if (policy === 'expert') return expertPlays(s, side);
  const style = STYLES[policy];
  const units = chooseUnits(s, side, style);
  return chooseSpells(s, side, style, units);
}

function randomPlays(s: SimState, side: SideIndex): Play[] {
  const me = s.players[side];
  const plays: Play[] = [];
  const taken = { unit: new Set<number>(), spell: new Set<number>() };
  const hand = [...me.hand];
  for (let i = hand.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [hand[i], hand[j]] = [hand[j], hand[i]];
  }
  for (const cardId of hand) {
    const lanes = LANES.filter((lane) => canPlay(s, side, cardId, lane, taken));
    if (lanes.length === 0) continue;
    const lane = lanes[Math.floor(rand(s) * lanes.length)];
    plays.push({ cardId, lane });
    (getCard(cardId).type === 'hero' ? taken.unit : taken.spell).add(lane);
  }
  return plays;
}

function chooseUnits(s: SimState, side: SideIndex, style: Style): Play[] {
  const me = s.players[side];
  const foeSide: SideIndex = side === 0 ? 1 : 0;
  const foe = s.players[foeSide];
  const openLanes = LANES.filter((lane) => !me.units[lane]);
  const unitCards = me.hand.filter((id) => getCard(id).type === 'hero');
  if (openLanes.length === 0 || unitCards.length === 0) return [];

  const endangered = me.hp < me.maxHp * style.danger;
  const block = endangered ? Math.max(style.block, 1.2) : style.block;
  const foeCanAnswer = foe.hand.length > 0;
  const tieKills = s.cfg.rules.tie === 'both';
  const clash = s.cfg.rules.clashDamage;

  const laneScore = (cardId: string, lane: Lane): number => {
    let mine = statsOf(s, side, cardId).atk + continuousBonus(s, side, lane);
    const foeUnit = foe.units[lane];
    if (!foeUnit) return style.face * mine * (foeCanAnswer ? 0.4 : 1) + 0.2 * mine;
    let theirs = effectiveAtk(s, foeSide, lane);
    // Guard (Before Combat: +N if this Unit would lose its lane) is printed on the card, so a good pilot counts it.
    if (mine < theirs) mine += guardBonus(s, cardId);
    if (!foeUnit.silenced && theirs < mine) theirs += guardBonus(s, foeUnit.cardId);
    if (!clash) {
      if (mine > theirs) return (style.kill + block) * theirs + 0.2 * mine;
      if (mine === theirs) return tieKills ? 0.5 * style.kill * theirs + block * theirs - 0.5 * style.card * mine : block * theirs;
      return block * theirs - style.card * mine;
    }
    // Clash Damage: a blocker only absorbs its own ATK (plus its Guard), so it is scored on what it stops, not
    // on the size of the threat it stands in front of. A winner also pushes its surplus ATK through.
    if (mine > theirs) return (style.kill + block) * theirs + style.face * Math.max(0, mine - theirs - clashGuard(s, foeUnit.cardId)) + 0.2 * mine;
    if (mine === theirs) return tieKills ? 0.5 * style.kill * theirs + block * theirs - 0.5 * style.card * mine : block * theirs;
    return block * Math.min(theirs, mine + clashGuard(s, cardId)) - style.card * mine;
  };

  // Precompute scores (plus a tiny seeded jitter that only breaks exact ties).
  const scores = unitCards.map((id) => openLanes.map((lane) => laneScore(id, lane) + rand(s) * 0.01));
  let best: { score: number; plan: Play[] } = { score: 0, plan: [] };
  const used = new Array(unitCards.length).fill(false);
  const plan: Play[] = [];
  const recurse = (li: number, score: number) => {
    if (li === openLanes.length) {
      if (score > best.score) best = { score, plan: [...plan] };
      return;
    }
    recurse(li + 1, score);
    for (let u = 0; u < unitCards.length; u++) {
      if (used[u]) continue;
      // identical cards give identical plans: only try the first unused copy
      if (unitCards.slice(0, u).some((id, k) => !used[k] && id === unitCards[u])) continue;
      used[u] = true;
      plan.push({ cardId: unitCards[u], lane: openLanes[li] });
      recurse(li + 1, score + scores[u][li]);
      plan.pop();
      used[u] = false;
    }
  };
  recurse(0, 0);
  return best.plan;
}

/** ATK a Unit gains Before Combat when it would lose its lane (Paladin's line 2, the Guard keyword). */
export function guardBonus(s: SimState, cardId: string): number {
  let bonus = 0;
  for (const ability of getCard(cardId).abilities) {
    if (ability.trigger !== 'BEFORE_COMBAT' || ability.conditions?.length !== 1 || ability.conditions[0].type !== 'SELF_LOSING_LANE') continue;
    for (const action of ability.actions) if (action.type === 'CHANGE_POWER' && action.target === 'SELF') bonus += action.amount;
  }
  return bonus * s.cfg.model.atkStep;
}

/** Clash Damage a Unit's Guard (REDUCE_CLASH_DAMAGE / REDUCE_OVERFLOW_DAMAGE) takes off a lost clash. */
export function clashGuard(s: SimState, cardId: string): number {
  let steps = 0;
  for (const ability of getCard(cardId).abilities) {
    if (ability.trigger !== 'PASSIVE' || (ability.conditions?.length ?? 0) > 0) continue;
    for (const action of ability.actions as { type: string; amount?: number }[]) if (action.type === 'REDUCE_CLASH_DAMAGE' || action.type === 'REDUCE_OVERFLOW_DAMAGE') steps += action.amount ?? 0;
  }
  return steps * s.cfg.model.atkStep;
}

function evaluate(s: SimState, side: SideIndex, style: Style): number {
  const foeSide: SideIndex = side === 0 ? 1 : 0;
  const me = s.players[side];
  const foe = s.players[foeSide];
  if (foe.hp <= 0 && me.hp > 0) return 1e9;
  let board = 0;
  for (const lane of LANES) {
    if (me.units[lane]) board += effectiveAtk(s, side, lane);
    if (foe.units[lane]) board -= effectiveAtk(s, foeSide, lane);
  }
  const avgAtk = s.cfg.model.atkFromPower(4.5);
  return style.myHp * me.hp - style.enemyHp * foe.hp + style.board * board + style.card * avgAtk * (me.hand.length - foe.hand.length);
}

function lookAhead(s: SimState, side: SideIndex, plays: Play[], style: Style): number {
  const copy = cloneState(s);
  resolveRound(copy, side === 0 ? [plays, []] : [[], plays]);
  return evaluate(copy, side, style);
}

function chooseSpells(s: SimState, side: SideIndex, style: Style, unitPlays: Play[]): Play[] {
  const me = s.players[side];
  const plays = [...unitPlays];
  const taken = { unit: new Set<number>(unitPlays.map((p) => p.lane)), spell: new Set<number>() };
  const avgAtk = s.cfg.model.atkFromPower(4.5);
  const remaining = me.hand.filter((id) => getCard(id).type === 'spell');
  if (remaining.length === 0) return plays;

  let base = lookAhead(s, side, plays, style);
  for (;;) {
    let best: { play: Play; score: number } | null = null;
    const seen = new Set<string>();
    for (const cardId of remaining) {
      if (seen.has(cardId)) continue;
      seen.add(cardId);
      for (const lane of LANES) {
        if (!canPlay(s, side, cardId, lane, taken)) continue;
        const play = { cardId, lane };
        const score = lookAhead(s, side, [...plays, play], style);
        if (!best || score > best.score) best = { play, score };
      }
    }
    if (!best) break;
    const gain = best.score - base;
    const handAfter = me.hand.length - (plays.length - unitPlays.length) - unitPlays.length;
    const holdingIsFree = handAfter <= HAND_TARGET;
    const nothingElse = plays.length === 0;
    // A card spent is a card the look-ahead no longer counts in hand, so `gain` is already net of that cost.
    if (gain > style.spellThreshold * avgAtk - style.card * avgAtk || (!holdingIsFree && gain > -style.card * avgAtk) || (nothingElse && gain > -2 * avgAtk)) {
      plays.push(best.play);
      taken.spell.add(best.play.lane);
      remaining.splice(remaining.indexOf(best.play.cardId), 1);
      base = best.score;
      continue;
    }
    break;
  }
  return plays;
}

// ---------------------------------------------------------------------------
// Expert pilot (search)
// ---------------------------------------------------------------------------

export const EXPERT = { samples: 6, randomPlans: 5, rolloutRounds: 5 };

const planKey = (plays: Play[]): string => plays.map((p) => `${p.cardId}@${p.lane}`).sort().join(' ');

function sampleRng(seed: number, k: number): number {
  let r = (seed ^ Math.imul(k + 1, 0x9e3779b1)) | 0;
  for (let i = 0; i < 3; i++) r = nextRandom(r).nextState;
  return r;
}

function shuffleWith(copy: SimState, items: string[]): string[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(copy) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** A copy of the position with every card this side cannot see re-dealt at random. */
function determinize(s: SimState, side: SideIndex, k: number): SimState {
  const copy = cloneState(s);
  copy.rng = sampleRng(s.rng, k);
  const me = copy.players[side];
  const foe = copy.players[side === 0 ? 1 : 0];
  me.deck = shuffleWith(copy, me.deck);
  const unseen = shuffleWith(copy, [...foe.hand, ...foe.deck]);
  foe.hand = unseen.slice(0, foe.hand.length);
  foe.deck = unseen.slice(foe.hand.length);
  return copy;
}

function positionValue(s: SimState, side: SideIndex): number {
  const me = s.players[side];
  const foe = s.players[side === 0 ? 1 : 0];
  if (me.hp <= 0 && foe.hp <= 0) return 0.5;
  if (foe.hp <= 0) return 1;
  if (me.hp <= 0) return 0;
  // Unfinished rollout: HP share, nudged by board ATK, squashed well inside (0, 1).
  let board = 0;
  for (const lane of LANES) board += effectiveAtk(s, side, lane) - effectiveAtk(s, side === 0 ? 1 : 0, lane);
  const share = (me.hp / me.maxHp - foe.hp / foe.maxHp + board / (2 * Math.max(me.maxHp, foe.maxHp))) / 2;
  return 0.5 + 0.8 * Math.max(-0.5, Math.min(0.5, share));
}

function rollout(copy: SimState, side: SideIndex, plays: Play[]): number {
  const foeSide: SideIndex = side === 0 ? 1 : 0;
  const foePlays = choosePlays(copy, foeSide, 'balanced');
  resolveRound(copy, side === 0 ? [plays, foePlays] : [foePlays, plays]);
  for (let r = 0; r < EXPERT.rolloutRounds; r++) {
    if (copy.players[0].hp <= 0 || copy.players[1].hp <= 0 || isExhausted(copy) || copy.round > copy.cfg.rules.maxRounds) break;
    beginRound(copy);
    resolveRound(copy, [choosePlays(copy, 0, 'balanced'), choosePlays(copy, 1, 'balanced')]);
  }
  return positionValue(copy, side);
}

function expertPlays(s: SimState, side: SideIndex): Play[] {
  const candidates = new Map<string, Play[]>();
  const add = (plays: Play[]) => {
    const key = planKey(plays);
    if (!candidates.has(key)) candidates.set(key, plays);
  };
  for (const style of ['balanced', 'aggressive', 'defensive'] as const) add(choosePlays(s, side, style));
  add([]);
  for (let i = 0; i < EXPERT.randomPlans; i++) add(randomPlays(s, side));
  if (candidates.size === 1) return [...candidates.values()][0];
  let best: { plays: Play[]; value: number } | null = null;
  for (const plays of candidates.values()) {
    let value = 0;
    for (let k = 0; k < EXPERT.samples; k++) value += rollout(determinize(s, side, k), side, plays);
    if (!best || value > best.value) best = { plays, value };
  }
  return best!.plays;
}
