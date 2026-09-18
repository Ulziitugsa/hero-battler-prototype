import { describe, expect, it } from 'vitest';
import type { GameState, HeroInstance, PlayerState, SpellZoneInstance } from '../../game/types';
import { getCard } from '../../game/cards';
import { resolveRound } from '../../game/engine/resolveRound';
import { replayUpTo } from '../../game/engine/replay';
import { buildAnimationSteps } from './buildAnimationSteps';

// Presentation-layer tests for the engine-events -> animation-steps conversion. Mirrors the fixture
// style already used in resolveRound.test.ts / richEffects.test.ts. These exercise the REAL resolved
// event log from resolveRound() - buildAnimationSteps is pure and never touches React/DOM/timers, so
// every property here is checked directly against its output, no rendering involved.

function hero(cardId: string, power: number, id = 'h1', overrides: Partial<HeroInstance> = {}): HeroInstance {
  const card = getCard(cardId);
  return { instanceId: id, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, ...overrides };
}

function spell(cardId: string, id = 's1'): SpellZoneInstance {
  const card = getCard(cardId);
  return { instanceId: id, cardId, faction: card.faction, name: card.name, shortName: card.shortName, usedThisRound: false };
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

/** Every event index from the original round must be covered by exactly one step - no event dropped, none duplicated. */
function expectCompleteAndUnique(events: ReturnType<typeof resolveRound>['events'], steps: ReturnType<typeof buildAnimationSteps>) {
  const seen = new Set<unknown>();
  for (const step of steps) {
    for (const e of step.events) {
      expect(seen.has(e)).toBe(false); // no event represented twice
      seen.add(e);
    }
  }
  for (const e of events) expect(seen.has(e)).toBe(true); // every event represented somewhere
  expect(seen.size).toBe(events.length);
}

describe('buildAnimationSteps - completeness and determinism', () => {
  it('covers every event exactly once, and is deterministic across repeated calls', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 7, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 3, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const stepsA = buildAnimationSteps(events);
    const stepsB = buildAnimationSteps(events);
    expectCompleteAndUnique(events, stepsA);
    expect(stepsB.map((st) => ({ visualType: st.visualType, eventTypes: st.events.map((e) => e.type) }))).toEqual(
      stepsA.map((st) => ({ visualType: st.visualType, eventTypes: st.events.map((e) => e.type) })),
    );
  });

  it("the highest maxEventIndex across all steps always reaches the log's last index", () => {
    const s = state({
      player: player({
        hand: [{ handId: 'h1', cardId: 'kng-light-priest' }],
      }),
    });
    const { events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'kng-light-priest', lane: 'left' }] }, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);
    const maxCommitted = Math.max(...steps.map((st) => st.maxEventIndex));
    expect(maxCommitted).toBe(events.length - 1);
  });
});

describe('Hero clash sequence (7 vs 3)', () => {
  it('plays clash, then the loser is destroyed, then overflow damage - in that order', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 7, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 3, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);

    const clashIdx = steps.findIndex((st) => st.visualType === 'combat-clash' && st.lane === 'left');
    const destroyIdx = steps.findIndex((st) => st.visualType === 'hero-destroyed' && st.lane === 'left');
    const overflowIdx = steps.findIndex((st) => st.visualType === 'overflow-damage' && st.lane === 'left');

    expect(clashIdx).toBeGreaterThanOrEqual(0);
    expect(destroyIdx).toBeGreaterThan(clashIdx);
    expect(overflowIdx).toBeGreaterThan(destroyIdx); // "overflow follows destruction" - the brief's own worked example

    // Sanity: the state this sequence describes really did happen.
    expect(nextState.enemy.heroZones.left).toBeNull();
    expect(nextState.enemy.hp).toBe(16); // enemy's Hero lost, so the enemy player takes the 4 overflow (7-3)
  });
});

describe('Equal-Power combat', () => {
  it('destroys both sides and plays no overflow-damage step for that lane', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 5, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 5, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);

    const destroySteps = steps.filter((st) => st.visualType === 'hero-destroyed' && st.lane === 'left');
    expect(destroySteps).toHaveLength(2);
    expect(steps.some((st) => st.visualType === 'overflow-damage' && st.lane === 'left')).toBe(false);
  });
});

describe('Empty-lane direct attack', () => {
  it('plays a clash step followed by a direct-damage step, with no destruction for that lane', () => {
    const s = state({ player: player({ heroZones: { left: hero('kng-common-knight', 6, 'p1'), center: null, right: null } }) });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);

    const clashIdx = steps.findIndex((st) => st.visualType === 'combat-clash' && st.lane === 'left');
    const directIdx = steps.findIndex((st) => st.visualType === 'direct-damage' && st.lane === 'left');
    expect(clashIdx).toBeGreaterThanOrEqual(0);
    expect(directIdx).toBeGreaterThan(clashIdx);
    expect(steps.some((st) => st.visualType === 'hero-destroyed' && st.lane === 'left')).toBe(false);
  });
});

