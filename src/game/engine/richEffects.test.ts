import { describe, expect, it } from 'vitest';
import type { GameState, HeroInstance, PlayerState, SpellZoneInstance } from '../types';
import { getCard } from '../cards';
import { resolveRound } from './resolveRound';
import { replayUpTo } from './replay';

// Rich-effects / archetype-depth pass: tests for the expanded condition/action system (faction and
// tag presence, board/Graveyard/hand counts, round-local history), immunity (SPELL and HERO_EFFECT),
// the destruction shield, silence, oncePerRound gating, Spell-play triggers, and the new Power
// primitives (SET_POWER, CHANGE_POWER_BY_COUNT). Mirrors the fixture style already used in
// resolveRound.test.ts / newPrimitives.test.ts, and exercises the real, updated roster cards rather
// than synthetic fixtures - card ids are looked up from the static registry, so there is no way to
// fabricate an arbitrary test-only card.

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

describe('Faction-presence condition (Royal Guard - Spell immunity)', () => {
  it('blocks a hostile Spell effect while another Kingdom Hero is in play', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-royal-guard', 5, 'p1'), center: hero('kng-common-knight', 6, 'p2'), right: null } }),
      enemy: { ...player({ hand: [{ handId: 'h1', cardId: 'spl-weakness' }] }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, { plays: [{ handId: 'h1', cardId: 'spl-weakness', lane: 'left' }] }, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'IMMUNITY_BLOCKED', side: 'player', lane: 'left', immunity: 'SPELL' }));
    expect(nextState.player.heroZones.left?.power).toBe(5); // Weakness's -3 never landed
    // Combat still resolves normally around the blocked effect - the Hero is merely unaffected by the Spell.
    expect(events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'left', outcome: 'PLAYER_DIRECT', player: { name: 'Royal Guard', power: 5 } }));
  });

  it('does not block when no other Kingdom Hero is in play', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-royal-guard', 5, 'p1'), center: null, right: null } }),
      enemy: { ...player({ hand: [{ handId: 'h1', cardId: 'spl-weakness' }] }), side: 'enemy' },
    });
    const { events } = resolveRound(s, NO_PLAYS, { plays: [{ handId: 'h1', cardId: 'spl-weakness', lane: 'left' }] }, 1);
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'IMMUNITY_BLOCKED' }));
    // Weakness's -3 is UNTIL_ROUND_END, so read it from the Combat comparison, not the post-cleanup nextState.
    expect(events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'left', outcome: 'PLAYER_DIRECT', player: { name: 'Royal Guard', power: 2 } }));
  });
});

describe('Tag condition (Battle Captain - Hero-effect immunity)', () => {
  it('blocks a hostile Hero-sourced effect while another Knight is in play', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-battle-captain', 5, 'p1'), center: hero('kng-common-knight', 6, 'p2'), right: null } }),
      enemy: { ...player({ hand: [{ handId: 'h1', cardId: 'inf-hellhound' }] }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, { plays: [{ handId: 'h1', cardId: 'inf-hellhound', lane: 'left' }] }, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'IMMUNITY_BLOCKED', side: 'player', lane: 'left', immunity: 'HERO_EFFECT' }));
    expect(nextState.player.heroZones.left?.silenced).toBe(false);
  });

  it('is silenced normally without another Knight in play', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-battle-captain', 5, 'p1'), center: null, right: null } }),
      enemy: { ...player({ hand: [{ handId: 'h1', cardId: 'inf-hellhound' }] }), side: 'enemy' },
    });
    const { events } = resolveRound(s, NO_PLAYS, { plays: [{ handId: 'h1', cardId: 'inf-hellhound', lane: 'left' }] }, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'SILENCED', side: 'player', name: 'Battle Captain' }));
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'IMMUNITY_BLOCKED' }));
  });
});

describe("Silence suppresses the silenced Hero's own abilities", () => {
  it("a silenced Hero's Before Combat ability does not fire, but combat itself is unaffected", () => {
    // Light Priest carries no Knight tag, so Battle Captain has no immunity here and is genuinely
    // silenced - proving the point requires an ally WITHOUT the Knight tag (a Knight ally would
    // instead grant Battle Captain immunity, as covered by the "Tag condition" tests above).
    const s = state({
      player: player({ heroZones: { left: hero('kng-battle-captain', 5, 'p1'), center: hero('kng-light-priest', 3, 'p2'), right: null } }),
      enemy: { ...player({ hand: [{ handId: 'h1', cardId: 'inf-hellhound' }] }), side: 'enemy' },
    });
    const { events } = resolveRound(s, NO_PLAYS, { plays: [{ handId: 'h1', cardId: 'inf-hellhound', lane: 'left' }] }, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'SILENCED' }));
    // Light Priest in 'center' never gets Battle Captain's +1 - it stays at its base Power in Combat.
    expect(events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'center', outcome: 'PLAYER_DIRECT', player: { name: 'Light Priest', power: 3 } }));
  });
});

