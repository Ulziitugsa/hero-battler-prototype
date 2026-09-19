import type { LaneId, Side } from '../types';
import { getCard } from '../cards';
import { MASTERIES, getMasteryRankParams, isMasteryId } from '../mastery/definitions';
import { livingHeroes, playerOf, push, type Ctx } from './board';
import { grantShield } from './abilities';
import { nextRandom } from './rng';

// Mastery resolution - inside the deterministic engine, never in React, never on a timer.
//
// TIMING: `applyMasteries` is called once per round from beginRound, AFTER both sides have drawn and
// BEFORE anyone deploys. A Mastery with interval N acts on rounds divisible by N. Nothing else in the
// engine triggers Masteries, so they can never fire in the middle of unrelated effect resolution.
//
// EFFECTS reuse existing primitives and events: Necromancy moves a Graveyard card to the hand and emits
// RETURNED_TO_HAND; Fortification calls the shared `grantShield` (same shield as GRANT_SHIELD, consumed
// at the same destruction choke point) and emits SHIELD_GRANTED. MASTERY_TRIGGERED is only the label.
// Random choices thread ctx.rngState like every other engine decision, so identical seeds replay
// identically. Each activation is bounded (count Heroes, once per interval) - nothing can loop.

function pickIndex(ctx: Ctx, length: number): number {
  const { value, nextState } = nextRandom(ctx.rngState);
  ctx.rngState = nextState;
  return Math.floor(value * length);
}

/** Necromancy: return up to `count` Heroes from the Graveyard to the hand. Spells are ignored; `preferFaction` narrows the pool only when it has a match. Returns the names returned. */
function necromancy(ctx: Ctx, side: Side, count: number, preferFaction: string | undefined): string[] {
  const p = playerOf(ctx, side);
  const returned: string[] = [];
  for (let n = 0; n < count; n++) {
    const heroes = p.graveyard.map((cardId, index) => ({ cardId, index })).filter((e) => getCard(e.cardId).type === 'hero');
    if (heroes.length === 0) break;
    const preferred = preferFaction ? heroes.filter((e) => getCard(e.cardId).faction === preferFaction) : [];
    const pool = preferred.length > 0 ? preferred : heroes;
    const pick = pool[pickIndex(ctx, pool.length)];
    p.graveyard.splice(pick.index, 1);
    const handId = `hand-${side}-mastery-r${ctx.state.round}-${n}-${pick.cardId}`;
    p.hand.push({ handId, cardId: pick.cardId });
    push(ctx, { type: 'RETURNED_TO_HAND', side, cardId: pick.cardId, name: getCard(pick.cardId).name, graveyardIndex: pick.index, handId });
    returned.push(getCard(pick.cardId).name);
  }
  return returned;
}

/** Fortification: shield up to `count` distinct allied Heroes. With `preferUnshielded`, Heroes without a shield are chosen first; without it a random Hero is chosen and an already-shielded pick simply wastes that shield (same as GRANT_SHIELD). */
function fortification(ctx: Ctx, side: Side, count: number, preferUnshielded: boolean): string[] {
  const shielded: string[] = [];
  const taken = new Set<LaneId>();
  for (let n = 0; n < count; n++) {
    const heroes = livingHeroes(ctx, side).filter((h) => !taken.has(h.lane));
    if (heroes.length === 0) break;
    const unshielded = heroes.filter((h) => !h.hero.shielded);
    const pool = preferUnshielded ? (unshielded.length > 0 ? unshielded : []) : heroes;
    if (pool.length === 0) break;
    const pick = pool[pickIndex(ctx, pool.length)];
    taken.add(pick.lane);
    if (grantShield(ctx, side, pick.lane)) shielded.push(pick.hero.name);
  }
  return shielded;
}

export function applyMasteries(ctx: Ctx): void {
  for (const side of ['player', 'enemy'] as Side[]) applyMastery(ctx, side);
}

function applyMastery(ctx: Ctx, side: Side): void {
  const loadout = ctx.state.masteries?.[side];
  if (!loadout || !isMasteryId(loadout.id)) return;
  const def = MASTERIES[loadout.id];
  if (!def.implemented) return;
  const params = getMasteryRankParams(def.id, loadout.rank);
  if (ctx.state.round % params.interval !== 0) return;

  // The effect events are pushed first (we don't know the outcome until they ran); the label is then
  // inserted in FRONT of them so the log reads "Mastery fired -> what it did".
  const start = ctx.events.length;
  const affected = def.id === 'necromancy' ? necromancy(ctx, side, params.count, params.preferFaction) : fortification(ctx, side, params.count, !!params.preferUnshielded);
  const verb = def.id === 'necromancy' ? 'Returned' : 'Shielded';
  const none = def.id === 'necromancy' ? 'No Hero in your Graveyard' : 'No Hero to shield';
  ctx.events.splice(start, 0, {
    type: 'MASTERY_TRIGGERED',
    side,
    masteryId: def.id,
    name: def.name,
    rank: loadout.rank,
    outcome: affected.length > 0 ? 'applied' : 'no-target',
    detail: affected.length > 0 ? `${verb} ${affected.join(' and ')}` : none,
  });
}

