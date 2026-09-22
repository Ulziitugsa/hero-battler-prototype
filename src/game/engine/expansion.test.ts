import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, HeroInstance, PlayerState, SpellZoneInstance } from '../types';
import { getCard } from '../cards';
import { resolveRound, validateDeployment } from './resolveRound';
import { applyEvent } from './replay';

// Combat rules (winner survives unchanged, overflow is player damage) and the card-pool-expansion
// mechanics: barrier, stall, tokens, bypass, echo, once-per-round immunity, conditional removal.

function hero(cardId: string, power: number, id: string, overrides: Partial<HeroInstance> = {}): HeroInstance {
  const card = getCard(cardId);
  return { instanceId: id, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power, tempPower: 0, shielded: false, silenced: false, usedThisRound: false, ...overrides };
}

function spell(cardId: string, id = 's1'): SpellZoneInstance {
  const card = getCard(cardId);
  return { instanceId: id, cardId, faction: card.faction, name: card.name, shortName: card.shortName, usedThisRound: false };
}

function side(s: 'player' | 'enemy', overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    side: s,
    hp: 20,
    deck: [],
    hand: [],
    graveyard: [],
    heroZones: { left: null, center: null, right: null },
    spellZones: { left: null, center: null, right: null },
    ...overrides,
  };
}

function game(player: Partial<PlayerState> = {}, enemy: Partial<PlayerState> = {}, round = 2): GameState {
  return { round, rngState: 7, player: side('player', player), enemy: side('enemy', enemy), status: 'IN_PROGRESS' };
}

const NONE = { plays: [] };
const KNIGHT = 'kng-common-knight';
const of = (events: GameEvent[], type: GameEvent['type']) => events.filter((e) => e.type === type);