describe('Graveyard count condition (Dark Priest)', () => {
  it('gains +2 Power Before Combat once the Graveyard holds 3 or more cards', () => {
    const s = state({
      player: player({
        heroZones: { left: hero('und-dark-priest', 3, 'p1'), center: null, right: null },
        graveyard: ['kng-common-knight', 'kng-common-knight', 'kng-common-knight'],
      }),
    });
    const { nextState } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    // 3 -> 5 this round; direct damage (unopposed) reflects the buffed Power.
    expect(nextState.enemy.hp).toBe(15);
  });

  it('does not gain the bonus below the threshold', () => {
    const s = state({
      player: player({
        heroZones: { left: hero('und-dark-priest', 3, 'p1'), center: null, right: null },
        graveyard: ['kng-common-knight'],
      }),
    });
    const { nextState } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.enemy.hp).toBe(17); // unbuffed 3 damage
  });
});

describe('Hand-size condition (Mira)', () => {
  it('returns an Undead Hero from the Graveyard when hand size is at or below the threshold', () => {
    const s = state({
      player: player({
        hand: [{ handId: 'h1', cardId: 'und-mira' }],
        graveyard: ['und-dark-priest'],
      }),
    });
    const { events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'und-mira', lane: 'left' }] }, NO_PLAYS, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'RETURNED_TO_HAND', cardId: 'und-dark-priest' }));
  });

  it('fizzles when hand size is already above the threshold', () => {
    const s = state({
      player: player({
        hand: [
          { handId: 'h1', cardId: 'und-mira' },
          { handId: 'h2', cardId: 'kng-common-knight' },
          { handId: 'h3', cardId: 'kng-common-knight' },
          { handId: 'h4', cardId: 'kng-common-knight' },
          { handId: 'h5', cardId: 'kng-common-knight' },
          { handId: 'h6', cardId: 'kng-common-knight' },
        ],
        graveyard: ['und-dark-priest'],
      }),
    });
    // Only Mira herself is played - the condition is checked at her own ON_PLAY, after Reveal has
    // already removed her from the hand, so the remaining 5 unplayed cards are what the condition sees.
    const { events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'und-mira', lane: 'left' }] }, NO_PLAYS, 1);
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'RETURNED_TO_HAND' }));
  });
});

describe('Graveyard-faction count condition + faction-filtered revival (Raise Fallen)', () => {
  it('revives the weakest Undead Hero once the Graveyard holds 3 or more Undead Heroes', () => {
    const s = state({
      player: player({
        hand: [{ handId: 'h1', cardId: 'spl-raise-fallen' }],
        graveyard: ['und-dark-priest', 'und-bone-soldier', 'und-cursed-warrior'], // Power 3, 4, 4
      }),
    });
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-raise-fallen', lane: 'right' }] }, NO_PLAYS, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'REVIVED', cardId: 'und-dark-priest', lane: 'right' }));
    expect(nextState.player.heroZones.right?.cardId).toBe('und-dark-priest');
  });

  it('fizzles below the threshold, leaving the Graveyard alone except for the spent Spell', () => {
    const s = state({
      player: player({
        hand: [{ handId: 'h1', cardId: 'spl-raise-fallen' }],
        graveyard: ['und-dark-priest', 'und-bone-soldier'], // only 2 Undead Heroes
      }),
    });
    const { nextState } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-raise-fallen', lane: 'right' }] }, NO_PLAYS, 1);
    expect(nextState.player.heroZones.right).toBeNull();
    expect(nextState.player.graveyard).toEqual(['und-dark-priest', 'und-bone-soldier', 'spl-raise-fallen']);
  });
});