describe('One-time Spell activation precedes its removal', () => {
  it('plays the trigger/activation step before the spell-resolve-fade step for the same Spell', () => {
    const s = state({
      player: player({ hand: [{ handId: 'h1', cardId: 'spl-weakness' }] }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 5, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-weakness', lane: 'left' }] }, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);

    const activateIdx = steps.findIndex((st) => st.visualType === 'trigger-pulse' && st.events.some((e) => e.type === 'TRIGGER' && e.sourceName === 'Weakness'));
    const fadeIdx = steps.findIndex((st) => st.visualType === 'spell-resolve-fade' && st.events.some((e) => e.type === 'SPELL_RESOLVED' && e.cardId === 'spl-weakness'));
    expect(activateIdx).toBeGreaterThanOrEqual(0);
    expect(fadeIdx).toBeGreaterThan(activateIdx);
  });
});

describe('Continuous Spell activation', () => {
  it('plays a continuous-spell-enter step for a newly-placed Continuous Spell', () => {
    const s = state({ player: player({ hand: [{ handId: 'h1', cardId: 'spl-battle-banner' }] }) });
    const { events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-battle-banner', lane: 'left' }] }, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);
    expect(steps.some((st) => st.visualType === 'continuous-spell-enter' && st.events.some((e) => e.type === 'ON_PLAY' && e.cardId === 'spl-battle-banner'))).toBe(true);
  });

  it('does not replay a large activation animation for a Continuous Spell that already stays put and did not trigger this round', () => {
    // A Continuous Spell already on the board with nothing reacting this round contributes no events
    // at all to the log - and therefore no step - which is exactly the "don't replay a big animation
    // every round unless its effect actually triggers" rule; it's implicit in there being no event
    // to build a step from, not something buildAnimationSteps has to special-case.
    const s = state({ player: player({ spellZones: { left: spell('spl-battle-banner'), center: null, right: null } }) });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);
    expect(steps.some((st) => st.visualType === 'continuous-spell-enter')).toBe(false);
  });
});

describe('Shield consumed skips the destruction step', () => {
  it('plays shield-save instead of hero-destroyed when a shielded Hero loses combat', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 3, 'p1', { shielded: true }), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 20, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);

    expect(steps.some((st) => st.visualType === 'hero-destroyed' && st.lane === 'left')).toBe(false);
    const shieldIdx = steps.findIndex((st) => st.visualType === 'shield-save' && st.lane === 'left');
    const clashIdx = steps.findIndex((st) => st.visualType === 'combat-clash' && st.lane === 'left');
    expect(shieldIdx).toBeGreaterThan(clashIdx);
    // The shield only blocks destruction, not overflow - it still happens, just later.
    const overflowIdx = steps.findIndex((st) => st.visualType === 'overflow-damage' && st.lane === 'left');
    expect(overflowIdx).toBeGreaterThan(shieldIdx);
    expect(nextState.player.heroZones.left?.cardId).toBe('kng-common-knight'); // survived
  });
});

describe('Immunity block never animates the blocked effect landing', () => {
  it('produces an immunity-blocked step and no power-change step for the protected Hero', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-royal-guard', 5, 'p1'), center: hero('kng-common-knight', 6, 'p2'), right: null } }),
      enemy: { ...player({ hand: [{ handId: 'h1', cardId: 'spl-weakness' }] }), side: 'enemy' },
    });
    const { events } = resolveRound(s, NO_PLAYS, { plays: [{ handId: 'h1', cardId: 'spl-weakness', lane: 'left' }] }, 1);
    const steps = buildAnimationSteps(events);

    expect(steps.some((st) => st.visualType === 'immunity-blocked')).toBe(true);
    const blockedForRoyalGuard = steps.some((st) => st.visualType === 'power-change' && st.events.some((e) => e.type === 'POWER_CHANGED' && e.instanceId === 'p1'));
    expect(blockedForRoyalGuard).toBe(false);
  });
});

describe('Final render state matches the engine result', () => {
  it('replaying every step in order lands exactly on nextState (rngState excluded, as elsewhere)', () => {
    const s = state({
      player: player({
        hand: [
          { handId: 'h1', cardId: 'kng-royal-guard' },
          { handId: 'h2', cardId: 'spl-power-surge' },
        ],
      }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 1, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(
      s,
      { plays: [{ handId: 'h1', cardId: 'kng-royal-guard', lane: 'left' }, { handId: 'h2', cardId: 'spl-power-surge', lane: 'left' }] },
      NO_PLAYS,
      1,
    );
    const steps = buildAnimationSteps(events);
    const maxCommitted = Math.max(...steps.map((st) => st.maxEventIndex));
    const replayed = replayUpTo(s, events, maxCommitted);
    expect({ ...replayed, rngState: 0 }).toEqual({ ...nextState, rngState: 0 });
  });
});

describe('pauseAfter - the small breathing gap between major beats', () => {
  it('is set on the clash, the destruction and the overflow steps of a real combat sequence', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 7, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 3, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const steps = buildAnimationSteps(events);

    const clash = steps.find((st) => st.visualType === 'combat-clash' && st.lane === 'left');
    const destroy = steps.find((st) => st.visualType === 'hero-destroyed' && st.lane === 'left');
    const overflow = steps.find((st) => st.visualType === 'overflow-damage' && st.lane === 'left');
    expect(clash?.pauseAfter).toBe(true);
    expect(destroy?.pauseAfter).toBe(true);
    expect(overflow?.pauseAfter).toBe(true);
  });

  it('is NOT set on incidental steps (a trigger firing, an ordinary Power change)', () => {
    const s = state({
      player: player({
        hand: [
          { handId: 'h1', cardId: 'kng-royal-guard' },
          { handId: 'h2', cardId: 'spl-power-surge' },
        ],
      }),
    });
    const { events } = resolveRound(
      s,
      { plays: [{ handId: 'h1', cardId: 'kng-royal-guard', lane: 'left' }, { handId: 'h2', cardId: 'spl-power-surge', lane: 'left' }] },
      NO_PLAYS,
      1,
    );
    const steps = buildAnimationSteps(events);
    const triggerOrPowerSteps = steps.filter((st) => st.visualType === 'trigger-pulse' || st.visualType === 'power-change');
    expect(triggerOrPowerSteps.length).toBeGreaterThan(0);
    for (const st of triggerOrPowerSteps) expect(st.pauseAfter).toBeFalsy();
  });
});