describe('Combat: the winner survives at full Power, overflow is damage to the loser\'s PLAYER', () => {
  it('7 vs 5: the 5 dies, the 7 is untouched, the defending player takes 2', () => {
    const s = game({ heroZones: { left: hero(KNIGHT, 7, 'p1'), center: null, right: null } }, { heroZones: { left: hero(KNIGHT, 5, 'e1'), center: null, right: null } });
    const { nextState, events } = resolveRound(s, NONE, NONE, 1);
    const winner = nextState.player.heroZones.left!;
    expect(winner.power).toBe(7);
    expect(winner.tempPower).toBe(0);
    expect(winner.instanceId).toBe('p1');
    expect(nextState.enemy.heroZones.left).toBeNull();
    expect(nextState.enemy.hp).toBe(18);
    expect(nextState.player.hp).toBe(20);
    // No attrition of any kind on the winner: it is never the subject of a Power change or a destruction.
    expect(events.filter((e) => e.type === 'POWER_CHANGED' && e.instanceId === 'p1')).toEqual([]);
    expect(events.filter((e) => e.type === 'HERO_DESTROYED' && e.side === 'player')).toEqual([]);
  });

  it('7 vs 7: both destroyed, no overflow to anyone', () => {
    const s = game({ heroZones: { left: hero(KNIGHT, 7, 'p1'), center: null, right: null } }, { heroZones: { left: hero(KNIGHT, 7, 'e1'), center: null, right: null } });
    const { nextState, events } = resolveRound(s, NONE, NONE, 1);
    expect(nextState.player.heroZones.left).toBeNull();
    expect(nextState.enemy.heroZones.left).toBeNull();
    expect(nextState.player.hp).toBe(20);
    expect(nextState.enemy.hp).toBe(20);
    expect(of(events, 'OVERFLOW_DAMAGE')).toEqual([]);
  });

  it('5 vs 7: the player\'s 5 dies, the PLAYER takes the 2, the enemy 7 is untouched', () => {
    const s = game({ heroZones: { left: hero(KNIGHT, 5, 'p1'), center: null, right: null } }, { heroZones: { left: hero(KNIGHT, 7, 'e1'), center: null, right: null } });
    const { nextState } = resolveRound(s, NONE, NONE, 1);
    expect(nextState.player.heroZones.left).toBeNull();
    expect(nextState.player.hp).toBe(18);
    expect(nextState.enemy.hp).toBe(20);
    expect(nextState.enemy.heroZones.left?.power).toBe(7);
    expect(nextState.enemy.heroZones.left?.tempPower).toBe(0);
  });

  it('7 vs an empty lane: 7 direct damage, the attacker is untouched', () => {
    const s = game({ heroZones: { left: hero(KNIGHT, 7, 'p1'), center: null, right: null } });
    const { nextState, events } = resolveRound(s, NONE, NONE, 1);
    expect(nextState.enemy.hp).toBe(13);
    expect(nextState.player.heroZones.left?.power).toBe(7);
    expect(events).toContainEqual(expect.objectContaining({ type: 'DIRECT_DAMAGE', side: 'enemy', amount: 7 }));
    expect(of(events, 'OVERFLOW_DAMAGE')).toEqual([]);
  });

  it('a shielded loser: the shield eats the destruction, the Hero survives at its own Power, and the overflow STILL lands on its owner', () => {
    const s = game({ heroZones: { left: hero(KNIGHT, 7, 'p1'), center: null, right: null } }, { heroZones: { left: hero(KNIGHT, 5, 'e1', { shielded: true }), center: null, right: null } });
    const { nextState, events } = resolveRound(s, NONE, NONE, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'SHIELD_CONSUMED', side: 'enemy', instanceId: 'e1' }));
    expect(of(events, 'HERO_DESTROYED')).toEqual([]);
    expect(nextState.enemy.heroZones.left?.power).toBe(5);
    expect(nextState.enemy.heroZones.left?.shielded).toBe(false);
    expect(nextState.player.heroZones.left?.power).toBe(7);
    expect(nextState.enemy.hp).toBe(18); // overflow is unaffected by the shield
  });

  it('the event stream says exactly who lost, who took the overflow, how much, and which Hero survived', () => {
    const s = game({ heroZones: { left: hero(KNIGHT, 7, 'p1'), center: null, right: null } }, { heroZones: { left: hero(KNIGHT, 5, 'e1'), center: null, right: null } });
    const { events } = resolveRound(s, NONE, NONE, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'left', outcome: 'PLAYER_WINS' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'HERO_DESTROYED', side: 'enemy', instanceId: 'e1' }));
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'OVERFLOW_DAMAGE', side: 'enemy', lane: 'left', amount: 2, from: 20, to: 18, winnerInstanceId: 'p1', loserInstanceId: 'e1' }),
    );
    // Replaying the stream reproduces the same board: the survivor's Power never moves.
    let replay = s;
    for (const e of events) replay = applyEvent(replay, e);
    expect(replay.player.heroZones.left?.power).toBe(7);
    expect(replay.enemy.heroZones.left).toBeNull();
    expect(replay.enemy.hp).toBe(18);
  });
});

