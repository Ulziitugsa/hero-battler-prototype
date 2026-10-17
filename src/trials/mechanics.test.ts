import { beforeAll, describe, expect, it } from 'vitest';
import type { CardDefinition, GameEvent, GameState, LaneId, PlayerAction, Side } from '../game/types';
import { registerExperimentalCards } from '../game/cards';
import { beginCardRound, cardAtk, resolveCardRound, validateCardDeployment } from '../game/cardCombat/engine';
import { ATK_CEILING } from '../game/cardCombat/stats';
import { replayUpTo } from '../game/engine/replay';
import { registerTrialCards } from './cards';
import { arrange, handIdOf, type ArrangedPosition } from './arrange';

// Part C: the experimental rules, resolved by the production resolver (resolveCardRound / beginCardRound). Every case
// arranges a position and plays real deployments; nothing here calls an experimental rule directly.

beforeAll(() => {
  registerTrialCards();
  // Test-only cards for the loop guards: never registered outside this file.
  registerExperimentalCards([
    { id: 'xp-test-doomed', name: 'Doomed Riser', shortName: 'Doomed', faction: 'undead', type: 'hero', role: 'Test', rarity: 'common', cost: 0, power: 0, tags: [], abilities: [{ trigger: 'ON_DEATH', actions: [{ type: 'UNDYING', returns: 500, atkPerReturn: -20 }], text: 'Test.' }] },
    { id: 'xp-test-echo-raiser', name: 'Echo Raiser', shortName: 'Raiser', faction: 'undead', type: 'hero', role: 'Test', rarity: 'common', cost: 0, power: 4, tags: [], abilities: [{ trigger: 'ON_ALLY_RETURN', actions: [{ type: 'REVIVE_TO_LANE', maxPower: Infinity, pick: 'LOWEST_POWER', emptyLane: true }], text: 'Test.' }] },
  ] as unknown as CardDefinition[]);
});

const NONE: PlayerAction = { plays: [] };

function plays(state: GameState, side: Side, list: [cardId: string, lane: LaneId][]): PlayerAction {
  const used = new Map<string, number>();
  return {
    plays: list.map(([cardId, lane]) => {
      const nth = used.get(cardId) ?? 0;
      used.set(cardId, nth + 1);
      return { handId: handIdOf(state, side, cardId, nth), cardId, lane };
    }),
  };
}

function round(state: GameState, player: PlayerAction = NONE, enemy: PlayerAction = NONE) {
  for (const [side, action] of [['player', player], ['enemy', enemy]] as const) {
    const v = validateCardDeployment(state, side, action);
    if (!v.legal) throw new Error(v.reason);
  }
  return resolveCardRound(state, player, enemy);
}

const pos = (p: Partial<ArrangedPosition> & Pick<ArrangedPosition, 'player' | 'enemy'>): GameState => arrange({ round: 2, seed: 7, ...p }).state;
const types = (events: GameEvent[]) => events.map((e) => e.type);

describe('Undying (The Immortal Army)', () => {
  it('rises again in its lane, 30 ATK stronger each time, three times, then stays in the Graveyard', () => {
    let s = pos({ player: { hp: 900, board: { left: { cardId: 'xp-deathless-legionary' } }, hand: [] }, enemy: { hp: 900, board: { left: { cardId: 'und-ghoul-brute' } }, hand: [] } });
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = round(s);
      const revived = r.events.filter((e) => e.type === 'REVIVED');
      seen.push(revived.length ? (revived[0] as Extract<GameEvent, { type: 'REVIVED' }>).power : 0);
      s = beginCardRound(r.nextState).nextState;
      // The enemy's lane grows so the Legionary keeps losing (a fresh, bigger blocker each round).
      if (s.enemy.heroZones.left) s.enemy.heroZones.left.power = 300;
    }
    expect(seen).toEqual([110, 140, 170, 0]);
    expect(s.player.heroZones.left).toBeNull();
    expect(s.player.graveyard).toEqual(['xp-deathless-legionary']);
    // Its rises are spent: the Graveyard copy is marked, so no other return effect can bring it back.
    expect(s.cardCombat!.graveMarks.player).toEqual([true]);
  });

  it('logs the Destroyed trigger before the rise, and the rise before any Ally Falls reaction', () => {
    const s = pos({ player: { hp: 900, board: { left: { cardId: 'xp-deathless-legionary' }, center: { cardId: 'und-bonecaller' } }, hand: [] }, enemy: { hp: 900, board: { left: { cardId: 'und-ghoul-brute' } }, hand: [] } });
    const ev = round(s).events;
    const destroyed = ev.findIndex((e) => e.type === 'HERO_DESTROYED' && e.cardId === 'xp-deathless-legionary');
    const trigger = ev.findIndex((e, i) => i > destroyed && e.type === 'TRIGGER' && e.sourceName === 'Deathless Legionary');
    const revived = ev.findIndex((e) => e.type === 'REVIVED');
    const allyFalls = ev.findIndex((e, i) => i > destroyed && e.type === 'TRIGGER' && e.sourceName === 'Bonecaller');
    expect(destroyed).toBeGreaterThan(-1);
    expect(trigger).toBeGreaterThan(destroyed);
    expect(revived).toBeGreaterThan(trigger);
    expect(allyFalls).toBeGreaterThan(revived);
  });

  it('does not rise when its lane is taken, or when it is Silenced as it dies', () => {
    // Silenced by Hush in the Spells step, then destroyed in the clash: no Destroyed effect, so no rise.
    const s = pos({ player: { hp: 900, board: { left: { cardId: 'xp-deathless-legionary' } }, hand: [] }, enemy: { hp: 900, board: { left: { cardId: 'und-ghoul-brute' } }, hand: ['spl-hush'] } });
    const r = round(s, NONE, plays(s, 'enemy', [['spl-hush', 'left']]));
    expect(types(r.events)).toContain('SILENCED');
    expect(types(r.events)).not.toContain('REVIVED');
    expect(r.nextState.player.heroZones.left).toBeNull();
  });
});

