import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, HeroInstance, MasteryLoadout, PlayerState } from '../types';
import { defaultKingdomDeck, defaultUndeadDeck, getCard } from '../cards';
import { chooseAiAction } from '../ai/simpleAI';
import { createMatch } from './match';
import { beginRound, resolveRound } from './resolveRound';
import { replayUpTo } from './replay';

function hero(cardId: string, power: number, id: string, shielded = false): HeroInstance {
  const card = getCard(cardId);
  return { instanceId: id, cardId, faction: card.faction, name: card.name, shortName: card.shortName, power, tempPower: 0, shielded, silenced: false, usedThisRound: false };
}

function player(side: 'player' | 'enemy', overrides: Partial<PlayerState> = {}): PlayerState {
  return { side, hp: 20, deck: [], hand: [], graveyard: [], heroZones: { left: null, center: null, right: null }, spellZones: { left: null, center: null, right: null }, ...overrides };
}

function state(round: number, mastery: MasteryLoadout | undefined, playerOverrides: Partial<PlayerState> = {}, rngState = 7): GameState {
  return { round, rngState, player: player('player', playerOverrides), enemy: player('enemy'), status: 'IN_PROGRESS', ...(mastery ? { masteries: { player: mastery } } : {}) };
}

const necro = (rank: number): MasteryLoadout => ({ id: 'necromancy', rank });
const fort = (rank: number): MasteryLoadout => ({ id: 'fortification', rank });
const triggers = (events: GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: 'MASTERY_TRIGGERED' }> => e.type === 'MASTERY_TRIGGERED');

describe('Mastery timing and cadence', () => {
  it('Necromancy rank 1 fires on rounds divisible by 4 and not otherwise', () => {
    for (const round of [1, 2, 3, 5, 6, 7]) {
      const { events } = beginRound(state(round, necro(1), { graveyard: ['und-bone-soldier'] }));
      expect(triggers(events), `round ${round}`).toHaveLength(0);
    }
    for (const round of [4, 8]) {
      const { nextState, events } = beginRound(state(round, necro(1), { graveyard: ['und-bone-soldier'] }));
      expect(triggers(events)).toHaveLength(1);
      expect(nextState.player.hand.map((h) => h.cardId)).toEqual(['und-bone-soldier']);
      expect(nextState.player.graveyard).toEqual([]);
    }
  });
  it('rank 2 tightens the cadence to every 3 rounds', () => {
    expect(triggers(beginRound(state(3, necro(2), { graveyard: ['und-bone-soldier'] })).events)).toHaveLength(1);
    expect(triggers(beginRound(state(4, necro(2), { graveyard: ['und-bone-soldier'] })).events)).toHaveLength(0);
    expect(triggers(beginRound(state(3, necro(1), { graveyard: ['und-bone-soldier'] })).events)).toHaveLength(0);
  });
  it('resolves after the round-start draw and announces itself before its effect', () => {
    const { events, nextState } = beginRound(state(4, necro(1), { deck: ['kng-archer'], graveyard: ['und-mira'] }));
    const kinds = events.map((e) => e.type);
    expect(kinds.indexOf('DRAW')).toBeLessThan(kinds.indexOf('MASTERY_TRIGGERED'));
    expect(kinds.indexOf('MASTERY_TRIGGERED')).toBeLessThan(kinds.indexOf('RETURNED_TO_HAND'));
    expect(nextState.player.hand.map((h) => h.cardId)).toEqual(['kng-archer', 'und-mira']);
  });
  it('does nothing without an equipped Mastery, and an enemy with none is unaffected', () => {
    expect(triggers(beginRound(state(4, undefined, { graveyard: ['und-mira'] })).events)).toHaveLength(0);
    const s = state(4, necro(1));
    s.enemy.graveyard = ['und-mira'];
    expect(beginRound(s).nextState.enemy.hand).toEqual([]);
  });
  it('an unimplemented or unknown Mastery is ignored, never a crash', () => {
    expect(triggers(beginRound(state(1, { id: 'blood-pact', rank: 1 }, { graveyard: ['und-mira'] })).events)).toHaveLength(0);
    expect(triggers(beginRound(state(4, { id: 'nonsense', rank: 1 }, { graveyard: ['und-mira'] })).events)).toHaveLength(0);
  });
});