describe('Draw-back-to-3 works with real play: card flow across a round', () => {
  it('a round leaves state the next beginRound can refill from without duplicate hand ids', async () => {
    const { beginRound } = await import('./resolveRound');
    const s = game({ deck: Array.from({ length: 6 }, () => KNIGHT), hand: [{ handId: 'h0', cardId: KNIGHT }] }, { deck: Array.from({ length: 6 }, () => KNIGHT) });
    const r = resolveRound(s, { plays: [{ handId: 'h0', cardId: KNIGHT, lane: 'left' }] }, NONE, 1);
    const next = beginRound(r.nextState).nextState;
    const ids = next.player.hand.map((h) => h.handId);
    expect(next.player.hand.length).toBe(3);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Aegis Ward - PREVENT_NEXT_DAMAGE', () => {
  it('absorbs exactly the next damage instance, then expires at Round End', () => {
    const s = game(
      { hand: [{ handId: 'a', cardId: 'spl-aegis-ward' }] },
      { heroZones: { left: hero(KNIGHT, 5, 'e1'), center: hero(KNIGHT, 4, 'e2'), right: null } },
    );
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'a', cardId: 'spl-aegis-ward', lane: 'right' }] }, NONE, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'DAMAGE_PREVENTED', side: 'player', amount: 5 }));
    expect(nextState.player.hp).toBe(16); // left (5) prevented, center (4) landed
    expect(nextState.player.barrier).toBeUndefined();
  });

  it('an unspent barrier does not carry into the next round', () => {
    const s = game({ hand: [{ handId: 'a', cardId: 'spl-aegis-ward' }] });
    const { nextState } = resolveRound(s, { plays: [{ handId: 'a', cardId: 'spl-aegis-ward', lane: 'left' }] }, NONE, 1);
    expect(nextState.player.barrier).toBeUndefined();
  });

  it('also absorbs combat overflow', () => {
    const s = game(
      { hand: [{ handId: 'a', cardId: 'spl-aegis-ward' }], heroZones: { left: hero(KNIGHT, 2, 'p1'), center: null, right: null } },
      { heroZones: { left: hero(KNIGHT, 7, 'e1'), center: null, right: null } },
    );
    const { nextState } = resolveRound(s, { plays: [{ handId: 'a', cardId: 'spl-aegis-ward', lane: 'right' }] }, NONE, 1);
    expect(nextState.player.hp).toBe(20);
    expect(nextState.player.heroZones.left).toBeNull(); // the Hero still lost the lane; only the damage was prevented
  });
});

describe('Stasis Field - STALL_COMBAT (an answer to a big Hero)', () => {
  it('a stalled lane has no combat: nobody dies, nobody takes overflow, and the freeze expires', () => {
    const s = game(
      { hand: [{ handId: 'st', cardId: 'spl-stasis-field' }], heroZones: { left: hero(KNIGHT, 2, 'p1'), center: null, right: null } },
      { heroZones: { left: hero(KNIGHT, 9, 'e1'), center: null, right: null } },
    );
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'st', cardId: 'spl-stasis-field', lane: 'left' }] }, NONE, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'left', outcome: 'STALLED' }));
    expect(nextState.player.heroZones.left?.power).toBe(2);
    expect(nextState.enemy.heroZones.left?.power).toBe(9);
    expect(nextState.player.hp).toBe(20);
    expect(nextState.enemy.hp).toBe(20);
    expect(nextState.enemy.heroZones.left?.stalled).toBeUndefined();
  });

  it('cannot be cast on an empty lane', () => {
    const s = game({ hand: [{ handId: 'st', cardId: 'spl-stasis-field' }] });
    expect(validateDeployment(s, 'player', { plays: [{ handId: 'st', cardId: 'spl-stasis-field', lane: 'left' }] }).legal).toBe(false);
  });

  it('is a hostile Spell: a Mage Slayer\'s once-per-round immunity blocks it', () => {
    const s = game(
      { hand: [{ handId: 'st', cardId: 'spl-stasis-field' }] },
      { heroZones: { left: hero('kng-null-templar', 5, 'e1'), center: null, right: null } },
    );
    const { events } = resolveRound(s, { plays: [{ handId: 'st', cardId: 'spl-stasis-field', lane: 'left' }] }, NONE, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'IMMUNITY_BLOCKED', side: 'enemy', immunity: 'SPELL' }));
    expect(of(events, 'COMBAT_STALLED')).toEqual([]);
  });
});

