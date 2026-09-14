import { describe, expect, it } from 'vitest';
import type { GameState, HeroInstance, LaneId, PlayerState, SpellZoneInstance } from '../types';
import { getCard } from '../cards';
import { beginRound, resolveRound, validateDeployment } from './resolveRound';
import { effectivePower } from './power';

// Builds a board Hero with an arbitrary current Power, but the *real* card name/faction - makeHeroInstance
// always copies these from the card definition, and event sourceNames read the instance field, so a test
// fixture with a fake name would make TRIGGER/DAMAGE events unrealistic.
function hero(cardId: string, power: number, id = 'h1', overrides: Partial<HeroInstance> = {}): HeroInstance {
  const card = getCard(cardId);
  return { instanceId: id, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, ...overrides };
}

function spell(cardId: string, id = 's1', usedThisRound = false): SpellZoneInstance {
  const card = getCard(cardId);
  return { instanceId: id, cardId, faction: card.faction, name: card.name, shortName: card.shortName, usedThisRound };
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

describe('Combat - higher Power wins', () => {
  it('7 vs 4: the 4-Power Hero dies, the 7-Power Hero remains at 7, enemy takes 3 overflow', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 7, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 4, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.heroZones.left?.power).toBe(7);
    expect(nextState.enemy.heroZones.left).toBeNull();
    expect(nextState.enemy.hp).toBe(17); // 20 - (7 - 4) overflow
    expect(events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'left', outcome: 'PLAYER_WINS' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'OVERFLOW_DAMAGE', side: 'enemy', amount: 3, from: 20, to: 17 }));
  });
});

describe('Combat - equal Power', () => {
  it('5 vs 5: both are destroyed, no overflow damage to either player', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 5, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 5, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.heroZones.left).toBeNull();
    expect(nextState.enemy.heroZones.left).toBeNull();
    expect(nextState.player.hp).toBe(20);
    expect(nextState.enemy.hp).toBe(20);
    expect(events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'left', outcome: 'TIE' }));
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'OVERFLOW_DAMAGE' }));
  });
});

describe('Combat overflow damage', () => {
  it('7 vs 3: the loser is destroyed, the winner survives at full Power, defender takes 4 overflow', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 7, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 3, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.enemy.heroZones.left).toBeNull();
    expect(nextState.player.heroZones.left?.power).toBe(7); // winner keeps its full Power - combat never chips it
    expect(nextState.enemy.hp).toBe(16); // 20 - (7 - 3)
    expect(events).toContainEqual(expect.objectContaining({ type: 'OVERFLOW_DAMAGE', side: 'enemy', lane: 'left', amount: 4, winnerName: 'Common Knight', loserName: 'Common Knight' }));
  });

  it('3 vs 7 (reversed): the correct side - the player - takes the 4 overflow this time', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 3, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 7, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.heroZones.left).toBeNull();
    expect(nextState.enemy.heroZones.left?.power).toBe(7);
    expect(nextState.player.hp).toBe(16); // 20 - (7 - 3)
    expect(nextState.enemy.hp).toBe(20); // the winner's own side takes nothing
    expect(events).toContainEqual(expect.objectContaining({ type: 'OVERFLOW_DAMAGE', side: 'player', lane: 'left', amount: 4 }));
  });

  it('6 vs an empty lane: the full current Power hits the player directly (unopposed, not overflow)', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 6, 'p1'), center: null, right: null } }),
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.enemy.hp).toBe(14); // 20 - 6
    expect(events).toContainEqual(expect.objectContaining({ type: 'DIRECT_DAMAGE', side: 'enemy', amount: 6 }));
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'OVERFLOW_DAMAGE' }));
  });
});