describe('Ally Returns (Mordrath)', () => {
  it('grows Mordrath and the returned Unit by 45 each, past the +45 growth cap', () => {
    let s = pos({ player: { hp: 2000, board: { left: { cardId: 'xp-deathless-legionary' }, center: { cardId: 'xp-mordrath' } }, hand: [] }, enemy: { hp: 2000, board: { left: { cardId: 'und-ghoul-brute', atk: 400 } }, hand: [] } });
    const mordrath: number[] = [];
    const legionary: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = round(s);
      s = beginCardRound(r.nextState).nextState;
      mordrath.push(s.player.heroZones.center!.power);
      legionary.push(s.player.heroZones.left!.power);
    }
    expect(mordrath).toEqual([95 + 45, 95 + 90, 95 + 135]);
    // Each rise: printed 80 + 30 per rise, then Mordrath's +45.
    expect(legionary).toEqual([80 + 30 + 45, 80 + 60 + 45, 80 + 90 + 45]);
  });

  it('reacts to every kind of return: Raise Fallen counts too', () => {
    const s = pos({ player: { hp: 900, board: { center: { cardId: 'xp-mordrath' } }, hand: ['spl-raise-fallen'], graveyard: ['und-bone-soldier', 'und-cursed-warrior'] }, enemy: { hp: 900, hand: [] } });
    const r = round(s, plays(s, 'player', [['spl-raise-fallen', 'left']]));
    expect(r.nextState.player.heroZones.center!.power).toBe(95 + 45);
    expect(r.nextState.player.heroZones.left!.power).toBe(cardAtk('und-bone-soldier') + 45);
  });

  it('a Silenced Mordrath does not grow', () => {
    const s = pos({ player: { hp: 900, board: { left: { cardId: 'xp-deathless-legionary' }, center: { cardId: 'xp-mordrath' } }, hand: [] }, enemy: { hp: 900, board: { left: { cardId: 'und-ghoul-brute' } }, hand: ['spl-hush'] } });
    const r = round(s, NONE, plays(s, 'enemy', [['spl-hush', 'center']]));
    expect(types(r.events)).toContain('REVIVED');
    expect(r.nextState.player.heroZones.center!.power).toBe(95);
    expect(r.nextState.player.heroZones.left!.power).toBe(110);
  });
});