describe('Mage Slayer counterplay stays soft', () => {
  it('Null Templar blocks only the FIRST hostile Spell each round; the second lands', () => {
    const s = game(
      { hand: [{ handId: 'a', cardId: 'spl-death-wave' }, { handId: 'b', cardId: 'spl-death-wave' }] },
      { heroZones: { left: null, center: hero('kng-null-templar', 5, 'e1'), right: null } },
    );
    const { events } = resolveRound(
      s,
      { plays: [{ handId: 'a', cardId: 'spl-death-wave', lane: 'left' }, { handId: 'b', cardId: 'spl-death-wave', lane: 'right' }] },
      NONE,
      1,
    );
    expect(of(events, 'IMMUNITY_BLOCKED').length).toBe(1);
    expect(events.filter((e) => e.type === 'POWER_CHANGED' && e.instanceId === 'e1' && e.to - e.from === -2).length).toBe(1);
  });

  it('a Silenced Null Templar has no immunity at all', () => {
    const s = game(
      { hand: [{ handId: 'a', cardId: 'spl-weakness' }] },
      { heroZones: { left: hero('kng-null-templar', 5, 'e1', { silenced: true }), center: null, right: null } },
    );
    const { events } = resolveRound(s, { plays: [{ handId: 'a', cardId: 'spl-weakness', lane: 'left' }] }, NONE, 1);
    expect(of(events, 'IMMUNITY_BLOCKED')).toEqual([]);
  });

  it('Spellbreaker gains +2 Power whenever the enemy plays a Spell, and turns a losing lane into a win', () => {
    const board = { heroZones: { left: hero('kng-spellbreaker', 4, 'p1'), center: null, right: null } };
    const foe = { heroZones: { left: hero(KNIGHT, 5, 'e1'), center: null, right: null }, hand: [{ handId: 'x', cardId: 'spl-aegis-ward' }] };
    const withSpell = resolveRound(game(board, foe), NONE, { plays: [{ handId: 'x', cardId: 'spl-aegis-ward', lane: 'right' }] }, 1);
    expect(withSpell.nextState.enemy.heroZones.left).toBeNull(); // 4 + 2 = 6 beats 5
    expect(withSpell.nextState.player.heroZones.left?.power).toBe(4); // the bonus was temporary
    const without = resolveRound(game(board, { heroZones: foe.heroZones }), NONE, NONE, 1);
    expect(without.nextState.player.heroZones.left).toBeNull(); // 4 loses to 5 without the trigger
  });

  it('Runebreaker destroys the enemy Continuous Spell in its lane on play', () => {
    const s = game(
      { hand: [{ handId: 'r', cardId: 'inf-runebreaker' }] },
      { spellZones: { left: spell('spl-battle-banner'), center: null, right: null } },
    );
    const { events } = resolveRound(s, { plays: [{ handId: 'r', cardId: 'inf-runebreaker', lane: 'left' }] }, NONE, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'SPELL_ZONE_DESTROYED', side: 'enemy', lane: 'left' }));
  });

  it('Runebreaker is Spell-immune only while another Mage Slayer stands beside it', () => {
    const run = (ally: boolean) =>
      resolveRound(
        game(
          { hand: [{ handId: 'a', cardId: 'spl-weakness' }] },
          { heroZones: { left: hero('inf-runebreaker', 5, 'e1'), center: ally ? hero('kng-spellbreaker', 4, 'e2') : null, right: null } },
        ),
        { plays: [{ handId: 'a', cardId: 'spl-weakness', lane: 'left' }] },
        NONE,
        1,
      ).events;
    expect(of(run(true), 'IMMUNITY_BLOCKED').length).toBe(1);
    expect(of(run(false), 'IMMUNITY_BLOCKED').length).toBe(0);
  });
});

