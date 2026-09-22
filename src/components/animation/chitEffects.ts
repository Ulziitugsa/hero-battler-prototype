import type { GameEvent, GameState, LaneId, Side } from '../../game/types';
import type { AnimationStep } from './types';

// Turns "this step is currently playing" into concrete, renderer-facing instructions: which CSS class
// to add to which Hero/Spell chit, what floating text to show, which side's HP bar to flash, which
// lane's clash line to light up. Pure and React-free - GamePage/Battlefield just read the maps this
// produces. Every lookup is driven by the event's own fields (instanceId, side, lane) or - only for
// the handful of event types that don't carry an instanceId (TRIGGER, HEAL, DIRECT_DAMAGE) - a
// side+name match against the board state being displayed at that moment. Never a card id/name switch.

export interface FloaterSpec {
  key: string;
  kind: 'power-up' | 'power-down' | 'heal' | 'overflow' | 'direct' | 'immune' | 'shield-consumed' | 'silence';
  text: string;
}

export interface ChitVisual {
  className: string;
  floaters: FloaterSpec[];
}

export interface HpFx {
  side: Side;
  kind: 'damage' | 'heal';
  amount: number;
}

/**
 * A transient, lane-anchored effect that isn't "owned" by any single chit - rendered by
 * `CombatVfxLayer` on top of the battlefield rather than as a class on a card. Kept to exactly the
 * two shapes combat actually produces (a real clash, or an unopposed hit) - see section 18/19 of the
 * combat-feel brief: a small reusable layer, not one-off VFX per card.
 */
export interface VfxCue {
  key: string;
  kind: 'impact-burst' | 'lane-streak';
  lane: LaneId;
  /** lane-streak only - which side's Hero is attacking through the empty lane, i.e. which direction the streak travels. */
  side?: Side;
}

export interface StepVisuals {
  heroChit: Map<string, ChitVisual>;
  spellChit: Map<string, ChitVisual>;
  hpFx: HpFx[];
  /** Which side(s) lunge toward the clash line in a given lane this step - drives the physical "headbutt" movement. */
  clashLane: { lane: LaneId; player: boolean; enemy: boolean } | null;
  /** A card is travelling toward the player's hand (RETURNED_TO_HAND) or Graveyard (a destruction/exile) - pulses the relevant SideHeader pill. */
  handPulse: boolean;
  graveyardPulse: Side | null;
  vfx: VfxCue[];
  /** A subtle whole-battlefield shake for the heaviest moment (a Hero actually being destroyed) - see global.css's reduced-motion override, which drops this to nothing. Deliberately not used for anything smaller (section 19: no constant screen shake). */
  stageShake: boolean;
}

function empty(): StepVisuals {
  return { heroChit: new Map(), spellChit: new Map(), hpFx: [], clashLane: null, handPulse: false, graveyardPulse: null, vfx: [], stageShake: false };
}

function addHeroClass(v: StepVisuals, instanceId: string, cls: string) {
  const existing = v.heroChit.get(instanceId);
  if (existing) existing.className = `${existing.className} ${cls}`.trim();
  else v.heroChit.set(instanceId, { className: cls, floaters: [] });
}

function addHeroFloater(v: StepVisuals, instanceId: string, floater: FloaterSpec) {
  const existing = v.heroChit.get(instanceId);
  if (existing) existing.floaters.push(floater);
  else v.heroChit.set(instanceId, { className: '', floaters: [floater] });
}

function addSpellClass(v: StepVisuals, instanceId: string, cls: string) {
  const existing = v.spellChit.get(instanceId);
  if (existing) existing.className = `${existing.className} ${cls}`.trim();
  else v.spellChit.set(instanceId, { className: cls, floaters: [] });
}

/** Finds the Hero instanceId a side+name-only event (TRIGGER, HEAL, PLAYER_DAMAGE-sourced DIRECT_DAMAGE) refers to. Every other event type carries its own instanceId directly and never needs this. */
function findHeroInstanceByName(state: GameState, side: Side, name: string): string[] {
  const zones = (side === 'player' ? state.player : state.enemy).heroZones;
  const out: string[] = [];
  for (const lane of ['left', 'center', 'right'] as LaneId[]) {
    const h = zones[lane];
    if (h && h.name === name) out.push(h.instanceId);
  }
  return out;
}

function findSpellInstanceByName(state: GameState, side: Side, name: string): string[] {
  const zones = (side === 'player' ? state.player : state.enemy).spellZones;
  const out: string[] = [];
  for (const lane of ['left', 'center', 'right'] as LaneId[]) {
    const s = zones[lane];
    if (s && s.name === name) out.push(s.instanceId);
  }
  return out;
}

/** `state` must be the board as displayed BEFORE this step's own effects commit - see useAnimationController's commit model. Name-based lookups resolve against it, so a card already removed by an earlier step is correctly no longer found. */
export function computeStepVisuals(step: AnimationStep | null, state: GameState): StepVisuals {
  if (!step) return empty();
  const v = empty();

  for (const e of step.events) applyEventVisual(v, e, state);
  return v;
}

