import { describe, expect, it } from 'vitest';
import type { GameState, HeroInstance, PlayerState, SpellZoneInstance } from '../types';
import { getCard } from '../cards';
import { resolveRound } from './resolveRound';
import { replayUpTo } from './replay';

// Card Set v0.1 - tests for the new effect primitives added alongside the 30-card roster: the
// EXILE_FROM_GRAVEYARD action and the SELF_LANE_HAS_SPELL / SELF_LOSING_LANE conditions. Mirrors the
// fixture style already used in resolveRound.test.ts.

function hero(cardId: string, power: number, id = 'h1'): HeroInstance {
  const card = getCard(cardId);
  return { instanceId: id, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power, tempPower: 0, shielded: false, silenced: false, usedThisRound: false };
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

describe('EXILE_FROM_GRAVEYARD (Soul Burn)', () => {
  it('permanently removes the strongest enemy Hero from their Graveyard - not hand, not deck', () => {
    const s = state({
      player: player({ hand: [{ handId: 'h1', cardId: 'spl-soul-burn' }] }),
      enemy: { ...player({ graveyard: ['und-bone-soldier', 'und-dark-priest'] }), side: 'enemy' }, // power 4 and 3
    });
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-soul-burn', lane: 'left' }] }, NO_PLAYS, 1);
    expect(nextState.enemy.graveyard).toEqual(['und-dark-priest']); // Bone Soldier (power 4, the strongest) is gone
    expect(nextState.enemy.hand).toEqual([]);
    expect(nextState.enemy.deck).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'EXILED', side: 'enemy', cardId: 'und-bone-soldier' }));

    // The UI's replay reducer must reconstruct this exact state from the event log (see replay.test.ts).
    const replayed = replayUpTo(s, events, events.length - 1);
    expect({ ...replayed, rngState: 0 }).toEqual({ ...nextState, rngState: 0 });
  });

  it('fizzles harmlessly when the enemy Graveyard is empty', () => {
    const s = state({ player: player({ hand: [{ handId: 'h1', cardId: 'spl-soul-burn' }] }) });
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-soul-burn', lane: 'left' }] }, NO_PLAYS, 1);
    expect(nextState.player.graveyard).toContain('spl-soul-burn'); // the Spell itself still resolves and is spent
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'EXILED' }));
  });
});

describe('SELF_LANE_HAS_SPELL condition (Kingdom Archer)', () => {
  it('gains +2 Power this round when its own Continuous Spell occupies the same lane', () => {
    const s = state({
      player: player({
        heroZones: { left: hero('kng-archer', 4, 'p1'), center: null, right: null },
        spellZones: { left: spell('spl-battle-banner'), center: null, right: null },
      }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 20, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    // base 4 -> +2 (Archer's own condition) = 6 stored Power, then +2 live Battle Banner overlay = 8 effective.
    expect(events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'left', player: { name: 'Kingdom Archer', power: 8 } }));
  });

  it('does not trigger when its lane has no Continuous Spell', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-archer', 4, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 20, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'left', player: { name: 'Kingdom Archer', power: 4 } }));
  });
});

describe('SELF_LOSING_LANE condition (Legendary Paladin)', () => {
  it('gains +4 Power this round when it would otherwise lose its lane', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-paladin', 5, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 8, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    // 5 -> 9 beats the enemy's 8 at Combat time; the Paladin survives, the Knight is destroyed.
    // The +4 is this-round-only, so by the time Round End cleanup runs, base Power is back to 5.
    expect(nextState.player.heroZones.left?.power).toBe(5);
    expect(nextState.enemy.heroZones.left).toBeNull();
  });

  it('does not trigger when already winning its lane', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-paladin', 5, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 3, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.heroZones.left?.power).toBe(5); // no bonus applied
  });

  it('does not trigger when unopposed (unopposed is not "losing")', () => {
    const s = state({ player: player({ heroZones: { left: hero('kng-paladin', 5, 'p1'), center: null, right: null } }) });
    const { nextState } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.heroZones.left?.power).toBe(5);
  });
});