describe('Archmage Vael - SPELL_ECHO and the Spell payoff', () => {
  const twoBolts = { hand: [{ handId: 'a', cardId: 'spl-arcane-bolt' }, { handId: 'b', cardId: 'spl-arcane-bolt' }] };
  const plays = { plays: [{ handId: 'a', cardId: 'spl-arcane-bolt', lane: 'left' as const }, { handId: 'b', cardId: 'spl-arcane-bolt', lane: 'center' as const }] };
  // A tied Hero in front of Vael so neither side takes Hero damage - the HP total isolates the Spells.
  const facing = { heroZones: { left: null, center: hero(KNIGHT, 3, 'e1'), right: null } };

  it('the first Spell resolves twice, the second once, and the second Spell triggers 2 damage', () => {
    const s = game({ ...twoBolts, heroZones: { left: null, center: hero('kng-archmage-vael', 3, 'p1'), right: null } }, facing);
    const { nextState } = resolveRound(s, plays, NONE, 1);
    // bolt 1 twice: 3 + 3 = 6; bolt 2 once (another Spell already played): 3 + 2 = 5; Vael's 2nd-Spell payoff: 2 -> 13 damage.
    expect(nextState.enemy.hp).toBe(7);
  });

  it('a Silenced Vael echoes nothing and pays off nothing', () => {
    const s = game({ ...twoBolts, heroZones: { left: null, center: hero('kng-archmage-vael', 3, 'p1', { silenced: true }), right: null } }, facing);
    const { nextState } = resolveRound(s, plays, NONE, 1);
    expect(nextState.enemy.hp).toBe(12); // 3 + (3 + 2)
  });

  it('without Vael the same two Spells deal 8', () => {
    const { nextState } = resolveRound(game(twoBolts), plays, NONE, 1);
    expect(nextState.enemy.hp).toBe(12);
  });
});

describe('Tokens', () => {
  it('Ward Circle fills up to 2 empty lanes with Ward tokens that soften overflow, then vanish without a Graveyard entry', () => {
    const s = game(
      { hand: [{ handId: 'w', cardId: 'spl-ward-circle' }], heroZones: { left: hero(KNIGHT, 6, 'p1'), center: null, right: null } },
      { heroZones: { left: null, center: hero(KNIGHT, 5, 'e1'), right: hero(KNIGHT, 6, 'e2') } },
    );
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'w', cardId: 'spl-ward-circle', lane: 'left' }] }, NONE, 1);
    const summoned = events.filter((e) => e.type === 'TOKEN_SUMMONED');
    expect(summoned.map((e) => (e as { lane: string }).lane)).toEqual(['center', 'right']);
    // Ward (2 Power, -2 overflow) loses to 5 and 6: overflow max(0, 3 - 2) + max(0, 4 - 2) = 1 + 2.
    expect(nextState.player.hp).toBe(17);
    expect(nextState.player.heroZones.center).toBeNull();
    expect(nextState.player.graveyard).not.toContain('tok-ward');
    expect(nextState.player.graveyard.filter((id) => id === 'spl-ward-circle').length).toBe(1);
    expect(events.filter((e) => e.type === 'HERO_DESTROYED' && e.side === 'player').every((e) => (e as { token?: boolean }).token === true)).toBe(true);
  });

  it('a token replays exactly: the event stream alone rebuilds the board with no Graveyard token', () => {
    const s = game({ hand: [{ handId: 'w', cardId: 'spl-ward-circle' }] }, { heroZones: { left: hero(KNIGHT, 6, 'e1'), center: null, right: null } });
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'w', cardId: 'spl-ward-circle', lane: 'left' }] }, NONE, 1);
    let replay = s;
    for (const e of events) replay = applyEvent(replay, e);
    expect(replay.player.heroZones).toEqual(nextState.player.heroZones);
    expect(replay.player.graveyard).toEqual(nextState.player.graveyard);
  });

  it('a token summoned mid-round is never offered a full lane: no empty lane, no token', () => {
    const s = game(
      { hand: [{ handId: 'w', cardId: 'spl-ward-circle' }], heroZones: { left: hero(KNIGHT, 5, 'a'), center: hero(KNIGHT, 5, 'b'), right: hero(KNIGHT, 5, 'c') } },
    );
    const { events } = resolveRound(s, { plays: [{ handId: 'w', cardId: 'spl-ward-circle', lane: 'left' }] }, NONE, 1);
    expect(of(events, 'TOKEN_SUMMONED')).toEqual([]);
  });

  it('Packhound answers a dead Beast with a Pup token - and a dying token summons nothing (no recursion)', () => {
    const s = game(
      { heroZones: { left: hero('inf-packhound', 4, 'p1'), center: hero('inf-ash-jackal', 3, 'p2'), right: null } },
      { heroZones: { left: null, center: hero(KNIGHT, 9, 'e1'), right: null } },
    );
    const r1 = resolveRound(s, NONE, NONE, 1);
    expect(of(r1.events, 'TOKEN_SUMMONED').length).toBe(1);
    expect(r1.nextState.player.heroZones.center?.token).toBe(true);
    expect(r1.nextState.player.graveyard).toEqual(['inf-ash-jackal']);
    // Next round the Pup (2) dies to the 9: nothing is summoned and nothing joins the Graveyard.
    const r2 = resolveRound(r1.nextState, NONE, NONE, 2);
    expect(of(r2.events, 'TOKEN_SUMMONED')).toEqual([]);
    expect(r2.nextState.player.heroZones.center).toBeNull();
    expect(r2.nextState.player.graveyard).toEqual(['inf-ash-jackal']);
  });

  it('a token\'s death triggers nothing: Blood Demon (+1 on ANY death) does not grow when Wards die around it', () => {
    const s = game(
      { hand: [{ handId: 'w', cardId: 'spl-ward-circle' }], heroZones: { left: null, center: null, right: hero('inf-blood-demon', 6, 'p1') } },
      { heroZones: { left: hero(KNIGHT, 8, 'e1'), center: hero(KNIGHT, 8, 'e2'), right: null } },
    );
    const { nextState, events } = resolveRound(s, { plays: [{ handId: 'w', cardId: 'spl-ward-circle', lane: 'right' }] }, NONE, 1);
    expect(events.filter((e) => e.type === 'HERO_DESTROYED' && (e as { token?: boolean }).token).length).toBe(2); // both Wards died...
    expect(nextState.player.heroZones.right?.power).toBe(6); // ...and Blood Demon never reacted
  });
});