describe('One-time Spell lifecycle', () => {
  it('resolves its effect, then moves to the Graveyard and frees its slot', () => {
    const s = state({
      player: player({ hand: [{ handId: 'h1', cardId: 'spl-weakness' }] }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 7, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-weakness', lane: 'left' }] }, NO_PLAYS, 1);
    expect(nextState.player.graveyard).toEqual(['spl-weakness']);
    expect(nextState.player.spellZones.left).toBeNull(); // never occupied the zone in the first place
    expect(events).toContainEqual(expect.objectContaining({ type: 'SPELL_RESOLVED', cardId: 'spl-weakness', fizzled: false }));
  });
});

describe('Continuous Spell lifecycle', () => {
  it('activates once, then stays in its slot rather than going to the Graveyard', () => {
    const s = state({
      player: player({ hand: [{ handId: 'h1', cardId: 'spl-battle-banner' }] }),
    });
    const { nextState } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-battle-banner', lane: 'left' }] }, NO_PLAYS, 1);
    expect(nextState.player.spellZones.left?.cardId).toBe('spl-battle-banner');
    expect(nextState.player.graveyard).toEqual([]);
  });
});

describe('Occupied Continuous Spell slot', () => {
  it('cannot stage another Spell into a lane that already holds an active Continuous Spell', () => {
    const s = state({
      player: player({
        spellZones: { left: spell('spl-battle-banner'), center: null, right: null },
        hand: [{ handId: 'h1', cardId: 'spl-growth-totem' }],
      }),
    });
    const action = { plays: [{ handId: 'h1', cardId: 'spl-growth-totem', lane: 'left' as LaneId }] };
    expect(validateDeployment(s, 'player', action).legal).toBe(false);
    expect(() => resolveRound(s, action, NO_PLAYS, 1)).toThrow();
  });
});

describe('Continuous Power buff', () => {
  it('Battle Banner adds +2 effective Power to the Hero in its lane while active', () => {
    const s = state({
      player: player({
        heroZones: { left: hero('kng-common-knight', 6, 'p1'), center: null, right: null },
        spellZones: { left: spell('spl-battle-banner'), center: null, right: null },
      }),
    });
    expect(effectivePower(s, 'player', 'left')).toBe(8);
    expect(s.player.heroZones.left?.power).toBe(6); // the stored base value is never mutated
  });

  it('a 6-Power Hero with Battle Banner (effective 8) survives Combat against a 7-Power Hero', () => {
    const s = state({
      player: player({
        heroZones: { left: hero('kng-common-knight', 6, 'p1'), center: null, right: null },
        spellZones: { left: spell('spl-battle-banner'), center: null, right: null },
      }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 7, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.heroZones.left?.power).toBe(6); // base is untouched by winning
    expect(nextState.enemy.heroZones.left).toBeNull();
  });
});

describe('Removing a Continuous buff', () => {
  it('Dispel destroys the enemy Continuous Spell in its lane, and effective Power returns to base immediately', () => {
    const s = state({
      player: player({ hand: [{ handId: 'h1', cardId: 'spl-dispel' }] }),
      enemy: {
        ...player({
          heroZones: { left: hero('kng-common-knight', 6, 'e1'), center: null, right: null },
          spellZones: { left: spell('spl-battle-banner', 'sz1'), center: null, right: null },
        }),
        side: 'enemy',
      },
    });
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-dispel', lane: 'left' }] }, NO_PLAYS, 1);
    expect(nextState.enemy.spellZones.left).toBeNull();
    expect(nextState.enemy.graveyard).toContain('spl-battle-banner');
    expect(nextState.player.graveyard).toContain('spl-dispel');
    expect(effectivePower(nextState, 'enemy', 'left')).toBe(6); // back to base, not stuck at 8
    expect(events).toContainEqual(expect.objectContaining({ type: 'SPELL_ZONE_DESTROYED', cardId: 'spl-battle-banner' }));
  });

  it('Dispel has no valid placement in a lane with no enemy Continuous Spell', () => {
    const s = state({ player: player({ hand: [{ handId: 'h1', cardId: 'spl-dispel' }] }) });
    const action = { plays: [{ handId: 'h1', cardId: 'spl-dispel', lane: 'left' as LaneId }] };
    expect(validateDeployment(s, 'player', action).legal).toBe(false);
  });
});

describe('Permanent + Continuous stacking', () => {
  it('permanent Power survives the removal of a Continuous buff (7, not 6 or 9)', () => {
    // Knight starts at base 6, already has a permanent +1 baked in (from an earlier Blessing-style
    // effect) for a base of 7, PLUS Battle Banner's +2 while active -> effective 9. Removing the
    // Banner should drop it to exactly 7 - the permanent gain must not vanish, and the Banner's
    // bonus must not linger.
    const s = state({
      player: player({
        heroZones: { left: hero('kng-common-knight', 7, 'p1'), center: null, right: null },
        spellZones: { left: spell('spl-battle-banner', 'sz1'), center: null, right: null },
      }),
      enemy: { ...player({ hand: [{ handId: 'h1', cardId: 'spl-dispel' }] }), side: 'enemy' },
    });
    expect(effectivePower(s, 'player', 'left')).toBe(9);
    const { nextState } = resolveRound(s, NO_PLAYS, { plays: [{ handId: 'h1', cardId: 'spl-dispel', lane: 'left' }] }, 1);
    expect(nextState.player.spellZones.left).toBeNull();
    expect(nextState.player.heroZones.left?.power).toBe(7);
    expect(effectivePower(nextState, 'player', 'left')).toBe(7);
  });
});

describe('Temporary + Continuous stacking', () => {
  it('a this-round buff clears at Round End while a Continuous buff keeps applying', () => {
    const s = state({
      player: player({
        heroZones: { left: hero('kng-common-knight', 6, 'p1'), center: null, right: null },
        spellZones: { left: spell('spl-battle-banner'), center: null, right: null },
        hand: [{ handId: 'h1', cardId: 'spl-power-surge' }],
      }),
    });
    const { nextState } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-power-surge', lane: 'left' }] }, NO_PLAYS, 1);
    // Power Surge's +3 this-round expired; base stayed 6; Battle Banner's +2 still applies live.
    expect(nextState.player.heroZones.left?.power).toBe(6);
    expect(effectivePower(nextState, 'player', 'left')).toBe(8);
  });
});

describe('Grave Totem', () => {
  it('returns the Hero that died in its lane to hand', () => {
    const s = state({
      player: player({
        heroZones: { left: hero('kng-common-knight', 1, 'p1'), center: null, right: null },
        spellZones: { left: spell('spl-grave-totem'), center: null, right: null },
      }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 9, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.heroZones.left).toBeNull();
    expect(nextState.player.graveyard).toEqual([]); // came right back out
    expect(nextState.player.hand.map((h) => h.cardId)).toContain('kng-common-knight');
    expect(nextState.player.spellZones.left?.usedThisRound).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ type: 'TRIGGER', trigger: 'ON_ALLY_DEATH', sourceName: 'Grave Totem' }));
  });

  it('does not trigger twice in the same round, but resets for the next round', () => {
    const s = state({
      player: player({
        spellZones: { left: spell('spl-grave-totem', 'sz1', true), center: null, right: null }, // already used this round
      }),
    });
    const begun = beginRound(s);
    expect(begun.nextState.player.spellZones.left?.usedThisRound).toBe(false);
  });
});

describe('Burning Ground', () => {
  it('reduces the enemy Hero in its lane by 1 Power every Round End, permanently', () => {
    const s = state({
      player: player({ spellZones: { left: spell('spl-burning-ground'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 6, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const round1 = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(round1.nextState.enemy.heroZones.left?.power).toBe(5);
    const round2 = resolveRound(round1.nextState, NO_PLAYS, NO_PLAYS, 1);
    expect(round2.nextState.enemy.heroZones.left?.power).toBe(4);
  });
});

describe('Automatic same-lane targeting', () => {
  it('a PlayerAction needs no target id beyond {handId, cardId, lane}', () => {
    const s = state({
      player: player({ hand: [{ handId: 'h1', cardId: 'spl-weakness' }] }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 7, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const action = { plays: [{ handId: 'h1', cardId: 'spl-weakness', lane: 'left' as LaneId }] };
    expect(Object.keys(action.plays[0]).sort()).toEqual(['cardId', 'handId', 'lane']);
    expect(validateDeployment(s, 'player', action).legal).toBe(true);
  });
});

describe('Revival', () => {
  it('Second Chance returns the highest-Power eligible Hero to hand', () => {
    const s = state({
      player: player({
        graveyard: ['und-bone-soldier', 'kng-common-knight'], // Power 4 and Power 6
        hand: [{ handId: 'h1', cardId: 'spl-second-chance' }],
      }),
    });
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-second-chance', lane: 'left' }] }, NO_PLAYS, 1);
    expect(nextState.player.graveyard).toEqual(['und-bone-soldier', 'spl-second-chance']); // the weaker Hero stays; Second Chance itself is spent
    expect(nextState.player.hand.map((h) => h.cardId)).toContain('kng-common-knight');
    expect(events).toContainEqual(expect.objectContaining({ type: 'RETURNED_TO_HAND', cardId: 'kng-common-knight' }));
  });

  it('Raise Fallen revives the weakest Undead Hero directly into the lane it was placed in, once the Graveyard holds 3 or more', () => {
    const s = state({
      player: player({
        graveyard: ['und-dark-priest', 'und-bone-soldier', 'und-cursed-warrior'], // Power 3, 4, 4 - all Undead
        hand: [{ handId: 'h1', cardId: 'spl-raise-fallen' }],
      }),
    });
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-raise-fallen', lane: 'center' }] }, NO_PLAYS, 1);
    expect(nextState.player.graveyard).toEqual(['und-bone-soldier', 'und-cursed-warrior', 'spl-raise-fallen']); // the weakest (Dark Priest) came out; Raise Fallen itself is spent
    expect(nextState.player.heroZones.center?.cardId).toBe('und-dark-priest');
    expect(events).toContainEqual(expect.objectContaining({ type: 'REVIVED', cardId: 'und-dark-priest', lane: 'center' }));
  });

  it('Raise Fallen fizzles (stays in the Graveyard as the only card spent) when fewer than 3 Undead Heroes are in the Graveyard', () => {
    const s = state({
      player: player({
        graveyard: ['und-dark-priest'], // only 1 Undead Hero - below the threshold
        hand: [{ handId: 'h1', cardId: 'spl-raise-fallen' }],
      }),
    });
    const { nextState } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-raise-fallen', lane: 'center' }] }, NO_PLAYS, 1);
    expect(nextState.player.heroZones.center).toBeNull();
    expect(nextState.player.graveyard).toEqual(['und-dark-priest', 'spl-raise-fallen']);
  });
});

describe('Persistent Power', () => {
  it('a Hero that wins Combat remains on the board with unchanged Power into the next round', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 7, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 4, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const round1 = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const round2 = resolveRound(round1.nextState, NO_PLAYS, NO_PLAYS, 1);
    expect(round2.nextState.player.heroZones.left?.power).toBe(7);
    expect(round2.nextState.player.heroZones.left?.instanceId).toBe('p1');
  });
});

describe('Direct damage', () => {
  it('a Hero in an empty enemy lane damages the enemy player for its current Power', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-common-knight', 6, 'p1'), center: null, right: null } }),
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.enemy.hp).toBe(14);
    expect(events).toContainEqual(expect.objectContaining({ type: 'DIRECT_DAMAGE', side: 'enemy', amount: 6, from: 20, to: 14 }));
  });
});

describe('Starting hand - round 1 draws exactly 3', () => {
  it('an empty hand at round 1 draws to 3', () => {
    const s = state({ round: 1, player: player({ deck: Array(4).fill('kng-common-knight') }) });
    const { nextState } = beginRound(s);
    expect(nextState.player.hand.length).toBe(3);
    expect(nextState.player.deck.length).toBe(1);
  });

  it('both sides draw 3 independently at round 1', () => {
    const s = state({
      round: 1,
      player: player({ deck: Array(4).fill('kng-common-knight') }),
      enemy: { ...player({ deck: Array(4).fill('und-bone-soldier') }), side: 'enemy' },
    });
    const { nextState } = beginRound(s);
    expect(nextState.player.hand.length).toBe(3);
    expect(nextState.enemy.hand.length).toBe(3);
  });

  it('a Deck with fewer than 3 cards fizzles the remaining draws instead of crashing', () => {
    const s = state({ round: 1, player: player({ deck: ['kng-common-knight'] }) });
    const { nextState, events } = beginRound(s);
    expect(nextState.player.hand.length).toBe(1);
    expect(nextState.player.deck.length).toBe(0);
    expect(events.filter((e) => e.type === 'DRAW' && e.side === 'player' && e.fizzled)).toHaveLength(2);
  });
});

describe('Draw exactly 1 per round (round 2 onward)', () => {
  it('an empty hand draws to 1', () => {
    const s = state({ round: 2, player: player({ deck: ['kng-common-knight', 'kng-common-knight'] }) });
    const { nextState } = beginRound(s);
    expect(nextState.player.hand.length).toBe(1);
    expect(nextState.player.deck.length).toBe(1);
  });

  it('a 1-card hand draws to 2', () => {
    const s = state({
      round: 2,
      player: player({
        deck: ['kng-common-knight', 'kng-common-knight'],
        hand: [{ handId: 'a', cardId: 'kng-common-knight' }],
      }),
    });
    const { nextState } = beginRound(s);
    expect(nextState.player.hand.length).toBe(2);
  });

  it('a 3-card hand draws to 4 - no clamp/refill back down to 3', () => {
    const s = state({
      round: 2,
      player: player({
        deck: ['kng-common-knight'],
        hand: [
          { handId: 'a', cardId: 'kng-common-knight' },
          { handId: 'b', cardId: 'kng-common-knight' },
          { handId: 'c', cardId: 'kng-common-knight' },
        ],
      }),
    });
    const { nextState } = beginRound(s);
    expect(nextState.player.hand.length).toBe(4);
    expect(nextState.player.deck.length).toBe(0);
  });

  it('a 5-card hand draws to 6 - the hand can grow unbounded', () => {
    const s = state({
      round: 2,
      player: player({
        deck: ['kng-common-knight'],
        hand: Array.from({ length: 5 }, (_, i) => ({ handId: `h${i}`, cardId: 'kng-common-knight' })),
      }),
    });
    const { nextState } = beginRound(s);
    expect(nextState.player.hand.length).toBe(6);
  });

  it('an empty Deck fizzles the draw instead of crashing - not a loss condition', () => {
    const s = state({ round: 2, player: player({ deck: [] }) });
    const { nextState, events } = beginRound(s);
    expect(nextState.player.hand.length).toBe(0);
    expect(nextState.status).toBe('IN_PROGRESS');
    expect(events).toContainEqual(expect.objectContaining({ type: 'DRAW', side: 'player', fizzled: true }));
  });

  it('both sides draw independently in the same round', () => {
    const s = state({
      round: 2,
      player: player({ deck: ['kng-common-knight'] }),
      enemy: { ...player({ deck: ['und-bone-soldier', 'und-bone-soldier'] }), side: 'enemy' },
    });
    const { nextState } = beginRound(s);
    expect(nextState.player.hand.length).toBe(1);
    expect(nextState.enemy.hand.length).toBe(1);
    expect(nextState.enemy.deck.length).toBe(1);
  });
});

describe('Graveyard lifecycle', () => {
  it('a destroyed Hero (no On Death recursion) enters the Graveyard', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-royal-guard', 2, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 9, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.graveyard).toEqual(['kng-royal-guard']);
    expect(events).toContainEqual(expect.objectContaining({ type: 'HERO_DESTROYED', cardId: 'kng-royal-guard' }));
  });

  it('a resolved one-time Spell enters the Graveyard', () => {
    const s = state({ player: player({ hand: [{ handId: 'h1', cardId: 'spl-weakness' }] }) });
    const { nextState } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-weakness', lane: 'left' }] }, NO_PLAYS, 1);
    expect(nextState.player.graveyard).toEqual(['spl-weakness']);
  });

  it('a destroyed Continuous Spell enters the Graveyard', () => {
    const s = state({
      player: player({ hand: [{ handId: 'h1', cardId: 'spl-dispel' }] }),
      enemy: { ...player({ spellZones: { left: spell('spl-battle-banner'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-dispel', lane: 'left' }] }, NO_PLAYS, 1);
    expect(nextState.enemy.graveyard).toEqual(['spl-battle-banner']);
  });

  it('a revived card leaves the Graveyard and is not left duplicated', () => {
    const s = state({
      player: player({
        graveyard: ['und-dark-priest', 'und-bone-soldier', 'und-cursed-warrior'],
        hand: [{ handId: 'h1', cardId: 'spl-raise-fallen' }],
      }),
    });
    const { nextState } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-raise-fallen', lane: 'left' }] }, NO_PLAYS, 1);
    expect(nextState.player.graveyard).not.toContain('und-dark-priest'); // left the Graveyard
    expect(nextState.player.heroZones.left?.cardId).toBe('und-dark-priest'); // ...and is now on the board
    expect(nextState.player.graveyard).toEqual(['und-bone-soldier', 'und-cursed-warrior', 'spl-raise-fallen']); // the other two Undead stay; only the spent Spell is added
  });

  it('a card returned to hand is removed from the Graveyard, not left duplicated in both places', () => {
    const s = state({
      player: player({
        graveyard: ['kng-common-knight'],
        hand: [{ handId: 'h1', cardId: 'spl-second-chance' }],
      }),
    });
    const { nextState } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-second-chance', lane: 'left' }] }, NO_PLAYS, 1);
    expect(nextState.player.graveyard.filter((id) => id === 'kng-common-knight')).toHaveLength(0);
    expect(nextState.player.hand.filter((h) => h.cardId === 'kng-common-knight')).toHaveLength(1);
  });
});

describe('Death trigger', () => {
  it("a Hero's On Death ability fires when it dies", () => {
    const s = state({
      player: player({ heroZones: { left: hero('und-bone-soldier', 1, 'p1'), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 9, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.heroZones.left).toBeNull();
    expect(nextState.player.deck).toContain('und-bone-soldier');
    expect(events).toContainEqual(expect.objectContaining({ type: 'TRIGGER', trigger: 'ON_DEATH', sourceName: 'Bone Soldier' }));
  });
});

describe('Ally death trigger', () => {
  it('another Hero reacts correctly to an ally dying', () => {
    const s = state({
      player: player({
        heroZones: { left: hero('und-dark-priest', 3, 'p-priest'), center: hero('kng-common-knight', 1, 'p-doomed'), right: null },
      }),
      enemy: {
        ...player({ heroZones: { left: null, center: hero('kng-common-knight', 9, 'e-strong'), right: null } }),
        side: 'enemy',
      },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.player.heroZones.center).toBeNull();
    expect(nextState.player.heroZones.left?.power).toBe(4);
    expect(events).toContainEqual(expect.objectContaining({ type: 'TRIGGER', trigger: 'ON_ALLY_DEATH', sourceName: 'Dark Priest' }));
  });
});

describe('Deployment legality', () => {
  it('cannot deploy a Hero into an occupied lane', () => {
    const s = state({
      player: player({
        heroZones: { left: hero('kng-common-knight', 5, 'p1'), center: null, right: null },
        hand: [{ handId: 'h1', cardId: 'kng-common-knight' }],
      }),
    });
    const action = { plays: [{ handId: 'h1', cardId: 'kng-common-knight', lane: 'left' as LaneId }] };
    expect(validateDeployment(s, 'player', action).legal).toBe(false);
    expect(() => resolveRound(s, action, NO_PLAYS, 1)).toThrow();
  });
});
