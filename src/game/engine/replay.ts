import type { GameEvent, GameState, LaneId, Side } from '../types';
import { LANES } from '../types';
import { ascensionRank, heroLevelOf, makeHeroInstance, makeSpellZoneInstance } from './abilities';

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
          const hero = makeHeroInstance(placement.side, placement.lane, next.round, placement.cardId, ascensionRank(next, placement.side, placement.cardId), heroLevelOf(next, placement.side, placement.cardId), next.combatModel);
          // The card resolver records the exact ATK a Unit entered with and its own instance id.
          if (placement.power !== undefined) hero.power = placement.power;
          hero.instanceId = placement.instanceId;
          side.heroZones[placement.lane] = hero;
        } else {
          const spell = makeSpellZoneInstance(placement.side, placement.lane, next.round, placement.cardId);
          spell.instanceId = placement.instanceId;
          side.spellZones[placement.lane] = spell;
        }
      }
      return next;
    }
    case 'ON_PLAY':
      // The board entity itself was already placed at REVEAL, and its hand card already removed -
      // this event is just the trigger announcement/log marker.
      return next;
    case 'SPELL_ENTERED': {
      // Card resolver v4: the Spell zone was placed at REVEAL; an Attached Spell records its Unit.
      const zone = (event.side === 'player' ? p : e).spellZones[event.lane];
      if (zone && event.attachedTo) zone.boundTo = event.attachedTo.instanceId;
      return next;
    }
    case 'SPELL_EXPIRED': {
      // An Attached Spell left play with its Unit.
      const side = event.side === 'player' ? p : e;
      side.spellZones[event.lane] = null;
      side.graveyard.push(event.cardId);
      return next;
    }
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
    case 'CLASH_DAMAGE': {
      if (event.side === null || event.to === undefined) return next; // a tie moves no Player HP
      (event.side === 'player' ? p : e).hp = event.to;
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
      if (!event.token) side.graveyard.push(event.cardId); // a token vanishes instead of entering the Graveyard
      return next;
    }
    case 'TOKEN_SUMMONED': {
      const side = event.side === 'player' ? p : e;
      const token = makeHeroInstance(event.side, event.lane, next.round, event.cardId, 0, 1, next.combatModel);
      token.instanceId = event.instanceId;
      token.token = true;
      token.power = event.power;
      side.heroZones[event.lane] = token;
      return next;
    }
    case 'HERO_DAMAGE':
    case 'HERO_HEAL': {
      const side = event.side === 'player' ? p : e;
      const hero = side.heroZones[event.lane];
      if (hero?.instanceId === event.instanceId) hero.hp = event.to;
      return next;
    }
    case 'HERO_SHIELD_APPLIED': {
      const side = event.side === 'player' ? p : e;
      const hero = side.heroZones[event.lane];
      if (hero?.instanceId === event.instanceId) hero.combatShield = (hero.combatShield ?? 0) + event.amount;
      return next;
    }
    case 'CARD_DRAWN': {
      const side = event.side === 'player' ? p : e;
      const idx = side.deck.indexOf(event.cardId);
      if (idx >= 0) side.deck.splice(idx, 1);
      side.hand.push({ handId: event.handId, cardId: event.cardId });
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
      const instance = makeHeroInstance(event.side, event.lane, next.round, event.cardId, ascensionRank(next, event.side, event.cardId), heroLevelOf(next, event.side, event.cardId), next.combatModel);
      instance.power = event.power; // may differ from the card's base Power (e.g. Vharos's reduced self-revival)
      instance.instanceId = event.instanceId;
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
        if (hero) {
          // A granted Shield goes first; card combat's printed Shield (Paladin) is used up after it.
          if (hero.shielded) hero.shielded = false;
          else if (next.combatModel === 'card') hero.printedShieldUsed = true;
          if (next.combatModel === 'v2' && (hero.hp ?? 1) <= 0) hero.hp = 1;
        }
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
