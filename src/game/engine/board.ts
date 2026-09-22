import type { GameEvent, GameState, HeroInstance, LaneId, Side, SpellZoneInstance } from '../types/index.js';
import { LANES } from '../types/index.js';

/** Mutable working copy of a GameState used only inside a single resolveRound() call. Never shared/aliased with the caller's state. */
export interface Ctx {
  state: GameState;
  events: GameEvent[];
  rngState: number;
}

export function opposite(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}

export function playerOf(ctx: Ctx, side: Side) {
  return side === 'player' ? ctx.state.player : ctx.state.enemy;
}

export function getHero(ctx: Ctx, side: Side, lane: LaneId): HeroInstance | null {
  return playerOf(ctx, side).heroZones[lane];
}

export function setHero(ctx: Ctx, side: Side, lane: LaneId, hero: HeroInstance | null): void {
  playerOf(ctx, side).heroZones[lane] = hero;
}

export function getSpellZone(ctx: Ctx, side: Side, lane: LaneId): SpellZoneInstance | null {
  return playerOf(ctx, side).spellZones[lane];
}

export function setSpellZone(ctx: Ctx, side: Side, lane: LaneId, spell: SpellZoneInstance | null): void {
  playerOf(ctx, side).spellZones[lane] = spell;
}

export function livingHeroes(ctx: Ctx, side: Side): { lane: LaneId; hero: HeroInstance }[] {
  const out: { lane: LaneId; hero: HeroInstance }[] = [];
  for (const lane of LANES) {
    const h = getHero(ctx, side, lane);
    if (h) out.push({ lane, hero: h });
  }
  return out;
}

export function occupiedSpellZones(ctx: Ctx, side: Side): { lane: LaneId; spell: SpellZoneInstance }[] {
  const out: { lane: LaneId; spell: SpellZoneInstance }[] = [];
  for (const lane of LANES) {
    const s = getSpellZone(ctx, side, lane);
    if (s) out.push({ lane, spell: s });
  }
  return out;
}

export function push(ctx: Ctx, event: GameEvent): void {
  ctx.events.push(event);
}

export function makeInstanceId(kind: 'h' | 's', side: Side, lane: LaneId, round: number): string {
  return `${kind}-${side}-${lane}-r${round}`;
}
