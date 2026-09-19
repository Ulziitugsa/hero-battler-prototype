import type { CardDefinition, DeployPlay, GameState, LaneId, Placement, PlayerAction, ResolveResult, Side } from '../types';
import { LANES } from '../types';
import { getCard } from '../cards';
import { DRAW_PER_ROUND, INITIAL_HAND_SIZE, directDamageAmount } from './constants';
import { makeDrawnHandCard } from './deck';
import { type Ctx, getHero, getSpellZone, opposite, playerOf, push, setHero, setSpellZone } from './board';
import { effectivePower } from './power';
import { applyMasteries } from './mastery';
import {
  dealDirectDamageAndTrigger,
  dealOverflowDamage,
  dispatchInstantSpellOnPlay,
  dispatchSpellPlayedTriggers,
  dispatchTriggerForAllZones,
  dispatchTriggerForHero,
  dispatchTriggerForSpellZone,
  destroyAndChain,
  makeHeroInstance,
  makeSpellZoneInstance,
  overflowReductionFor,
  sweepPowerZero,
} from './abilities';

export interface ValidationResult {
  legal: boolean;
  reason?: string;
  plays: DeployPlay[];
}

/**
 * Would this Spell's ON_PLAY ability find anything to hit if placed in `lane`? Only checked for
 * same-lane DESTROY/DESTROY_SPELL_ZONE actions (Execute, Dispel) - an obviously-empty target is
 * blocked at Deploy time rather than left to fizzle, per the same automatic-targeting rule that
 * decides everything else about where an effect lands. Generic over any card with this action
 * shape - nothing here is keyed to a specific card id.
 */
export function spellHasAValidTarget(state: GameState, side: Side, card: CardDefinition, lane: LaneId): boolean {
  for (const ability of card.abilities) {
    if (ability.trigger !== 'ON_PLAY') continue;
    for (const action of ability.actions) {
      if (action.type === 'DESTROY' && (action.target === 'ENEMY_SAME_LANE' || action.target === 'ALLY_SAME_LANE')) {
        const targetSide = action.target === 'ENEMY_SAME_LANE' ? opposite(side) : side;
        const hero = (targetSide === 'player' ? state.player : state.enemy).heroZones[lane];
        if (!hero) return false;
        if (action.maxPower !== undefined && hero.power > action.maxPower) return false;
      }
      if (action.type === 'DESTROY_SPELL_ZONE' && (action.target === 'ENEMY_SAME_LANE' || action.target === 'ALLY_SAME_LANE')) {
        const targetSide = action.target === 'ENEMY_SAME_LANE' ? opposite(side) : side;
        const spell = (targetSide === 'player' ? state.player : state.enemy).spellZones[lane];
        if (!spell) return false;
      }
    }
  }
  return true;
}

/**
 * Single source of truth for "can this action legally be submitted" - used by the UI (drag/drop and
 * tap-fallback both call this), the AI, and resolveRound itself. There are no target params to
 * validate any more - a play is just {handId, cardId, lane}.
 */
export function validateDeployment(state: GameState, side: Side, action: PlayerAction): ValidationResult {
  const p = side === 'player' ? state.player : state.enemy;
  const usedHandIds = new Set<string>();
  const usedHeroLanes = new Set<LaneId>();
  const usedSpellLanes = new Set<LaneId>();

  for (const play of action.plays) {
    if (usedHandIds.has(play.handId)) return { legal: false, reason: `Hand card ${play.handId} used twice`, plays: [] };
    usedHandIds.add(play.handId);

    const handCard = p.hand.find((h) => h.handId === play.handId);
    if (!handCard || handCard.cardId !== play.cardId) {
      return { legal: false, reason: `${play.handId} is not in ${side}'s hand`, plays: [] };
    }

    const card = getCard(play.cardId);

    if (card.type === 'hero') {
      if (usedHeroLanes.has(play.lane)) return { legal: false, reason: `Hero lane ${play.lane} targeted twice`, plays: [] };
      if (p.heroZones[play.lane] !== null) return { legal: false, reason: `Hero lane ${play.lane} is occupied`, plays: [] };
      usedHeroLanes.add(play.lane);
    } else {
      // Every Spell - one-time or Continuous - is placed into a Spell lane; that placement is its
      // entire targeting input. Only a Continuous Spell needs the zone itself to be physically empty
      // (an active Continuous Spell can't be replaced by dropping another Spell on top of it).
      if (usedSpellLanes.has(play.lane)) return { legal: false, reason: `Spell lane ${play.lane} targeted twice`, plays: [] };
      if (card.spellKind === 'CONTINUOUS' && p.spellZones[play.lane] !== null) {
        return { legal: false, reason: `Spell lane ${play.lane} already holds an active Continuous Spell`, plays: [] };
      }
      if (!spellHasAValidTarget(state, side, card, play.lane)) {
        return { legal: false, reason: `${card.name} has no valid target in ${play.lane}`, plays: [] };
      }
      usedSpellLanes.add(play.lane);
    }
  }

  return { legal: true, plays: action.plays };
}

