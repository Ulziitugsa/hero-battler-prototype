import type { DeployPlay, GameState, HandCard, LaneId, Side } from '../types/index.js';
import { LANES } from '../types/index.js';
import { nextRandom } from '../engine/rng.js';
import { getCombatCard } from './cards.js';
import { CARD_HAND_TARGET, cardAtk, cardSpellHasTarget, continuousAtkBonus, effectiveAtk, resolveCardRound } from './engine.js';
import { ATK_PER_POWER, atkFromPower } from './stats.js';

// The card-combat opponent: the simulator's 'balanced' pilot (src/game/cardSim/ai.ts), the one every approved
// balance number was measured with, moved onto GameState.
//
// Units: every way of assigning hand Units to empty lanes is scored with lane heuristics (win the clash, block
// an attacker, hit an open lane, don't waste a card), counting printed Guard lines. Under Clash Damage a losing
// blocker is worth the ATK it absorbs, so the pilot matches blockers to threats instead of throwing any Unit in.
// Spells: greedy one-ply look-ahead. Each legal (Spell, lane) is resolved on a copy of the round (with the Units
// just chosen, the opponent assumed to add nothing) and the resulting position is scored. A Spell that barely
// helps is held while the hand is at or under the refill target.
//
// It sees only its own hand and the public board. Its random tie-breaks draw from `rngState`, returned as
// `nextRngState` for the round resolver, like the legacy AI.

const STYLE = { face: 0.6, kill: 1.0, block: 0.7, card: 0.7, enemyHp: 1.0, myHp: 1.0, board: 1.0, danger: 0.3, spellThreshold: 0.2 };
const AVG_ATK = atkFromPower(4.5);

export interface CardAiResult {
  action: { plays: DeployPlay[] };
  nextRngState: number;
}

const opposite = (side: Side): Side => (side === 'player' ? 'enemy' : 'player');
const playerOf = (state: GameState, side: Side) => (side === 'player' ? state.player : state.enemy);

/** ATK a Unit gains Before Combat when it would lose its lane (the Guard keyword and Paladin's Guard 3). */
export function guardBonusAtk(cardId: string): number {
  let steps = 0;
  for (const ability of getCombatCard(cardId).abilities) {
    if (ability.trigger !== 'BEFORE_COMBAT' || ability.conditions?.length !== 1 || ability.conditions[0].type !== 'SELF_LOSING_LANE') continue;
    for (const action of ability.actions) if (action.type === 'CHANGE_POWER' && action.target === 'SELF') steps += action.amount;
  }
  return steps * ATK_PER_POWER;
}

/** Clash Damage a Unit's unconditional PASSIVE reduction takes off a lost clash (mirrors the simulator's pilot). */
export function clashGuardAtk(cardId: string): number {
  let steps = 0;
  for (const ability of getCombatCard(cardId).abilities) {
    if (ability.trigger !== 'PASSIVE' || (ability.conditions?.length ?? 0) > 0) continue;
    for (const action of ability.actions) if (action.type === 'REDUCE_CLASH_DAMAGE' || action.type === 'REDUCE_OVERFLOW_DAMAGE') steps += action.amount;
  }
  return steps * ATK_PER_POWER;
}

function evaluate(state: GameState, side: Side): number {
  const me = playerOf(state, side);
  const foe = playerOf(state, opposite(side));
  if (foe.hp <= 0 && me.hp > 0) return 1e9;
  let board = 0;
  for (const lane of LANES) {
    if (me.heroZones[lane]) board += effectiveAtk(state, side, lane);
    if (foe.heroZones[lane]) board -= effectiveAtk(state, opposite(side), lane);
  }
  return STYLE.myHp * me.hp - STYLE.enemyHp * foe.hp + STYLE.board * board + STYLE.card * AVG_ATK * (me.hand.length - foe.hand.length);
}

function lookAhead(state: GameState, side: Side, plays: DeployPlay[], rng: number): number {
  const none = { plays: [] };
  const mine = { plays };
  const { nextState } = side === 'player' ? resolveCardRound(state, mine, none, rng) : resolveCardRound(state, none, mine, rng);
  return evaluate(nextState, side);
}

