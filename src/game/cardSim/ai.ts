import { getCard } from '../cards/index.js';
import { type Play, type PolicyId, type SideIndex, type SimState, HAND_TARGET, canPlay, cloneState, continuousBonus, effectiveAtk, rand, resolveRound, statsOf } from './engine.js';

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

export const STYLES: Record<Exclude<PolicyId, 'random'>, Style> = {
  aggressive: { face: 1.0, kill: 0.8, block: 0.3, card: 0.6, enemyHp: 1.3, myHp: 0.6, board: 0.8, danger: 0.3, spellThreshold: 0.15 },
  balanced: { face: 0.6, kill: 1.0, block: 0.7, card: 0.7, enemyHp: 1.0, myHp: 1.0, board: 1.0, danger: 0.3, spellThreshold: 0.2 },
  defensive: { face: 0.3, kill: 1.0, block: 1.2, card: 0.5, enemyHp: 0.7, myHp: 1.4, board: 1.0, danger: 0.5, spellThreshold: 0.2 },
};

export function choosePlays(s: SimState, side: SideIndex, policy: PolicyId = s.cfg.sides[side].policy): Play[] {
  if (policy === 'random') return randomPlays(s, side);
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

  const laneScore = (cardId: string, lane: Lane): number => {
    const mine = statsOf(s, side, cardId).atk + continuousBonus(s, side, lane);
    const foeUnit = foe.units[lane];
    if (!foeUnit) return style.face * mine * (foeCanAnswer ? 0.4 : 1) + 0.2 * mine;
    const theirs = effectiveAtk(s, foeSide, lane);
    if (mine > theirs) return (style.kill + block) * theirs + 0.2 * mine;
    if (mine === theirs) return tieKills ? 0.5 * style.kill * theirs + block * theirs - 0.5 * style.card * mine : block * theirs;
    return block * theirs - style.card * mine;
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