/** Grants this round's start-of-round effects, resets once-per-round Spell reactions, and draws exactly DRAW_PER_ROUND cards for each side. Call once before showing the Deploy UI. */
export function beginRound(state: GameState): ResolveResult {
  const ctx: Ctx = { state: structuredClone(state), events: [], rngState: state.rngState };
  push(ctx, { type: 'ROUND_START', round: ctx.state.round });

  for (const side of ['player', 'enemy'] as Side[]) {
    const p = playerOf(ctx, side);
    for (const lane of LANES) {
      const zone = p.spellZones[lane];
      if (zone) zone.usedThisRound = false;
      const heroInLane = p.heroZones[lane];
      if (heroInLane) {
        heroInLane.usedThisRound = false;
        heroInLane.silenced = false; // SILENCE only ever lasts "for the remainder of the round it was applied in"
      }
    }
  }

  dispatchTriggerForAllZones(ctx, 'ROUND_START');

  // Round 1 draws INITIAL_HAND_SIZE to form the opening hand; every round after that draws exactly
  // DRAW_PER_ROUND, regardless of current hand size - never a refill/clamp back up to a target. A
  // round-2+ hand of 0 draws to 1; a hand of 5 draws to 6. An empty Deck fizzles the draw (logged, not
  // a loss condition) rather than crashing or inventing a fatigue mechanic.
  const drawCount = ctx.state.round === 1 ? INITIAL_HAND_SIZE : DRAW_PER_ROUND;
  for (const side of ['player', 'enemy'] as Side[]) {
    const p = playerOf(ctx, side);
    for (let seq = 0; seq < drawCount; seq++) {
      if (p.deck.length === 0) {
        push(ctx, { type: 'DRAW', side, fizzled: true });
        continue;
      }
      const cardId = p.deck.shift()!;
      p.hand.push(makeDrawnHandCard(side, ctx.state.round, seq, cardId));
      push(ctx, { type: 'DRAW', side, cardId, cardName: getCard(cardId).name, fizzled: false });
    }
  }

  // Masteries resolve here: after both draws, before Deploy (see engine/mastery.ts).
  applyMasteries(ctx);

  ctx.state.rngState = ctx.rngState;
  return { nextState: ctx.state, events: ctx.events };
}

/**
 * Resolves one round from committed Deploy actions through the win check:
 * Reveal -> Spells -> Hero On Play -> Before Combat -> Combat -> destruction + death-trigger chains
 * -> After Combat -> Round End -> temporary effect cleanup -> win check. Spells and Hero On Play each
 * resolve in Left -> Center -> Right order (initiative breaks ties within a lane) so a phase never
 * depends on animation timing.
 */