describe('Bypass (Trickster)', () => {
  const thief = (extra: Partial<HeroInstance> = {}) => hero('und-shade-thief', 4, 'p1', extra);
  const bigFoe = { heroZones: { left: hero(KNIGHT, 6, 'e1'), center: null, right: null } };

  it('with a Continuous Spell up it skips combat and deals its full Power as direct damage; the big Hero is neither hurt nor hurting', () => {
    const s = game({ heroZones: { left: thief(), center: null, right: null }, spellZones: { left: null, center: spell('spl-fortify'), right: null } }, bigFoe);
    const { nextState, events } = resolveRound(s, NONE, NONE, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'COMBAT', lane: 'left', outcome: 'PLAYER_DIRECT', bypass: true }));
    expect(nextState.enemy.hp).toBe(16);
    expect(nextState.player.hp).toBe(20);
    expect(nextState.player.heroZones.left).not.toBeNull();
    expect(nextState.enemy.heroZones.left).not.toBeNull();
  });

  it('without setup it fights normally and loses', () => {
    const s = game({ heroZones: { left: thief(), center: null, right: null } }, bigFoe);
    const { nextState } = resolveRound(s, NONE, NONE, 1);
    expect(nextState.player.heroZones.left).toBeNull();
    expect(nextState.player.hp).toBe(18); // 6 - 4 overflow
  });

  it('cannot bypass on the round it enters', () => {
    const s = game(
      { hand: [{ handId: 't', cardId: 'und-shade-thief' }], spellZones: { left: null, center: spell('spl-fortify'), right: null } },
      bigFoe,
    );
    const { nextState } = resolveRound(s, { plays: [{ handId: 't', cardId: 'und-shade-thief', lane: 'left' }] }, NONE, 1);
    expect(nextState.player.heroZones.left).toBeNull(); // fought, and lost
  });

  it('is switched off by Silence, and by losing the supporting Spell', () => {
    const base = { heroZones: { left: thief(), center: null, right: null }, spellZones: { left: null, center: spell('spl-fortify'), right: null } };
    const silenced = resolveRound(game({ ...base, heroZones: { left: thief({ silenced: true }), center: null, right: null } }, bigFoe), NONE, NONE, 1);
    expect(silenced.nextState.player.heroZones.left).toBeNull();
    const dispelled = resolveRound(
      game({ ...base, spellZones: { left: null, center: null, right: null } }, bigFoe),
      NONE,
      NONE,
      1,
    );
    expect(dispelled.nextState.player.heroZones.left).toBeNull();
  });

  it('Mirage Imp needs the Spell in ITS OWN lane and hits for full Power', () => {
    const imp = hero('inf-mirage-imp', 4, 'p1');
    const wrongLane = resolveRound(game({ heroZones: { left: imp, center: null, right: null }, spellZones: { left: null, center: spell('spl-fortify'), right: null } }, bigFoe), NONE, NONE, 1);
    expect(wrongLane.nextState.player.heroZones.left).toBeNull();
    const rightLane = resolveRound(game({ heroZones: { left: imp, center: null, right: null }, spellZones: { left: spell('spl-fortify'), center: null, right: null } }, bigFoe), NONE, NONE, 1);
    expect(rightLane.nextState.enemy.hp).toBe(16);
    expect(rightLane.nextState.player.heroZones.left).not.toBeNull();
  });

  it('Wraith Prince grows by 1 with every bypass hit', () => {
    const prince = hero('und-wraith-prince', 4, 'p1');
    const { nextState } = resolveRound(game({ heroZones: { left: prince, center: null, right: null }, spellZones: { left: null, center: spell('spl-fortify'), right: null } }, bigFoe), NONE, NONE, 1);
    expect(nextState.enemy.hp).toBe(17); // 4 - 1
    expect(nextState.player.heroZones.left?.power).toBe(5);
  });

  it('a Hero opposing an EMPTY lane is unaffected: normal full-Power direct damage', () => {
    const s = game({ heroZones: { left: thief(), center: null, right: null }, spellZones: { left: null, center: spell('spl-fortify'), right: null } });
    expect(resolveRound(s, NONE, NONE, 1).nextState.enemy.hp).toBe(16);
  });
});

