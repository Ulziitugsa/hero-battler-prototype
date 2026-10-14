import type { GameEvent, GameState, LaneId, Side } from '../../game/types';
import { STARTING_HP } from '../../game/engine/constants';
import type { AnimationStep } from './types';

// Short, readable words for the big moments of a round ("Burn -45", "Revived", "Big Hit"), read straight off the step
// that is playing. Pure: like chitEffects.ts it only ever looks at the events the resolver already logged and the board
// as displayed; it decides nothing about the battle and never changes a number.
//
// Two anchors, so a callout never lands on top of the lane's own ATK read-out (chitEffects' clash callout):
//   'hp'    Player damage worth calling out, beside the HP bar that took it (SideHeader)
//   'lane'  something that happened to a card in a lane (a revive, a Spell resolving), over that lane (Battlefield)
//
// Not every event gets one: an unopposed hit is already spelled out on the clash line, a Shield save already floats
// "Saved!", and a sacrifice is not distinguishable in the log (the resolver does not record who caused a destruction),
// so it is never guessed at.

export type BattleCalloutKind = 'direct' | 'burn' | 'big-hit' | 'revived' | 'spell' | 'fizzled';

export interface BattleCallout {
  key: string;
  kind: BattleCalloutKind;
  anchor: 'hp' | 'lane';
  /** 'hp': whose HP took the damage. 'lane': whose card it is. */
  side: Side;
  lane?: LaneId;
  text: string;
  /** A heavy hit: drawn larger and longer. */
  big: boolean;
}

/** Player damage at least this share of the damaged side's maximum HP is a Big Hit. Presentation only. */
export const BIG_HIT_SHARE = 0.2;

function maxHpOf(state: GameState, side: Side): number {
  return (side === 'player' ? state.player.maxHp : state.enemy.maxHp) ?? STARTING_HP;
}

export function isBigHit(amount: number, state: GameState, side: Side): boolean {
  return amount > 0 && amount >= Math.ceil(maxHpOf(state, side) * BIG_HIT_SHARE);
}

const minus = (n: number): string => `−${n.toLocaleString('en-US')}`;

/**
 * The callout for the step currently playing, or null. `state` is the board as displayed before the step's own effects
 * commit (useAnimationController's displayState), which is what the Big Hit threshold reads.
 */
export function battleCalloutForStep(step: AnimationStep | null, state: GameState): BattleCallout | null {
  if (!step) return null;
  // An unopposed attack: the lane's own beat carries one DIRECT_DAMAGE (buildAnimationSteps' combat sequence).
  if (step.visualType === 'direct-damage' && step.lane && step.events.length === 1 && step.events[0].type === 'DIRECT_DAMAGE') {
    const e = step.events[0];
    const big = isBigHit(e.amount, state, e.side);
    return { key: `${step.id}-direct`, kind: 'direct', anchor: 'hp', side: e.side, lane: step.lane, text: `${big ? 'Big Hit' : 'Direct Attack'} ${minus(e.amount)}`, big };
  }
  for (const e of step.events) {
    const callout = calloutForEvent(step, e, state);
    if (callout) return callout;
  }
  return null;
}

function calloutForEvent(step: AnimationStep, e: GameEvent, state: GameState): BattleCallout | null {
  switch (e.type) {
    case 'DIRECT_DAMAGE':
      // Damage a card effect deals straight to a player (any DIRECT_DAMAGE outside an unopposed attack).
      return e.amount > 0 ? { key: `${step.id}-burn`, kind: 'burn', anchor: 'hp', side: e.side, text: `Burn ${minus(e.amount)}`, big: isBigHit(e.amount, state, e.side) } : null;
    case 'CLASH_DAMAGE':
      return e.side !== null && isBigHit(e.amount, state, e.side) ? { key: `${step.id}-big`, kind: 'big-hit', anchor: 'hp', side: e.side, lane: e.lane, text: `Big Hit ${minus(e.amount)}`, big: true } : null;
    case 'OVERFLOW_DAMAGE':
      return isBigHit(e.amount, state, e.side) ? { key: `${step.id}-big`, kind: 'big-hit', anchor: 'hp', side: e.side, lane: e.lane, text: `Big Hit ${minus(e.amount)}`, big: true } : null;
    case 'REVIVED':
      return { key: `${step.id}-revived`, kind: 'revived', anchor: 'lane', side: e.side, lane: e.lane, text: 'Revived', big: false };
    case 'SPELL_RESOLVED':
      return { key: `${step.id}-spell`, kind: e.fizzled ? 'fizzled' : 'spell', anchor: 'lane', side: e.side, lane: e.lane, text: e.fizzled ? `${e.name} fizzled` : e.name, big: false };
    default:
      return null;
  }
}