describe('Necromancy', () => {
  it('empty Graveyard: fires as a no-target and changes nothing', () => {
    const s = state(4, necro(1));
    const { nextState, events } = beginRound(s);
    expect(triggers(events)).toEqual([expect.objectContaining({ outcome: 'no-target', detail: 'No Hero in your Graveyard' })]);
    expect(nextState.player.hand).toEqual([]);
    expect(nextState.player.graveyard).toEqual([]);
  });
  it('a Graveyard of only Spells is a no-target and stays untouched', () => {
    const { nextState, events } = beginRound(state(4, necro(1), { graveyard: ['spl-fireball', 'spl-power-surge'] }));
    expect(triggers(events)[0].outcome).toBe('no-target');
    expect(nextState.player.graveyard).toEqual(['spl-fireball', 'spl-power-surge']);
    expect(nextState.player.hand).toEqual([]);
  });
  it('returns a Hero, leaving Spells and other cards in the Graveyard; hand may exceed 3', () => {
    const s = state(4, necro(1), {
      graveyard: ['spl-fireball', 'kng-archer'],
      hand: [
        { handId: 'a', cardId: 'kng-archer' },
        { handId: 'b', cardId: 'kng-archer' },
        { handId: 'c', cardId: 'kng-archer' },
      ],
    });
    const { nextState } = beginRound(s);
    expect(nextState.player.hand).toHaveLength(4);
    expect(nextState.player.graveyard).toEqual(['spl-fireball']);
  });
  it('rank 3 prefers Undead Heroes whenever one is available; rank 1 does not', () => {
    const graveyard = ['inf-flame-imp', 'kng-archer', 'und-bone-soldier', 'inf-cultist'];
    const picked = (rank: number, seed: number) => beginRound(state(rank === 1 ? 4 : 3, necro(rank), { graveyard: [...graveyard] }, seed)).nextState.player.hand[0].cardId;
    for (let seed = 1; seed <= 40; seed++) expect(picked(3, seed)).toBe('und-bone-soldier');
    const rank1 = new Set(Array.from({ length: 40 }, (_, i) => picked(1, i + 1)));
    expect(rank1.size).toBeGreaterThan(1);
    // no Undead Hero -> falls back to any Hero
    const fallback = beginRound(state(3, necro(3), { graveyard: ['kng-archer'] })).nextState.player.hand[0].cardId;
    expect(fallback).toBe('kng-archer');
  });
  it('rank 4 returns two distinct Heroes', () => {
    const { nextState, events } = beginRound(state(3, necro(4), { graveyard: ['und-bone-soldier', 'und-mira', 'und-vharos'] }));
    expect(nextState.player.hand).toHaveLength(2);
    expect(new Set(nextState.player.hand.map((h) => h.handId)).size).toBe(2);
    expect(nextState.player.graveyard).toHaveLength(1);
    expect(triggers(events)[0].detail).toMatch(/^Returned .+ and .+$/);
  });
  it('with a single valid Hero, rank 4 returns just that one', () => {
    const { nextState } = beginRound(state(3, necro(4), { graveyard: ['und-mira', 'spl-fireball'] }));
    expect(nextState.player.hand.map((h) => h.cardId)).toEqual(['und-mira']);
  });
  it('is seeded: the same state gives the same pick, and the pick can differ by seed', () => {
    const run = (seed: number) => beginRound(state(4, necro(1), { graveyard: ['und-bone-soldier', 'und-mira', 'und-vharos', 'kng-archer'] }, seed)).nextState;
    expect(run(99)).toEqual(run(99));
    expect(new Set(Array.from({ length: 30 }, (_, i) => run(i + 1).player.hand[0].cardId)).size).toBeGreaterThan(1);
  });
  it('the playback reducer reconstructs the same state from its events', () => {
    const s = state(4, necro(1), { graveyard: ['und-bone-soldier', 'und-mira'] });
    const { nextState, events } = beginRound(s);
    const replayed = replayUpTo(s, events, events.length - 1);
    expect(replayed.player.hand).toEqual(nextState.player.hand);
    expect(replayed.player.graveyard).toEqual(nextState.player.graveyard);
  });
});