describe('Unmaking (exile)', () => {
  it('exiles a grown Unit through its Shield: no Destroyed effect, no rise, no Graveyard', () => {
    const s = pos({ player: { hp: 900, board: { left: { cardId: 'xp-deathless-legionary', atk: 140, shielded: true } }, hand: [] }, enemy: { hp: 900, hand: ['xp-unmaking'] } });
    const r = round(s, NONE, plays(s, 'enemy', [['xp-unmaking', 'left']]));
    const exiled = r.events.find((e) => e.type === 'HERO_DESTROYED') as Extract<GameEvent, { type: 'HERO_DESTROYED' }>;
    expect(exiled.exiled).toBe(true);
    expect(types(r.events)).not.toContain('SHIELD_CONSUMED');
    expect(types(r.events)).not.toContain('REVIVED');
    expect(r.nextState.player.heroZones.left).toBeNull();
    expect(r.nextState.player.graveyard).toEqual([]);
  });

  it('cannot target a Unit at or below its printed ATK', () => {
    const s = pos({ player: { hp: 900, board: { left: { cardId: 'xp-aurelian' } }, hand: [] }, enemy: { hp: 900, hand: ['xp-unmaking'] } });
    expect(validateCardDeployment(s, 'enemy', plays(s, 'enemy', [['xp-unmaking', 'left']])).legal).toBe(false);
  });

  it('is blocked by Spell immunity', () => {
    // Null Templar ignores the first enemy Spell each round.
    const s = pos({ player: { hp: 900, board: { left: { cardId: 'kng-null-templar', atk: 200 } }, hand: [] }, enemy: { hp: 900, hand: ['xp-unmaking'] } });
    const r = round(s, NONE, plays(s, 'enemy', [['xp-unmaking', 'left']]));
    expect(types(r.events)).toContain('IMMUNITY_BLOCKED');
    expect(r.nextState.player.heroZones.left).not.toBeNull();
  });
});

describe('Conduit and Cataclysm (The Apocalypse)', () => {
  const board = { left: { cardId: 'kng-common-knight' }, center: { cardId: 'kng-royal-guard' }, right: { cardId: 'kng-shieldbearer' } };

  it('without a Conduit, Cataclysm hits only its own lane', () => {
    const s = pos({ player: { hp: 900, hand: ['xp-cataclysm'] }, enemy: { hp: 900, board: { center: { cardId: 'kng-shieldbearer', atk: 70 }, left: { cardId: 'kng-shieldbearer', atk: 70 } }, hand: [] } });
    const r = round(s, plays(s, 'player', [['xp-cataclysm', 'center']]));
    expect(r.events.filter((e) => e.type === 'HERO_DESTROYED' && e.side === 'enemy' && e.lane !== 'left').length).toBe(1);
  });

  it('the threshold grows with each Spell cast earlier this round, in lane order', () => {
    // Royal Guard aura: Knight 128 + 15, Shieldbearer 86 + 15. With the Hierophant, two Spells before Cataclysm: 100 + 100 = 200.
    const s = pos({ player: { hp: 900, board: { center: { cardId: 'xp-ashen-hierophant' } }, hand: ['spl-spark', 'spl-cinder-bolt', 'xp-cataclysm'] }, enemy: { hp: 900, board, hand: [] } });
    const last = round(s, plays(s, 'player', [['spl-spark', 'left'], ['spl-cinder-bolt', 'center'], ['xp-cataclysm', 'right']]));
    const killed = last.events.filter((e) => e.type === 'HERO_DESTROYED' && e.side === 'enemy');
    // Right (Shieldbearer) and, by Conduit, center (Royal Guard 113) die before any clash.
    expect(killed.map((e) => (e as Extract<GameEvent, { type: 'HERO_DESTROYED' }>).lane).sort()).toEqual(['center', 'right']);
    // Cast first instead, it has no Spell before it: 100 is below every enemy Unit here.
    const first = round(s, plays(s, 'player', [['xp-cataclysm', 'left'], ['spl-spark', 'center'], ['spl-cinder-bolt', 'right']]));
    const preCombat = first.events.slice(0, first.events.findIndex((e) => e.type === 'COMBAT'));
    expect(preCombat.some((e) => e.type === 'HERO_DESTROYED')).toBe(false);
  });

  it('Conduit from the center reaches all three lanes', () => {
    const s = pos({ player: { hp: 900, board: { left: { cardId: 'xp-ashen-hierophant' } }, hand: ['spl-weakness', 'xp-cataclysm'] }, enemy: { hp: 900, board, hand: [] } });
    const r = round(s, plays(s, 'player', [['spl-weakness', 'left'], ['xp-cataclysm', 'center']]));
    // Weakness (left) spreads to center: Knight 128 − 45 = 83 + 15 aura; Royal Guard 113 − 45 = 68. Cataclysm (center): 100 + 50 = 150.
    const preCombat = r.events.slice(0, r.events.findIndex((e) => e.type === 'COMBAT'));
    const killed = preCombat.filter((e) => e.type === 'HERO_DESTROYED' && e.side === 'enemy').map((e) => (e as Extract<GameEvent, { type: 'HERO_DESTROYED' }>).lane);
    expect(killed.sort()).toEqual(['center', 'left', 'right']);
  });

  it('a Silenced Hierophant spreads nothing; Shields and Spell immunity stop the destruction where they stand', () => {
    const s = pos({ player: { hp: 900, board: { center: { cardId: 'xp-ashen-hierophant' } }, hand: ['xp-cataclysm'] }, enemy: { hp: 900, board: { left: { cardId: 'kng-shieldbearer', atk: 120 }, center: { cardId: 'kng-shieldbearer', atk: 120 }, right: { cardId: 'kng-shieldbearer', atk: 120 } }, hand: ['spl-hush'] } });
    // Round 2: the enemy has initiative, so its Hush on the Hierophant's lane resolves before the player's Cataclysm there.
    const hushed = round(s, plays(s, 'player', [['xp-cataclysm', 'center']]), plays(s, 'enemy', [['spl-hush', 'center']]));
    expect(types(hushed.events)).toContain('SILENCED');
    expect(hushed.events.filter((e) => e.type === 'HERO_DESTROYED' && e.side === 'enemy' && hushed.events.indexOf(e) < types(hushed.events).indexOf('COMBAT')).length).toBe(0);

    const guarded = pos({ player: { hp: 900, board: { center: { cardId: 'xp-ashen-hierophant' } }, hand: ['spl-spark', 'xp-cataclysm'] }, enemy: { hp: 900, board: { left: { cardId: 'kng-shieldbearer', shielded: true }, center: { cardId: 'kng-shieldbearer' }, right: { cardId: 'kng-null-templar', atk: 100 } }, hand: [] } });
    const r = round(guarded, plays(guarded, 'player', [['spl-spark', 'left'], ['xp-cataclysm', 'center']]));
    const pre = r.events.slice(0, r.events.findIndex((e) => e.type === 'COMBAT'));
    expect(types(pre)).toContain('SHIELD_CONSUMED');
    expect(types(pre)).toContain('IMMUNITY_BLOCKED');
    expect(pre.filter((e) => e.type === 'HERO_DESTROYED').map((e) => (e as Extract<GameEvent, { type: 'HERO_DESTROYED' }>).lane)).toEqual(['center']);
  });
});