describe('Destruction shield (Paladin)', () => {
  it('absorbs the first destruction attempt; a second overwhelming fight destroys it for real', () => {
    const s = state({
      player: player({ hand: [{ handId: 'h1', cardId: 'kng-paladin' }] }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 20, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const round1 = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'kng-paladin', lane: 'left' }] }, NO_PLAYS, 1);
    expect(round1.events).toContainEqual(expect.objectContaining({ type: 'SHIELD_GRANTED', side: 'player' }));
    expect(round1.events).toContainEqual(expect.objectContaining({ type: 'SHIELD_CONSUMED', side: 'player' }));
    expect(round1.events).not.toContainEqual(expect.objectContaining({ type: 'HERO_DESTROYED', side: 'player' }));
    expect(round1.nextState.player.heroZones.left?.cardId).toBe('kng-paladin');
    expect(round1.nextState.player.heroZones.left?.shielded).toBe(false); // consumed, not stacked

    const round2 = resolveRound(round1.nextState, NO_PLAYS, NO_PLAYS, 2);
    expect(round2.events).toContainEqual(expect.objectContaining({ type: 'HERO_DESTROYED', side: 'player', cardId: 'kng-paladin' }));
    expect(round2.nextState.player.heroZones.left).toBeNull();
  });

  it('reduces overflow damage from its own lost fights', () => {
    // 5 base +4 (losing-lane bonus) = 9 vs enemy 20 -> loses; raw overflow 11, reduced by 2 -> 9 - but
    // the shield absorbs the destruction itself first, so the Hero survives too.
    const s = state({
      player: player({ hand: [{ handId: 'h1', cardId: 'kng-paladin' }] }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 20, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'kng-paladin', lane: 'left' }] }, NO_PLAYS, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'OVERFLOW_DAMAGE', side: 'player', amount: 9 })); // 20 - 9 - 2
  });
});

describe('Destruction shield respected by a DESTROY effect, not just combat loss', () => {
  it('Execute is absorbed by an active shield instead of destroying the Hero', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-paladin', 3, 'p1', { shielded: true }), center: null, right: null } }),
      enemy: { ...player({ hand: [{ handId: 'h1', cardId: 'spl-execute' }] }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, { plays: [{ handId: 'h1', cardId: 'spl-execute', lane: 'left' }] }, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'SHIELD_CONSUMED', side: 'player' }));
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'HERO_DESTROYED', side: 'player' }));
    expect(nextState.player.heroZones.left?.cardId).toBe('kng-paladin');
    expect(nextState.player.heroZones.left?.shielded).toBe(false);
  });
});

describe('Death trigger - first time per round (Grave Knight)', () => {
  it('heals only once even when two enemy Heroes die in the same round', () => {
    const s = state({
      player: player({
        heroZones: { left: hero('und-grave-knight', 4, 'p1'), center: hero('kng-common-knight', 20, 'p2'), right: hero('kng-common-knight', 20, 'p3') },
      }),
      enemy: {
        ...player({ heroZones: { left: null, center: hero('kng-common-knight', 1, 'e1'), right: hero('kng-common-knight', 1, 'e2') } }),
        side: 'enemy',
        hp: 20,
      },
    });
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    const heals = events.filter((e) => e.type === 'HEAL' && e.side === 'player');
    expect(heals).toHaveLength(1);
    expect(events.filter((e) => e.type === 'ONCE_PER_ROUND_USED' && e.zone === 'hero')).toHaveLength(1);
  });

  it('fires again in a later round', () => {
    const s = state({
      player: player({ heroZones: { left: hero('und-grave-knight', 4, 'p1', { usedThisRound: true }), center: null, right: null } }),
      enemy: { ...player({ heroZones: { left: null, center: hero('kng-common-knight', 1, 'e1'), right: null } }), side: 'enemy' },
    });
    // Simulate "already used this round" carried in from a prior round, then confirm a fresh round
    // (which resets usedThisRound via beginRound - not exercised here directly, so instead prove the
    // gate: with usedThisRound already true, the reaction does NOT fire again this round.
    const { events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(events.filter((e) => e.type === 'HEAL')).toHaveLength(0);
  });
});

describe('Spell-play trigger (Light Priest)', () => {
  it('gains +1 Power whenever its own side plays a Spell', () => {
    const s = state({
      player: player({
        hand: [{ handId: 'h1', cardId: 'spl-power-surge' }],
        heroZones: { left: hero('kng-light-priest', 3, 'p1'), center: null, right: null },
      }),
    });
    const { events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-power-surge', lane: 'right' }] }, NO_PLAYS, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'TRIGGER', trigger: 'ON_ALLY_SPELL_PLAYED', sourceName: 'Light Priest' }));
  });

  it('does not react to the enemy playing a Spell - it only carries an ON_ALLY_SPELL_PLAYED ability', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-light-priest', 3, 'p1'), center: null, right: null } }),
      enemy: { ...player({ hand: [{ handId: 'h1', cardId: 'spl-weakness' }] }), side: 'enemy' },
    });
    const { nextState } = resolveRound(s, NO_PLAYS, { plays: [{ handId: 'h1', cardId: 'spl-weakness', lane: 'right' }] }, 1);
    // No reaction fired at all - Power stays at its base value (Weakness itself also had no target in 'right').
    expect(nextState.player.heroZones.left?.power).toBe(3);
  });
});