describe('Conditional removal and answers to a big Hero', () => {
  it('Giant\'s Bane kills a 9-Power Hero only while the enemy outnumbers you', () => {
    const big = hero(KNIGHT, 9, 'e1');
    const outnumbered = resolveRound(
      game({ hand: [{ handId: 'g', cardId: 'spl-giants-bane' }] }, { heroZones: { left: big, center: hero(KNIGHT, 1, 'e2'), right: null } }),
      { plays: [{ handId: 'g', cardId: 'spl-giants-bane', lane: 'left' }] },
      NONE,
      1,
    );
    expect(outnumbered.nextState.enemy.graveyard).toContain(KNIGHT);
    expect(outnumbered.nextState.enemy.heroZones.left).toBeNull();
    const even = resolveRound(
      game({ hand: [{ handId: 'g', cardId: 'spl-giants-bane' }], heroZones: { left: null, center: hero(KNIGHT, 1, 'p9'), right: null } }, { heroZones: { left: big, center: null, right: null } }),
      { plays: [{ handId: 'g', cardId: 'spl-giants-bane', lane: 'left' }] },
      NONE,
      1,
    );
    expect(even.nextState.enemy.heroZones.left?.power).toBe(9);
    expect(even.events).toContainEqual(expect.objectContaining({ type: 'SPELL_RESOLVED', cardId: 'spl-giants-bane', fizzled: true }));
  });

  it('Blood Pact trades your Hero in the lane for theirs, but never reaches a 7-Power Hero', () => {
    const pact = { handId: 'b', cardId: 'spl-blood-pact' };
    const ok = resolveRound(
      game({ hand: [pact], heroZones: { left: hero(KNIGHT, 4, 'p1'), center: null, right: null } }, { heroZones: { left: hero(KNIGHT, 6, 'e1'), center: null, right: null } }),
      { plays: [{ ...pact, lane: 'left' }] },
      NONE,
      1,
    );
    expect(ok.nextState.player.heroZones.left).toBeNull();
    expect(ok.nextState.enemy.heroZones.left).toBeNull();
    const tooBig = game({ hand: [pact], heroZones: { left: hero(KNIGHT, 4, 'p1'), center: null, right: null } }, { heroZones: { left: hero(KNIGHT, 7, 'e1'), center: null, right: null } });
    expect(validateDeployment(tooBig, 'player', { plays: [{ ...pact, lane: 'left' }] }).legal).toBe(false);
    const noSacrifice = game({ hand: [pact] }, { heroZones: { left: hero(KNIGHT, 3, 'e1'), center: null, right: null } });
    expect(validateDeployment(noSacrifice, 'player', { plays: [{ ...pact, lane: 'left' }] }).legal).toBe(false);
  });

  it('Hush silences without touching Power, so a vanilla giant is unmoved (Silence is not a universal answer)', () => {
    const { nextState } = resolveRound(
      game({ hand: [{ handId: 'h', cardId: 'spl-hush' }], heroZones: { left: hero(KNIGHT, 3, 'p1'), center: null, right: null } }, { heroZones: { left: hero(KNIGHT, 9, 'e1'), center: null, right: null } }),
      { plays: [{ handId: 'h', cardId: 'spl-hush', lane: 'left' }] },
      NONE,
      1,
    );
    expect(nextState.player.heroZones.left).toBeNull();
  });
});