describe('Return-to-hand revival on a Hero itself (Cursed Warrior)', () => {
  it('returns to hand, not deck, when it dies', () => {
    const s = state({
      player: player({ heroZones: { left: hero('und-cursed-warrior', 1, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 9, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.graveyard).toEqual([]);
    expect(nextState.player.deck).toEqual([]);
    expect(nextState.player.hand.map((h) => h.cardId)).toContain('und-cursed-warrior');
  });
});

describe('ON_ENEMY_DEATH payoff (Grave Knight)', () => {
  it('gains +1 Power permanently whenever an enemy Hero dies anywhere on the board', () => {
    const s = state({
      player: player({
        heroZones: { left: hero('und-grave-knight', 4, 'p1'), center: hero('kng-common-knight', 9, 'p2'), right: null },
      }),
      enemy: { ...player({ heroZones: { left: null, center: hero('kng-common-knight', 1, 'e1'), right: null } }), side: 'enemy' },
    });
    const { nextState } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.heroZones.left?.power).toBe(5);
  });
});

describe('Continuous Spell reacting to enemy deaths (Cursed Ground)', () => {
  it('buffs its own lane ally by +1 whenever an enemy Hero dies, anywhere', () => {
    const s = state({
      player: player({
        heroZones: { left: hero('und-bone-soldier', 4, 'p1'), center: hero('kng-common-knight', 9, 'p2'), right: null },
        spellZones: { left: spell('spl-cursed-ground'), center: null, right: null },
      }),
      enemy: { ...player({ heroZones: { left: null, center: hero('kng-common-knight', 1, 'e1'), right: null } }), side: 'enemy' },
    });
    const { nextState } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.heroZones.left?.power).toBe(5);
  });
});

describe('Continuous Spell growth over time (Fortify)', () => {
  it("grows its lane's ally by +1 Power at the end of each round while occupied", () => {
    const s = state({
      player: player({
        heroZones: { left: hero('kng-common-knight', 6, 'p1'), center: null, right: null },
        spellZones: { left: spell('spl-fortify'), center: null, right: null },
      }),
    });
    const { nextState } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.heroZones.left?.power).toBe(7);
  });
});

describe('Continuous Spell lane-control pressure (Siege Fire)', () => {
  it("deals 1 damage to the enemy player at round end if the enemy's zone in this lane is empty", () => {
    const s = state({
      player: player({ spellZones: { left: spell('spl-siege-fire'), center: null, right: null } }),
    });
    const { nextState } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.enemy.hp).toBe(19);
  });

  it('does nothing if the enemy has a Hero in that lane', () => {
    const s = state({
      player: player({ spellZones: { left: spell('spl-siege-fire'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 5, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.enemy.hp).toBe(20);
  });
});

describe('Regression: Hero + Spell played into the same lane in the same round', () => {
  // A side's Hero zone and Spell zone at a lane are independent slots, so playing both there in one
  // round is legal - e.g. this set's flagship Kingdom combo (a Hero + a Continuous Spell stacked in
  // one lane). `playFor()` used to `.find()` a lane match without checking zone type, so whichever of
  // the two plays wasn't first in the array silently never got its ON_PLAY phase processed.
  it("both the Hero's and the Spell's ON_PLAY effects fire, regardless of which was placed first", () => {
    const s = state({
      player: player({
        hand: [
          { handId: 'h1', cardId: 'kng-light-priest' }, // Hero, ON_PLAY: heal 3
          { handId: 'h2', cardId: 'spl-power-surge' }, // Spell, ON_PLAY: ally same lane +3 this round
        ],
      }),
    });
    const { nextState, events } = resolveRound(
      s,
      {
        plays: [
          { handId: 'h1', cardId: 'kng-light-priest', lane: 'left' },
          { handId: 'h2', cardId: 'spl-power-surge', lane: 'left' },
        ],
      },
      NO_PLAYS,
      1,
    );
    expect(events).toContainEqual(expect.objectContaining({ type: 'HEAL', side: 'player', amount: 3 })); // proves Light Priest's ON_PLAY fired
    expect(events).toContainEqual(expect.objectContaining({ type: 'SPELL_RESOLVED', cardId: 'spl-power-surge', fizzled: false }));
    expect(nextState.player.graveyard).toContain('spl-power-surge'); // must not be left in limbo
    // base Power 3 + this-round +3 (Power Surge) + this-round +1 (Light Priest's own ON_ALLY_SPELL_PLAYED
    // reaction to Power Surge being played) = 7, visible in the Combat comparison (unopposed here, so a
    // direct-damage read instead).
    expect(events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'left', outcome: 'PLAYER_DIRECT', player: { name: 'Light Priest', power: 7 } }));
  });
});