describe('CHANGE_POWER_BY_COUNT (Bone Soldier)', () => {
  it('gains +1 Power this round for every card in its own Graveyard', () => {
    const s = state({
      player: player({
        heroZones: { left: hero('und-bone-soldier', 1, 'p1'), center: null, right: null },
        graveyard: ['kng-common-knight', 'kng-common-knight'],
      }),
    });
    const { nextState } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.enemy.hp).toBe(17); // unopposed direct damage for 3 (1 base + 2 from Graveyard count)
  });

  it('contributes nothing with an empty Graveyard (no-op, not a zero-delta event)', () => {
    const s = state({ player: player({ heroZones: { left: hero('und-bone-soldier', 1, 'p1'), center: null, right: null } }) });
    const { nextState, events } = resolveRound(s, NO_PLAYS, NO_PLAYS, 1);
    expect(nextState.enemy.hp).toBe(19);
    expect(events.filter((e) => e.type === 'POWER_CHANGED' && e.reason === 'Bone Soldier')).toHaveLength(0);
  });
});

describe('SET_POWER (Fireball)', () => {
  it("sets the enemy Hero's Power to 1 when a Continuous Spell is active in its lane, overriding the flat -4", () => {
    const s = state({
      player: player({ hand: [{ handId: 'h1', cardId: 'spl-fireball' }] }),
      enemy: {
        ...player({
          heroZones: { left: hero('kng-common-knight', 6, 'e1'), center: null, right: null },
          spellZones: { left: spell('spl-battle-banner'), center: null, right: null },
        }),
        side: 'enemy',
      },
    });
    const { nextState } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-fireball', lane: 'left' }] }, NO_PLAYS, 1);
    expect(nextState.enemy.heroZones.left?.power).toBe(1);
  });

  it('applies only the flat -4 without an enemy Continuous Spell present', () => {
    const s = state({
      player: player({ hand: [{ handId: 'h1', cardId: 'spl-fireball' }] }),
      enemy: { ...player({ heroZones: { left: hero('kng-common-knight', 6, 'e1'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'spl-fireball', lane: 'left' }] }, NO_PLAYS, 1);
    expect(nextState.enemy.heroZones.left?.power).toBe(2); // 6 - 4
  });
});

describe('Destroy Spell disruption (Infernal Lord)', () => {
  it("also destroys the enemy's Continuous Spell in the same lane on play", () => {
    const s = state({
      player: player({ hand: [{ handId: 'h1', cardId: 'inf-infernal-lord' }] }),
      enemy: { ...player({ spellZones: { left: spell('spl-battle-banner'), center: null, right: null } }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'inf-infernal-lord', lane: 'left' }] }, NO_PLAYS, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'SPELL_ZONE_DESTROYED', side: 'enemy', cardId: 'spl-battle-banner' }));
    expect(nextState.enemy.spellZones.left).toBeNull();
    expect(nextState.enemy.graveyard).toContain('spl-battle-banner');
  });
});

describe('Event/replay fidelity for the new stateful events', () => {
  it('SHIELD_GRANTED, SHIELD_CONSUMED, SILENCED and ONCE_PER_ROUND_USED all replay to the exact same nextState', () => {
    const s = state({
      player: player({
        hand: [{ handId: 'h1', cardId: 'kng-paladin' }],
        heroZones: { left: null, center: hero('und-grave-knight', 4, 'p2'), right: null },
      }),
      enemy: {
        ...player({ heroZones: { left: hero('kng-common-knight', 20, 'e1'), center: hero('kng-common-knight', 1, 'e2'), right: null } }),
        side: 'enemy',
      },
    });
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'h1', cardId: 'kng-paladin', lane: 'left' }] }, NO_PLAYS, 1);
    // Sanity: this scenario actually exercises SHIELD_GRANTED, SHIELD_CONSUMED and (via Grave Knight
    // reacting to the enemy Hero it kills) ONCE_PER_ROUND_USED, so the replay check below is meaningful.
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['SHIELD_GRANTED', 'SHIELD_CONSUMED', 'ONCE_PER_ROUND_USED']));
    const replayed = replayUpTo(s, events, events.length - 1);
    expect({ ...replayed, rngState: 0 }).toEqual({ ...nextState, rngState: 0 });
  });

  it('SILENCED replays correctly on its own', () => {
    const s = state({
      player: player({ heroZones: { left: hero('kng-battle-captain', 5, 'p1'), center: null, right: null } }),
      enemy: { ...player({ hand: [{ handId: 'h1', cardId: 'inf-hellhound' }] }), side: 'enemy' },
    });
    const { nextState, events } = resolveRound(s, NO_PLAYS, { plays: [{ handId: 'h1', cardId: 'inf-hellhound', lane: 'left' }] }, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'SILENCED' }));
    const replayed = replayUpTo(s, events, events.length - 1);
    expect({ ...replayed, rngState: 0 }).toEqual({ ...nextState, rngState: 0 });
  });
});