export function resolveRound(state: GameState, playerAction: PlayerAction, enemyAction: PlayerAction, seed: number): ResolveResult {
  const pValidation = validateDeployment(state, 'player', playerAction);
  if (!pValidation.legal) throw new Error(`Illegal player action: ${pValidation.reason}`);
  const eValidation = validateDeployment(state, 'enemy', enemyAction);
  if (!eValidation.legal) throw new Error(`Illegal enemy action: ${eValidation.reason}`);

  const ctx: Ctx = { state: structuredClone(state), events: [], rngState: seed };
  const round = ctx.state.round;

  // Initiative alternates by round so tie-breaks never favor one side across a whole match.
  const initiative: Side = round % 2 === 1 ? 'player' : 'enemy';
  const order: Side[] = initiative === 'player' ? ['player', 'enemy'] : ['enemy', 'player'];
  const plays: Record<Side, DeployPlay[]> = { player: pValidation.plays, enemy: eValidation.plays };
  // A single side can legally play BOTH a Hero and a Spell into the same lane in the same round (its
  // own Hero zone and Spell zone are independent slots) - `type` disambiguates which of the two this
  // call wants, so the Spells phase and the Hero On Play phase each find their own play instead of
  // whichever one happens to be first in the array.
  const playFor = (side: Side, lane: LaneId, type: 'hero' | 'spell'): DeployPlay | undefined =>
    plays[side].find((p) => p.lane === lane && getCard(p.cardId).type === type);

  // 1. Reveal - every played hand card leaves the hand, and every Hero/Continuous Spell goes into
  // its zone here, for both sides, before anyone's ability dispatches. One-time Spells never occupy a
  // zone - their lane is carried on the DeployPlay itself and read again in the Spells phase.
  const handRemovals: { side: Side; handId: string }[] = [];
  const placements: Placement[] = [];
  for (const side of order) {
    const p = playerOf(ctx, side);
    for (const play of plays[side]) {
      p.hand = p.hand.filter((h) => h.handId !== play.handId);
      handRemovals.push({ side, handId: play.handId });
      const card = getCard(play.cardId);
      if (card.type === 'hero') {
        const instance = makeHeroInstance(side, play.lane, round, play.cardId);
        setHero(ctx, side, play.lane, instance);
        placements.push({ side, lane: play.lane, zone: 'hero', instanceId: instance.instanceId, cardId: instance.cardId });
      } else if (card.spellKind === 'CONTINUOUS') {
        const instance = makeSpellZoneInstance(side, play.lane, round, play.cardId);
        setSpellZone(ctx, side, play.lane, instance);
        placements.push({ side, lane: play.lane, zone: 'spell', instanceId: instance.instanceId, cardId: instance.cardId });
      }
    }
  }
  push(ctx, { type: 'REVEAL', handRemovals, placements });

  // 2. Spells - one-time and Continuous alike, Left -> Center -> Right, initiative breaks lane ties.
  // A one-time Spell resolves its effect immediately and goes straight to the Graveyard - it's never
  // "cast" again. A Continuous Spell activates once here and then simply stays in its slot; it does
  // NOT re-cast every round unless one of its own abilities has a recurring trigger (Burning Ground's
  // ROUND_END, Battle Banner's live CONTINUOUS overlay).
  for (const lane of LANES) {
    for (const side of order) {
      const play = playFor(side, lane, 'spell');
      if (!play) continue;
      const card = getCard(play.cardId);
      if (card.spellKind === 'ONE_TIME') {
        dispatchInstantSpellOnPlay(ctx, side, lane, play.cardId);
      } else {
        const spell = getSpellZone(ctx, side, lane);
        if (spell) push(ctx, { type: 'ON_PLAY', side, instanceId: spell.instanceId, cardId: card.id, name: card.name, lane, zone: 'spell' });
        dispatchTriggerForSpellZone(ctx, side, lane, 'ON_PLAY');
      }
      // Any Hero on the board gets a chance to react to a Spell being played, own side or the
      // opponent's - e.g. "Whenever you play a Spell, gain +1 Power this round."
      dispatchSpellPlayedTriggers(ctx, side);
    }
  }
  sweepPowerZero(ctx); // catches any Hero a Spell reduced to Power <= 0 before Hero On Play/Combat

  // 3. Hero On Play - Left -> Center -> Right, initiative breaks lane ties.
  for (const lane of LANES) {
    for (const side of order) {
      const play = playFor(side, lane, 'hero');
      if (!play) continue;
      const card = getCard(play.cardId);
      const hero = getHero(ctx, side, lane);
      if (hero) push(ctx, { type: 'ON_PLAY', side, instanceId: hero.instanceId, cardId: card.id, name: card.name, lane, zone: 'hero' });
      dispatchTriggerForHero(ctx, side, lane, 'ON_PLAY');
    }
  }
  sweepPowerZero(ctx);

  // 4. Before Combat
  dispatchTriggerForAllZones(ctx, 'BEFORE_COMBAT');

  // 5. Combat - compare EFFECTIVE Power per lane (base + any active Continuous Spell overlay, e.g.
  // Battle Banner). Higher Power wins and survives completely unchanged - normal Combat never chips
  // the winner's Power. The loser is destroyed AND the difference (winner Power - loser Power)
  // overflows through as direct damage to the losing side's player. A tie destroys both with no
  // overflow. An unopposed Hero still deals its full current Power directly (unchanged).
  const combatLosers: { side: Side; lane: LaneId }[] = [];
  for (const lane of LANES) {
    const pHero = getHero(ctx, 'player', lane);
    const eHero = getHero(ctx, 'enemy', lane);
    const pPower = pHero ? effectivePower(ctx.state, 'player', lane) : 0;
    const ePower = eHero ? effectivePower(ctx.state, 'enemy', lane) : 0;

    if (pHero && eHero) {
      if (pPower > ePower) {
        push(ctx, { type: 'COMBAT', lane, outcome: 'PLAYER_WINS', player: { name: pHero.name, power: pPower }, enemy: { name: eHero.name, power: ePower } });
        combatLosers.push({ side: 'enemy', lane });
        const overflow = Math.max(0, pPower - ePower - overflowReductionFor(ctx, 'enemy', lane));
        dealOverflowDamage(ctx, 'player', lane, overflow, pHero.name, eHero.name);
      } else if (ePower > pPower) {
        push(ctx, { type: 'COMBAT', lane, outcome: 'ENEMY_WINS', player: { name: pHero.name, power: pPower }, enemy: { name: eHero.name, power: ePower } });
        combatLosers.push({ side: 'player', lane });
        const overflow = Math.max(0, ePower - pPower - overflowReductionFor(ctx, 'player', lane));
        dealOverflowDamage(ctx, 'enemy', lane, overflow, eHero.name, pHero.name);
      } else {
        push(ctx, { type: 'COMBAT', lane, outcome: 'TIE', player: { name: pHero.name, power: pPower }, enemy: { name: eHero.name, power: ePower } });
        combatLosers.push({ side: 'player', lane }, { side: 'enemy', lane });
      }
    } else if (pHero && !eHero) {
      push(ctx, { type: 'COMBAT', lane, outcome: 'PLAYER_DIRECT', player: { name: pHero.name, power: pPower }, enemy: null });
      dealDirectDamageAndTrigger(ctx, 'player', lane, directDamageAmount(pPower), pHero.name);
    } else if (eHero && !pHero) {
      push(ctx, { type: 'COMBAT', lane, outcome: 'ENEMY_DIRECT', player: null, enemy: { name: eHero.name, power: ePower } });
      dealDirectDamageAndTrigger(ctx, 'enemy', lane, directDamageAmount(ePower), eHero.name);
    } else {
      push(ctx, { type: 'COMBAT', lane, outcome: 'EMPTY', player: null, enemy: null });
    }
  }

  // 6. destruction queue + death-trigger chains (On Death / Ally Dies / Enemy Dies)
  destroyAndChain(ctx, combatLosers);

  // 7. After Combat
  dispatchTriggerForAllZones(ctx, 'AFTER_COMBAT');

  // 8. Round End abilities (Ancient Treant, Burning Ground, Growth Totem, ...)
  dispatchTriggerForAllZones(ctx, 'ROUND_END');

  // 9. Temporary effect cleanup - expire this-round-only Power changes now that Round End abilities
  // have already seen them.
  for (const side of ['player', 'enemy'] as Side[]) {
    const p = playerOf(ctx, side);
    for (const lane of LANES) {
      const hero = p.heroZones[lane];
      if (hero && hero.tempPower !== 0) {
        const from = hero.power;
        hero.power -= hero.tempPower;
        push(ctx, { type: 'TEMP_POWER_EXPIRED', side, name: hero.name, amount: hero.tempPower });
        push(ctx, { type: 'POWER_CHANGED', side, instanceId: hero.instanceId, name: hero.name, from, to: hero.power, reason: 'Round End', permanent: false });
        hero.tempPower = 0;
      }
    }
  }
  sweepPowerZero(ctx); // catches Burning Ground-style Round End debuffs finishing off a weak Hero

  // 10. cleanup
  push(ctx, { type: 'ROUND_END', round });
  ctx.state.round = round + 1;

  // 11. win check
  const playerDead = ctx.state.player.hp <= 0;
  const enemyDead = ctx.state.enemy.hp <= 0;
  if (playerDead && enemyDead) {
    ctx.state.status = 'DRAW';
    push(ctx, { type: 'MATCH_END', winner: 'draw', reason: 'Both players reached 0 HP in the same round' });
  } else if (enemyDead) {
    ctx.state.status = 'PLAYER_WIN';
    push(ctx, { type: 'MATCH_END', winner: 'player', reason: 'Enemy HP reached 0' });
  } else if (playerDead) {
    ctx.state.status = 'ENEMY_WIN';
    push(ctx, { type: 'MATCH_END', winner: 'enemy', reason: 'Your HP reached 0' });
  }

  ctx.state.rngState = ctx.rngState;
  return { nextState: ctx.state, events: ctx.events };
}