export function chooseCardAiAction(state: GameState, side: Side, rngState: number): CardAiResult {
  let rng = rngState;
  const rand = (): number => {
    const r = nextRandom(rng);
    rng = r.nextState;
    return r.value;
  };
  const me = playerOf(state, side);
  const foeSide = opposite(side);
  const foe = playerOf(state, foeSide);

  // --- Units ---
  const openLanes = LANES.filter((lane) => !me.heroZones[lane]);
  const unitCards: HandCard[] = me.hand.filter((h) => getCombatCard(h.cardId).type === 'hero');
  let unitPlays: DeployPlay[] = [];
  if (openLanes.length > 0 && unitCards.length > 0) {
    const endangered = me.hp < (me.maxHp ?? me.hp) * STYLE.danger;
    const block = endangered ? Math.max(STYLE.block, 1.2) : STYLE.block;
    const foeCanAnswer = foe.hand.length > 0;
    const laneScore = (cardId: string, lane: LaneId): number => {
      let mine = cardAtk(cardId) + continuousAtkBonus(state, side, lane);
      const foeUnit = foe.heroZones[lane];
      if (!foeUnit) return STYLE.face * mine * (foeCanAnswer ? 0.4 : 1) + 0.2 * mine;
      let theirs = effectiveAtk(state, foeSide, lane);
      if (mine < theirs) mine += guardBonusAtk(cardId);
      if (!foeUnit.silenced && theirs < mine) theirs += guardBonusAtk(foeUnit.cardId);
      // Clash Damage: a blocker only absorbs its own ATK (plus its Clash Damage reduction), so it is scored on what
      // it stops, not on the size of the threat it stands in front of. A winner also pushes its surplus through.
      if (mine > theirs) return (STYLE.kill + block) * theirs + STYLE.face * Math.max(0, mine - theirs - clashGuardAtk(foeUnit.cardId)) + 0.2 * mine;
      if (mine === theirs) return 0.5 * STYLE.kill * theirs + block * theirs - 0.5 * STYLE.card * mine;
      return block * Math.min(theirs, mine + clashGuardAtk(cardId)) - STYLE.card * mine;
    };
    // A tiny seeded jitter breaks exact ties only.
    const scores = unitCards.map((h) => openLanes.map((lane) => laneScore(h.cardId, lane) + rand() * 0.01));
    let best: { score: number; plan: DeployPlay[] } = { score: 0, plan: [] };
    const used = new Array<boolean>(unitCards.length).fill(false);
    const plan: DeployPlay[] = [];
    const recurse = (li: number, score: number) => {
      if (li === openLanes.length) {
        if (score > best.score) best = { score, plan: [...plan] };
        return;
      }
      recurse(li + 1, score);
      for (let u = 0; u < unitCards.length; u++) {
        if (used[u]) continue;
        // identical cards give identical plans: only try the first unused copy
        if (unitCards.slice(0, u).some((h, k) => !used[k] && h.cardId === unitCards[u].cardId)) continue;
        used[u] = true;
        plan.push({ handId: unitCards[u].handId, cardId: unitCards[u].cardId, lane: openLanes[li] });
        recurse(li + 1, score + scores[u][li]);
        plan.pop();
        used[u] = false;
      }
    };
    recurse(0, 0);
    unitPlays = best.plan;
  }

  // --- Spells ---
  const plays = [...unitPlays];
  const takenSpell = new Set<LaneId>();
  const remaining: HandCard[] = me.hand.filter((h) => getCombatCard(h.cardId).type === 'spell');
  if (remaining.length > 0) {
    let base = lookAhead(state, side, plays, rng);
    for (;;) {
      let best: { play: DeployPlay; score: number } | null = null;
      const seen = new Set<string>();
      for (const hand of remaining) {
        if (seen.has(hand.cardId)) continue;
        seen.add(hand.cardId);
        const card = getCombatCard(hand.cardId);
        for (const lane of LANES) {
          if (takenSpell.has(lane)) continue;
          if (card.spellKind === 'CONTINUOUS' && me.spellZones[lane]) continue;
          if (!cardSpellHasTarget(state, side, card, lane)) continue;
          const play = { handId: hand.handId, cardId: hand.cardId, lane };
          const score = lookAhead(state, side, [...plays, play], rng);
          if (!best || score > best.score) best = { play, score };
        }
      }
      if (!best) break;
      const gain = best.score - base;
      const handAfter = me.hand.length - plays.length;
      const holdingIsFree = handAfter <= CARD_HAND_TARGET;
      const nothingElse = plays.length === 0;
      // A card spent is a card the look-ahead no longer counts in hand, so `gain` is already net of that cost.
      if (gain > STYLE.spellThreshold * AVG_ATK - STYLE.card * AVG_ATK || (!holdingIsFree && gain > -STYLE.card * AVG_ATK) || (nothingElse && gain > -2 * AVG_ATK)) {
        const chosen = best.play;
        plays.push(chosen);
        takenSpell.add(chosen.lane);
        remaining.splice(
          remaining.findIndex((h) => h.handId === chosen.handId),
          1,
        );
        base = best.score;
        continue;
      }
      break;
    }
  }
  return { action: { plays }, nextRngState: rng };
}