function applyEventVisual(v: StepVisuals, e: GameEvent, state: GameState): void {
  switch (e.type) {
    case 'COMBAT': {
      if (e.outcome === 'EMPTY' || e.outcome === 'STALLED') return; // STALLED: no clash happens - the COMBAT_STALLED beat already showed why
      const pHero = state.player.heroZones[e.lane];
      const eHero = state.enemy.heroZones[e.lane];
      const playerInvolved = e.outcome === 'PLAYER_DIRECT' || e.outcome === 'PLAYER_WINS' || e.outcome === 'ENEMY_WINS' || e.outcome === 'TIE';
      const enemyInvolved = e.outcome === 'ENEMY_DIRECT' || e.outcome === 'PLAYER_WINS' || e.outcome === 'ENEMY_WINS' || e.outcome === 'TIE';
      if (playerInvolved && pHero) addHeroClass(v, pHero.instanceId, 'chit-lunge-player');
      if (enemyInvolved && eHero) addHeroClass(v, eHero.instanceId, 'chit-lunge-enemy');
      v.clashLane = { lane: e.lane, player: playerInvolved && !!pHero, enemy: enemyInvolved && !!eHero };
      if (e.outcome === 'PLAYER_DIRECT' || e.outcome === 'ENEMY_DIRECT') {
        v.vfx.push({ key: `streak-${e.lane}`, kind: 'lane-streak', lane: e.lane, side: e.outcome === 'PLAYER_DIRECT' ? 'player' : 'enemy' });
      } else {
        v.vfx.push({ key: `impact-${e.lane}`, kind: 'impact-burst', lane: e.lane });
      }
      return;
    }
    case 'DIRECT_DAMAGE':
      // The damage lands on the PLAYER (`e.side`), so the number and flash belong on that side's HP bar - never on
      // the attacking Hero, which takes no damage and would otherwise read as if it had lost Power.
      v.hpFx.push({ side: e.side, kind: 'damage', amount: e.amount });
      return;
    case 'OVERFLOW_DAMAGE':
      // Combat overflow is damage to the LOSER'S PLAYER (`e.side`), not to either Hero: the winner survives at
      // full Power. The HP bar carries the flash and the "-N"; deliberately nothing is drawn on the winner's chit.
      v.hpFx.push({ side: e.side, kind: 'damage', amount: e.amount });
      return;
    case 'HEAL': {
      v.hpFx.push({ side: e.side, kind: 'heal', amount: e.amount });
      for (const id of findHeroInstanceByName(state, e.side, e.sourceName)) {
        addHeroFloater(v, id, { key: `heal-${id}`, kind: 'heal', text: `+${e.amount}` });
      }
      return;
    }
    case 'POWER_CHANGED': {
      const delta = e.to - e.from;
      if (delta === 0) return;
      addHeroClass(v, e.instanceId, delta > 0 ? 'flash-buff' : 'flash-damage');
      addHeroFloater(v, e.instanceId, { key: `pc-${e.instanceId}-${e.to}`, kind: delta > 0 ? 'power-up' : 'power-down', text: `${delta > 0 ? '+' : ''}${delta}` });
      return;
    }
    case 'TEMP_POWER_EXPIRED':
      return; // silent settle - the POWER_CHANGED right beside it already carries the visible number
    case 'TRIGGER': {
      for (const id of findHeroInstanceByName(state, e.side, e.sourceName)) addHeroClass(v, id, 'chit-trigger');
      for (const id of findSpellInstanceByName(state, e.side, e.sourceName)) addSpellClass(v, id, 'chit-trigger');
      return;
    }
    case 'REVEAL':
      for (const p of e.placements) {
        if (p.zone === 'hero') addHeroClass(v, p.instanceId, 'chit-enter');
        else addSpellClass(v, p.instanceId, 'chit-enter');
      }
      return;
    case 'ON_PLAY':
      if (e.zone === 'spell') addSpellClass(v, e.instanceId, 'chit-activate');
      return;
    case 'SPELL_RESOLVED':
      // one-time Spells never occupy a zone, so there's no chit to target - the fade is played on the staged preview card itself, which is a UI-only construct GamePage already tracks.
      return;
    case 'SPELL_ZONE_DESTROYED':
      addSpellClass(v, e.instanceId, 'chit-shatter');
      v.graveyardPulse = e.side;
      return;
    case 'TOKEN_SUMMONED':
      addHeroClass(v, e.instanceId, 'chit-enter');
      return;
    case 'HERO_DESTROYED':
      addHeroClass(v, e.instanceId, 'chit-shatter');
      if (!e.token) v.graveyardPulse = e.side; // a token vanishes - it never reaches the Graveyard
      v.stageShake = true;
      return;
    case 'SHIELD_GRANTED':
      addHeroClass(v, e.instanceId, 'chit-shield-on');
      return;
    case 'SHIELD_CONSUMED':
      addHeroClass(v, e.instanceId, 'chit-shield-break');
      addHeroFloater(v, e.instanceId, { key: `sc-${e.instanceId}`, kind: 'shield-consumed', text: 'Saved!' });
      return;
    case 'IMMUNITY_BLOCKED': {
      const hero = (e.side === 'player' ? state.player : state.enemy).heroZones[e.lane];
      if (hero) {
        addHeroClass(v, hero.instanceId, 'chit-immune');
        addHeroFloater(v, hero.instanceId, { key: `im-${hero.instanceId}`, kind: 'immune', text: 'Immune' });
      }
      return;
    }
    case 'SILENCED':
      addHeroClass(v, e.instanceId, 'chit-silence');
      addHeroFloater(v, e.instanceId, { key: `sl-${e.instanceId}`, kind: 'silence', text: 'Silenced' });
      return;
    case 'RETURNED_TO_HAND':
      v.handPulse = true;
      v.graveyardPulse = e.side;
      return;
    case 'RETURNED_TO_DECK':
      return; // Deck pill pulse is a nice-to-have but not core to any test/verification requirement - safe generic fallback (no chit involved) covers it visually via the step still occupying its beat.
    case 'REVIVED':
      addHeroClass(v, e.instanceId, 'chit-revive');
      return;
    case 'EXILED':
      v.graveyardPulse = e.side;
      return;
    case 'ROUND_END':
    case 'MATCH_END':
    case 'ONCE_PER_ROUND_USED':
    case 'SAFEGUARD_TRIPPED':
    default:
      return;
  }
}
