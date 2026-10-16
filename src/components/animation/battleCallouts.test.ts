import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState } from '../../game/types';
import { buildAnimationSteps } from './buildAnimationSteps';
import { BIG_HIT_SHARE, battleCalloutForStep, isBigHit } from './battleCallouts';

// Only the two HP fields the callouts read; everything else about the board is irrelevant to them.
const state = (playerMax = 1000, enemyMax = 1000) => ({ player: { hp: playerMax, maxHp: playerMax }, enemy: { hp: enemyMax, maxHp: enemyMax } }) as unknown as GameState;

const calloutsFor = (events: GameEvent[], s: GameState = state()) => buildAnimationSteps(events).map((step) => battleCalloutForStep(step, s)).filter((c) => c !== null);

describe('battle callouts come only from logged events', () => {
  it('an unopposed attack reads as a Direct Attack beside the HP it hit', () => {
    const events: GameEvent[] = [
      { type: 'COMBAT', lane: 'left', outcome: 'PLAYER_DIRECT', player: { name: 'Knight', power: 90 }, enemy: null },
      { type: 'DIRECT_DAMAGE', side: 'enemy', amount: 90, from: 1000, to: 910, sourceName: 'Knight' },
    ];
    const [callout] = calloutsFor(events);
    expect(callout).toMatchObject({ kind: 'direct', anchor: 'hp', side: 'enemy', text: 'Direct Attack −90', big: false });
  });

  it('a heavy unopposed attack is a Big Hit', () => {
    const events: GameEvent[] = [
      { type: 'COMBAT', lane: 'center', outcome: 'ENEMY_DIRECT', player: null, enemy: { name: 'Demon', power: 300 } },
      { type: 'DIRECT_DAMAGE', side: 'player', amount: 300, from: 1000, to: 700, sourceName: 'Demon' },
    ];
    expect(calloutsFor(events)[0]).toMatchObject({ kind: 'direct', side: 'player', text: 'Big Hit −300', big: true });
  });

  it('effect damage to a player is Burn', () => {
    const events: GameEvent[] = [
      { type: 'TRIGGER', side: 'enemy', sourceName: 'Ignis', trigger: 'ROUND_END', label: 'Round End' },
      { type: 'DIRECT_DAMAGE', side: 'player', amount: 45, from: 1000, to: 955, sourceName: 'Ignis' },
    ];
    expect(calloutsFor(events)).toEqual([expect.objectContaining({ kind: 'burn', anchor: 'hp', side: 'player', text: 'Burn −45' })]);
  });

  it('Clash Damage is only called out when it is big', () => {
    const clash = (amount: number): GameEvent[] => [
      { type: 'COMBAT', lane: 'right', outcome: 'PLAYER_WINS', player: { name: 'A', power: 100 + amount }, enemy: { name: 'B', power: 100 } },
      { type: 'CLASH_DAMAGE', lane: 'right', side: 'enemy', winner: 'player', playerAtk: 100 + amount, enemyAtk: 100, destroyed: [], clashDamage: amount, reduced: 0, prevented: 0, amount, from: 1000, to: 1000 - amount },
    ];
    expect(calloutsFor(clash(40))).toEqual([]);
    expect(calloutsFor(clash(250))).toEqual([expect.objectContaining({ kind: 'big-hit', side: 'enemy', text: 'Big Hit −250' })]);
  });

  it('a revive and a resolved Spell are called out over their lane', () => {
    const events: GameEvent[] = [
      { type: 'REVIVED', side: 'player', instanceId: 'u1', cardId: 'und-mira', name: 'Mira', lane: 'center', power: 50, graveyardIndex: 0 },
      { type: 'SPELL_RESOLVED', side: 'enemy', lane: 'left', cardId: 'spl-inferno', name: 'Inferno', fizzled: false },
      { type: 'SPELL_RESOLVED', side: 'player', lane: 'right', cardId: 'spl-x', name: 'Smite', fizzled: true },
    ];
    expect(calloutsFor(events).map((c) => [c.kind, c.anchor, c.side, c.lane, c.text])).toEqual([
      ['revived', 'lane', 'player', 'center', 'Revived'],
      ['spell', 'lane', 'enemy', 'left', 'Inferno'],
      ['fizzled', 'lane', 'player', 'right', 'Smite fizzled'],
    ]);
  });

  it('ordinary beats get no callout', () => {
    const events: GameEvent[] = [
      { type: 'ROUND_START', round: 2 },
      { type: 'POWER_CHANGED', side: 'player', instanceId: 'u1', name: 'A', from: 50, to: 65, reason: 'buff', permanent: false },
      { type: 'ROUND_END', round: 2 },
    ];
    expect(calloutsFor(events)).toEqual([]);
    expect(battleCalloutForStep(null, state())).toBeNull();
  });

  it('the Big Hit threshold is a share of the damaged side’s own maximum HP', () => {
    const s = state(500, 2000);
    expect(isBigHit(Math.ceil(500 * BIG_HIT_SHARE), s, 'player')).toBe(true);
    expect(isBigHit(Math.ceil(500 * BIG_HIT_SHARE), s, 'enemy')).toBe(false);
    expect(isBigHit(0, s, 'player')).toBe(false);
  });
});
