import { describe, expect, it } from 'vitest';
import type { GameState, HeroInstance, PlayerState } from '../../game/types';
import { getCard } from '../../game/cards';
import { resolveRound } from '../../game/engine/resolveRound';
import { buildAnimationSteps } from './buildAnimationSteps';
import { computeStepVisuals } from './chitEffects';

// Combat-feel refinement pass: tests for the new lane-anchored VFX cues (impact-burst / lane-streak),
// the whole-battlefield shake flag, and HP fx now carrying a raw amount for the floating number near
// the HP bar. Mirrors the fixture style used elsewhere in components/animation.

function hero(cardId: string, power: number, id = 'h1', overrides: Partial<HeroInstance> = {}): HeroInstance {
  const card = getCard(cardId);
  return { instanceId: id, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, ...overrides };
}

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    side: 'player',
    hp: 20,
    deck: [],
    hand: [],
    graveyard: [],
    heroZones: { left: null, center: null, right: null },
    spellZones: { left: null, center: null, right: null },
    ...overrides,
  };
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    round: 1,
    rngState: 42,
    player: player(),
    enemy: { ...player(), side: 'enemy' },
    status: 'IN_PROGRESS',
    ...overrides,
  };
}

const NO_PLAYS = { plays: [] };

describe('VfxCue - Hero-vs-Hero clash produces an impact-burst, not a streak', () => {
  it('pushes exactly one impact-burst cue for the clashing lane', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 7, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 3, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);
    const clash = steps.find((st) => st.visualType === 'combat-clash' && st.lane === 'left')!;
    const visuals = computeStepVisuals(clash, s);
    expect(visuals.vfx).toEqual([{ key: 'impact-left', kind: 'impact-burst', lane: 'left' }]);
  });
});

describe('VfxCue - an unopposed attack produces a lane-streak toward the target side', () => {
  it('streaks toward the enemy when the player attacks an empty lane', () => {
    const s = state({ player: player({ heroZones: { left: hero('kng-common-knight', 6, 'p1'), center: null, right: null } }) });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);
    const clash = steps.find((st) => st.visualType === 'combat-clash' && st.lane === 'left')!;
    const visuals = computeStepVisuals(clash, s);
    expect(visuals.vfx).toEqual([{ key: 'streak-left', kind: 'lane-streak', lane: 'left', side: 'player' }]);
  });

  it('streaks toward the player when the enemy attacks an empty lane', () => {
    const s = state({ enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 6, 'e1'), center: null, right: null } }), side: 'enemy' } });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);
    const clash = steps.find((st) => st.visualType === 'combat-clash' && st.lane === 'left')!;
    const visuals = computeStepVisuals(clash, s);
    expect(visuals.vfx).toEqual([{ key: 'streak-left', kind: 'lane-streak', lane: 'left', side: 'enemy' }]);
  });

  it('produces no VfxCue at all for an empty-vs-empty lane', () => {
    const s = state();
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);
    const clash = steps.find((st) => st.visualType === 'combat-clash' && st.lane === 'left')!;
    const visuals = computeStepVisuals(clash, s);
    expect(visuals.vfx).toEqual([]);
  });
});

describe('stageShake - only the heaviest moment (an actual Hero destruction) triggers it', () => {
  it('is true for the hero-destroyed step', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 7, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 3, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);
    const destroy = steps.find((st) => st.visualType === 'hero-destroyed' && st.lane === 'left')!;
    const visuals = computeStepVisuals(destroy, s);
    expect(visuals.stageShake).toBe(true);
  });

  it('is false for the clash step itself, and for a shield-saved "destruction"', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 7, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 3, 'e1', { shielded: true }), center: null, right: null } }), side: 'enemy' },
    });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);
    const clash = steps.find((st) => st.visualType === 'combat-clash' && st.lane === 'left')!;
    expect(computeStepVisuals(clash, s).stageShake).toBe(false);
    const shieldSave = steps.find((st) => st.visualType === 'shield-save' && st.lane === 'left')!;
    expect(computeStepVisuals(shieldSave, s).stageShake).toBe(false);
  });
});

describe('HpFx carries the raw amount for the floating number near the HP bar', () => {
  it('overflow damage reports the correct side, kind and amount', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 7, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 3, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);
    const overflow = steps.find((st) => st.visualType === 'overflow-damage' && st.lane === 'left')!;
    const visuals = computeStepVisuals(overflow, s);
    expect(visuals.hpFx).toEqual([{ side: 'enemy', kind: 'damage', amount: 4 }]);
  });

  it('heal reports the correct side, kind and amount (grouped into its triggering On Play beat)', () => {
    const s = state({ player: player({ hand: [{ handId: 'h1', cardId: 'kng-light-priest' }] }) });
    const { events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'kng-light-priest', lane: 'left' }] }, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);
    const healStep = steps.find((st) => st.events.some((e) => e.type === 'HEAL'))!;
    expect(healStep.visualType).toBe('trigger-pulse'); // Light Priest's HEAL is a consequence of its own ON_PLAY trigger, not a bare beat
    const visuals = computeStepVisuals(healStep, s);
    expect(visuals.hpFx).toEqual([{ side: 'player', kind: 'heal', amount: 3 }]);
  });
});