describe('Fortification', () => {
  it('shields an allied Hero on its cadence, via the shared SHIELD_GRANTED event', () => {
    const s = state(4, fort(1), { heroZones: { left: hero('kng-archer', 4, 'h1'), center: null, right: null } });
    const { nextState, events } = beginRound(s);
    expect(nextState.player.heroZones.left?.shielded).toBe(true);
    expect(events).toContainEqual(expect.objectContaining({ type: 'SHIELD_GRANTED', side: 'player', lane: 'left' }));
    expect(triggers(events)[0]).toMatchObject({ outcome: 'applied', masteryId: 'fortification' });
    expect(triggers(beginRound(state(3, fort(1), { heroZones: s.player.heroZones })).events)).toHaveLength(0);
    expect(triggers(beginRound(state(3, fort(2), { heroZones: s.player.heroZones })).events)).toHaveLength(1);
  });
  it('no Heroes on the board: a no-target, nothing changes', () => {
    const { nextState, events } = beginRound(state(4, fort(1)));
    expect(triggers(events)).toEqual([expect.objectContaining({ outcome: 'no-target', detail: 'No Hero to shield' })]);
    expect(events.some((e) => e.type === 'SHIELD_GRANTED')).toBe(false);
    expect(nextState.player.heroZones).toEqual({ left: null, center: null, right: null });
  });
  it('rank 1 picks any Hero, so an already-shielded pick is a wasted shield (like GRANT_SHIELD)', () => {
    const s = state(4, fort(1), { heroZones: { left: hero('kng-archer', 4, 'h1', true), center: null, right: null } });
    const { events } = beginRound(s);
    expect(triggers(events)[0].outcome).toBe('no-target');
    expect(events.some((e) => e.type === 'SHIELD_GRANTED')).toBe(false);
  });
  it('rank 3 prefers a Hero without a shield, across every seed', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = state(3, fort(3), { heroZones: { left: hero('kng-archer', 4, 'h1', true), center: hero('kng-royal-guard', 5, 'h2'), right: hero('kng-paladin', 6, 'h3', true) } }, seed);
      const { nextState } = beginRound(s);
      expect(nextState.player.heroZones.center?.shielded).toBe(true);
    }
  });
  it('rank 3 with every Hero already shielded does nothing', () => {
    const s = state(3, fort(3), { heroZones: { left: hero('kng-archer', 4, 'h1', true), center: hero('kng-royal-guard', 5, 'h2', true), right: null } });
    expect(triggers(beginRound(s).events)[0].outcome).toBe('no-target');
  });
  it('rank 4 shields two different Heroes; with one Hero it shields just that one', () => {
    const two = state(3, fort(4), { heroZones: { left: hero('kng-archer', 4, 'h1'), center: hero('kng-royal-guard', 5, 'h2'), right: hero('kng-paladin', 6, 'h3') } });
    const zones = beginRound(two).nextState.player.heroZones;
    expect(Object.values(zones).filter((h) => h?.shielded)).toHaveLength(2);
    const one = state(3, fort(4), { heroZones: { left: null, center: hero('kng-archer', 4, 'h1'), right: null } });
    expect(beginRound(one).events.filter((e) => e.type === 'SHIELD_GRANTED')).toHaveLength(1);
  });
  it('the granted shield is the real one: it absorbs a lost lane at the destruction choke point', () => {
    const s = state(4, fort(1), { heroZones: { left: hero('kng-archer', 2, 'h1'), center: null, right: null } });
    s.enemy.heroZones.left = hero('inf-pit-fiend', 9, 'e1');
    const begun = beginRound(s);
    const { nextState, events } = resolveRound(begun.nextState, { plays: [] }, { plays: [] }, 11);
    expect(events.some((e) => e.type === 'SHIELD_CONSUMED' && e.side === 'player')).toBe(true);
    expect(events.some((e) => e.type === 'HERO_DESTROYED' && e.side === 'player')).toBe(false);
    expect(nextState.player.heroZones.left?.shielded).toBe(false);
    expect(nextState.player.heroZones.left).not.toBeNull();
  });
  it('the playback reducer reconstructs the shields', () => {
    const s = state(3, fort(4), { heroZones: { left: hero('kng-archer', 4, 'h1'), center: hero('kng-royal-guard', 5, 'h2'), right: null } });
    const { nextState, events } = beginRound(s);
    const replayed = replayUpTo(s, events, events.length - 1);
    expect(replayed.player.heroZones.left?.shielded).toBe(nextState.player.heroZones.left?.shielded);
    expect(replayed.player.heroZones.center?.shielded).toBe(nextState.player.heroZones.center?.shielded);
  });
});

describe('whole-match determinism with a Mastery equipped', () => {
  function play(seed: number, mastery: MasteryLoadout) {
    let { state: s } = createMatch({ seed, playerDeck: defaultUndeadDeck(15), enemyDeck: defaultKingdomDeck(15), masteries: { player: mastery } });
    const all: GameEvent[] = [];
    for (let i = 0; i < 12 && s.status === 'IN_PROGRESS'; i++) {
      const p = chooseAiAction(s, 'player', s.rngState);
      const e = chooseAiAction(s, 'enemy', p.nextRngState);
      const r = resolveRound(s, p.action, e.action, e.nextRngState);
      all.push(...r.events);
      s = r.nextState;
      if (s.status !== 'IN_PROGRESS') break;
      const b = beginRound(s);
      s = b.nextState;
      all.push(...b.events);
    }
    return { s, all };
  }
  it('identical seeds replay identically, Mastery events included, and the Mastery actually fires', () => {
    for (const m of [necro(2), fort(2)]) {
      const a = play(2, m);
      const b = play(2, m);
      expect(b.s).toEqual(a.s);
      expect(b.all).toEqual(a.all);
      expect(triggers(a.all).length).toBeGreaterThan(0);
    }
  });
  it('the equipped Mastery survives every round of state cloning', () => {
    const a = play(3, fort(3));
    expect(a.s.masteries?.player).toEqual(fort(3));
  });
});