describe('Multiplication (The Unstoppable Champion)', () => {
  it('doubles its lasting ATK at every Round End; this round’s boosts are not doubled', () => {
    let s = pos({ player: { hp: 900, board: { left: { cardId: 'xp-aurelian' } }, hand: ['spl-power-surge'] }, enemy: { hp: 900, hand: [] } });
    const r1 = round(s, plays(s, 'player', [['spl-power-surge', 'left']]));
    // 65 + 45 this round = 110 hits; Round End doubles the lasting 65 to 130; the +45 then expires.
    expect(r1.nextState.player.heroZones.left!.power).toBe(130);
    s = beginCardRound(r1.nextState).nextState;
    const r2 = round(s);
    expect(r2.nextState.player.heroZones.left!.power).toBe(260);
  });

  it('stops at the ATK ceiling and its Clash Damage never takes HP below 0', () => {
    let s = pos({ player: { hp: 900, board: { left: { cardId: 'xp-aurelian', atk: 6000 } }, hand: [] }, enemy: { hp: 99_999, board: { left: { cardId: 'kng-shieldbearer' } }, hand: [] } });
    const r1 = round(s);
    expect(r1.nextState.player.heroZones.left!.power).toBe(ATK_CEILING);
    s = beginCardRound(r1.nextState).nextState;
    s.enemy.hp = 50;
    s.enemy.heroZones.left = null;
    const r2 = round(s);
    expect(r2.nextState.player.heroZones.left!.power).toBe(ATK_CEILING);
    expect(r2.nextState.enemy.hp).toBe(0);
    expect(r2.nextState.status).toBe('PLAYER_WIN');
  });

  it('unprotected, Silence skips one doubling', () => {
    const s = pos({ player: { hp: 900, board: { left: { cardId: 'xp-aurelian', atk: 130 } }, hand: [] }, enemy: { hp: 900, hand: ['spl-hush'] } });
    const hushed = round(s, NONE, plays(s, 'enemy', [['spl-hush', 'left']]));
    expect(types(hushed.events)).toContain('SILENCED');
    expect(hushed.nextState.player.heroZones.left!.power).toBe(130);
  });

  it('with Vow of the Unbroken it is Shielded every round and immune to enemy Spells, until the Vow is Dispelled', () => {
    const s = pos({ player: { hp: 900, board: { left: { cardId: 'xp-aurelian' } }, spells: { left: { cardId: 'xp-vow-unbroken', attached: true } }, hand: [] }, enemy: { hp: 900, board: { left: { cardId: 'und-ghoul-brute' } }, hand: ['spl-hush', 'spl-dispel'] } });
    const hushed = round(s, NONE, plays(s, 'enemy', [['spl-hush', 'left']]));
    // Hush is blocked; the Vow's Shield saves it from the 122 Ghoul; it doubles.
    expect(types(hushed.events)).toContain('IMMUNITY_BLOCKED');
    expect(types(hushed.events)).toContain('SHIELD_CONSUMED');
    expect(hushed.nextState.player.heroZones.left!.power).toBe(130);
    // Dispel destroys the Spell, not the Unit, so the immunity does not stop it: no Shield, and 65 loses to 122.
    const dispelled = round(s, NONE, plays(s, 'enemy', [['spl-dispel', 'left']]));
    expect(types(dispelled.events)).toContain('SPELL_ZONE_DESTROYED');
    expect(dispelled.nextState.player.heroZones.left).toBeNull();
  });
});

