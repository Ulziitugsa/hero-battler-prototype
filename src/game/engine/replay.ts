import type { GameEvent, GameState, LaneId, Side } from '../types';
import { LANES } from '../types';
import { ascensionRank, makeHeroInstance, makeSpellZoneInstance } from './abilities';

// Pure playback reducer used ONLY by the UI to reconstruct intermediate board states while animating
// through a resolved round's event log. It never decides anything - every number it applies (the
// `to` on a POWER_CHANGED/DIRECT_DAMAGE/HEAL event, the lane on a REVIVED event) was already computed
// by resolveRound(). This exists so the board can visibly step through Reveal -> Spells -> Hero On
// Play -> Combat -> deaths -> triggers instead of jump-cutting straight to the final state.

function findHeroLane(state: GameState, side: Side, instanceId: string): LaneId | undefined {
  const zones = (side === 'player' ? state.player : state.enemy).heroZones;
  return LANES.find((l) => zones[l]?.instanceId === instanceId);
}

function findSpellZoneLane(state: GameState, side: Side, instanceId: string): LaneId | undefined {
  const zones = (side === 'player' ? state.player : state.enemy).spellZones;
  return LANES.find((l) => zones[l]?.instanceId === instanceId);
}

export function applyEvent(state: GameState, event: GameEvent): GameState {
  const next = structuredClone(state);
  const p = next.player;
  const e = next.enemy;

  switch (event.type) {
    case 'REVEAL': {
      for (const removal of event.handRemovals) {
        const side = removal.side === 'player' ? p : e;
        side.hand = side.hand.filter((h) => h.handId !== removal.handId);
      }
      for (const placement of event.placements) {
        const side = placement.side === 'player' ? p : e;
        if (placement.zone === 'hero') {
          side.heroZones[placement.lane] = makeHeroInstance(placement.side, placement.lane, next.round, placement.cardId, ascensionRank(next, placement.side, placement.cardId));
        } else {
          side.spellZones[placement.lane] = makeSpellZoneInstance(placement.side, placement.lane, next.round, placement.cardId);
        }
      }
      return next;
    }
    case 'ON_PLAY':
      // The board entity itself was already placed at REVEAL, and its hand card already removed -
      // this event is just the trigger announcement/log marker.
      return next;
    case 'SPELL_RESOLVED': {
      const side = event.side === 'player' ? p : e;
      side.graveyard.push(event.cardId); // a one-time Spell always ends up in the Graveyard once resolved
      return next;
    }
    case 'SPELL_ZONE_DESTROYED': {
      const side = event.side === 'player' ? p : e;
      side.spellZones[event.lane] = null;
      side.graveyard.push(event.cardId);
      return next;
    }
    case 'POWER_CHANGED': {
      const side = event.side === 'player' ? p : e;
      const lane = findHeroLane(next, event.side, event.instanceId);
      if (lane) {
        const hero = side.heroZones[lane];
        if (hero) hero.power = event.to;
      }
      return next;
    }
    case 'DIRECT_DAMAGE':
    case 'OVERFLOW_DAMAGE':
    case 'HEAL': {
      const side = event.side === 'player' ? p : e;
      side.hp = event.to;
      return next;
    }
    case 'HERO_DESTROYED': {
      const side = event.side === 'player' ? p : e;
      side.heroZones[event.lane] = null;
      side.graveyard.push(event.cardId);
      return next;
    }
    case 'RETURNED_TO_HAND': {
      const side = event.side === 'player' ? p : e;
      side.graveyard.splice(event.graveyardIndex, 1);
      side.hand.push({ handId: event.handId, cardId: event.cardId });
      if (event.usedSpellZoneLane) {
        const zone = side.spellZones[event.usedSpellZoneLane];
        if (zone) zone.usedThisRound = true;
      }
      return next;
    }
    case 'RETURNED_TO_DECK': {
      const side = event.side === 'player' ? p : e;
      const idx = side.graveyard.lastIndexOf(event.cardId);
      if (idx >= 0) side.graveyard.splice(idx, 1);
      side.deck.push(event.cardId);
      return next;
    }
    case 'REVIVED': {
      const side = event.side === 'player' ? p : e;
      side.graveyard.splice(event.graveyardIndex, 1);
      const instance = makeHeroInstance(event.side, event.lane, next.round, event.cardId, ascensionRank(next, event.side, event.cardId));
      instance.power = event.power; // may differ from the card's base Power (e.g. Vharos's reduced self-revival)
      side.heroZones[event.lane] = instance;
      return next;
    }
    case 'EXILED': {
      const side = event.side === 'player' ? p : e;
      side.graveyard.splice(event.graveyardIndex, 1);
      return next;
    }
    case 'SHIELD_GRANTED': {
      const side = event.side === 'player' ? p : e;
      const lane = findHeroLane(next, event.side, event.instanceId);
      if (lane) {
        const hero = side.heroZones[lane];
        if (hero) hero.shielded = true;
      }
      return next;
    }
    case 'SHIELD_CONSUMED': {
      const side = event.side === 'player' ? p : e;
      const lane = findHeroLane(next, event.side, event.instanceId);
      if (lane) {
        const hero = side.heroZones[lane];
        if (hero) hero.shielded = false;
      }
      return next;
    }
    case 'SILENCED': {
      const side = event.side === 'player' ? p : e;
      const lane = findHeroLane(next, event.side, event.instanceId);
      if (lane) {
        const hero = side.heroZones[lane];
        if (hero) hero.silenced = true;
      }
      return next;
    }
    case 'ONCE_PER_ROUND_USED': {
      const side = event.side === 'player' ? p : e;
      if (event.zone === 'hero') {
        const lane = findHeroLane(next, event.side, event.instanceId);
        if (lane) {
          const hero = side.heroZones[lane];
          if (hero) hero.usedThisRound = true;
        }
      } else {
        const lane = findSpellZoneLane(next, event.side, event.instanceId);
        if (lane) {
          const zone = side.spellZones[lane];
          if (zone) zone.usedThisRound = true;
        }
      }
      return next;
    }
    case 'ROUND_END':
      next.round = event.round + 1;
      return next;
    case 'MATCH_END':
      next.status = event.winner === 'draw' ? 'DRAW' : event.winner === 'player' ? 'PLAYER_WIN' : 'ENEMY_WIN';
      return next;
    default:
      return next;
  }
}

/** Replays events[0..index] on top of `base`, for scrubbing/animating a resolved round. */
export function replayUpTo(base: GameState, events: GameEvent[], index: number): GameState {
  let s = base;
  for (let i = 0; i <= index && i < events.length; i++) s = applyEvent(s, events[i]);
  return s;
}