describe('Graveyard returns pick Heroes, never Spells', () => {
  it('Second Chance returns a Hero even when a Spell sits in the Graveyard', () => {
    const s = game({ hand: [{ handId: 'sc', cardId: 'spl-second-chance' }], graveyard: ['spl-weakness', 'und-bone-soldier'] });
    const { nextState } = resolveRound(s, { plays: [{ handId: 'sc', cardId: 'spl-second-chance', lane: 'left' }] }, NONE, 1);
    expect(nextState.player.hand.map((h) => h.cardId)).toEqual(['und-bone-soldier']);
  });
});

describe('Card text stays short', () => {
  it('every expansion card\'s board text fits a chit', () => {
    for (const id of ['kng-apprentice-mage', 'kng-archmage-vael', 'und-grave-sage', 'inf-runebreaker', 'inf-alpha-hound', 'und-wraith-prince', 'spl-arcane-bolt', 'spl-blood-pact']) {
      expect(getCard(id).boardText!.length, id).toBeLessThanOrEqual(30);
    }
  });
});

describe('A defeated player cannot be healed back (sweep-found stalemate)', () => {
  it('lethal overflow followed by a Grave Knight heal in the same round still ends the match', () => {
    // Enemy at 2 HP takes 6 overflow from the Knight, then Grave Knight's "first enemy death: heal 2" fires - it must not revive them.
    const s = game(
      { heroZones: { left: hero(KNIGHT, 8, 'p1'), center: null, right: hero('und-grave-knight', 4, 'p2') } },
      { hp: 2, heroZones: { left: hero(KNIGHT, 2, 'e1'), center: null, right: hero(KNIGHT, 2, 'e2') } },
    );
    const { nextState } = resolveRound(s, NONE, NONE, 1);
    expect(nextState.status).toBe('PLAYER_WIN');
    expect(nextState.enemy.hp).toBe(0);
  });
});