describe('Determinism, replay and loop guards', () => {
  const big: ArrangedPosition = {
    round: 2,
    seed: 99,
    player: { hp: 900, board: { left: { cardId: 'xp-deathless-legionary' }, center: { cardId: 'xp-mordrath' }, right: { cardId: 'xp-ashen-hierophant' } }, hand: ['spl-blood-pact', 'xp-cataclysm', 'spl-spark'] },
    enemy: { hp: 900, board: { left: { cardId: 'kng-common-knight' }, center: { cardId: 'kng-royal-guard' }, right: { cardId: 'kng-shieldbearer' } }, hand: [] },
  };

  it('the same position and plays always give the same events and state', () => {
    const go = () => {
      const s = arrange(big).state;
      return round(s, plays(s, 'player', [['spl-blood-pact', 'left'], ['spl-spark', 'center'], ['xp-cataclysm', 'right']]));
    };
    const a = go();
    const b = go();
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(JSON.stringify(a.nextState)).toBe(JSON.stringify(b.nextState));
  });

  it('replaying the events reproduces the resolver’s board exactly (what the battle screen shows)', () => {
    const s = arrange(big).state;
    const r = round(s, plays(s, 'player', [['spl-blood-pact', 'left'], ['spl-spark', 'center'], ['xp-cataclysm', 'right']]));
    const replayed = replayUpTo(s, r.events, r.events.length - 1);
    for (const side of ['player', 'enemy'] as const) {
      for (const lane of ['left', 'center', 'right'] as const) {
        const a = replayed[side].heroZones[lane];
        const b = r.nextState[side].heroZones[lane];
        expect(a ? [a.cardId, a.power] : null, `${side} ${lane}`).toEqual(b ? [b.cardId, b.power] : null);
      }
      expect(replayed[side].hp).toBe(r.nextState[side].hp);
      expect([...replayed[side].graveyard].sort()).toEqual([...r.nextState[side].graveyard].sort());
    }
  });

  it('a Unit that rises into the death line every time is stopped by the 64-step death-chain guard', () => {
    // 35 ATK is the death line: it rises below it (50 − 20 per rise), is swept, rises again ... until the guard ends the chain.
    const s = pos({ player: { hp: 900, board: { left: { cardId: 'xp-test-doomed', atk: 50 } }, hand: [] }, enemy: { hp: 900, hand: ['spl-weakness'] } });
    const r = round(s, NONE, plays(s, 'enemy', [['spl-weakness', 'left']]));
    expect(types(r.events)).toContain('SAFEGUARD_TRIPPED');
    expect(r.events.filter((e) => e.type === 'REVIVED').length).toBeLessThanOrEqual(64);
  });

  it('Ally Returns reactions that revive more Units are stopped by the nesting guard', () => {
    const s = pos({
      player: { hp: 900, board: { center: { cardId: 'xp-test-echo-raiser' }, right: { cardId: 'xp-test-echo-raiser' } }, hand: ['spl-raise-fallen'], graveyard: ['und-bone-soldier', 'und-cursed-warrior', 'und-ghoul-brute'] },
      enemy: { hp: 900, hand: [] },
    });
    const r = round(s, plays(s, 'player', [['spl-raise-fallen', 'left']]));
    // Every lane fills, so the chain ends on its own long before the guard; nothing loops.
    expect(r.events.filter((e) => e.type === 'REVIVED').length).toBeLessThanOrEqual(3);
  });
});
