import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../game/types';
import type { MissionDef } from '../../game/missions/definitions';
import type { XpGrantResult } from '../../game/progression/types';
import { finishingBlow, finishingBlowText, missionAdvances, outcomeOf, rankedChange, xpBar } from './battleOutcome';

const round = (n: number): GameEvent => ({ type: 'ROUND_START', round: n });

describe('the finishing blow is read from the log, never guessed', () => {
  it('an unopposed attack that ends the match is a Direct Attack, with its round', () => {
    const events: GameEvent[] = [
      round(1),
      { type: 'COMBAT', lane: 'left', outcome: 'PLAYER_DIRECT', player: { name: 'Knight', power: 90 }, enemy: null },
      { type: 'DIRECT_DAMAGE', side: 'enemy', amount: 90, from: 500, to: 410, sourceName: 'Knight' },
      round(7),
      { type: 'COMBAT', lane: 'center', outcome: 'PLAYER_DIRECT', player: { name: 'Royal Guard', power: 122 }, enemy: null },
      { type: 'DIRECT_DAMAGE', side: 'enemy', amount: 122, from: 122, to: 0, sourceName: 'Royal Guard' },
    ];
    const blow = finishingBlow(events, 'PLAYER_WIN');
    expect(blow).toEqual({ side: 'enemy', kind: 'direct', source: 'Royal Guard', amount: 122, round: 7 });
    expect(finishingBlowText(blow!)).toBe("Royal Guard's Direct Attack");
  });

  it('a lost clash names the winner and the Unit that lost the lane', () => {
    const events: GameEvent[] = [
      round(4),
      { type: 'COMBAT', lane: 'right', outcome: 'V2_CLASH', player: { name: 'Light Priest', power: 113 }, enemy: { name: 'Bone Soldier', power: 128 } },
      { type: 'CLASH_DAMAGE', lane: 'right', side: 'player', winner: 'enemy', playerAtk: 113, enemyAtk: 128, destroyed: [], clashDamage: 15, reduced: 0, prevented: 0, amount: 15, from: 15, to: 0 },
    ];
    const blow = finishingBlow(events, 'ENEMY_WIN');
    expect(blow).toMatchObject({ side: 'player', kind: 'clash', source: 'Bone Soldier', loser: 'Light Priest', amount: 15, round: 4 });
    expect(finishingBlowText(blow!)).toBe('Bone Soldier beat Light Priest in a Clash');
  });

  it('damage from a card effect is the card\'s effect, not an attack', () => {
    const events: GameEvent[] = [round(3), { type: 'DIRECT_DAMAGE', side: 'player', amount: 45, from: 45, to: 0, sourceName: 'Ember Imp' }];
    expect(finishingBlowText(finishingBlow(events, 'ENEMY_WIN')!)).toBe("Ember Imp's effect");
  });

  it('only damage to the side that lost counts, and a draw has no finishing blow', () => {
    const events: GameEvent[] = [
      round(2),
      { type: 'DIRECT_DAMAGE', side: 'enemy', amount: 30, from: 30, to: 0, sourceName: 'Archer' },
      { type: 'DIRECT_DAMAGE', side: 'player', amount: 10, from: 500, to: 490, sourceName: 'Ghoul' },
    ];
    expect(finishingBlow(events, 'PLAYER_WIN')?.source).toBe('Archer');
    expect(finishingBlow(events, 'DRAW')).toBeNull();
    expect(finishingBlow([], 'PLAYER_WIN')).toBeNull();
  });

  it('maps the match status to the screen\'s outcome', () => {
    expect(outcomeOf('PLAYER_WIN')).toBe('victory');
    expect(outcomeOf('ENEMY_WIN')).toBe('defeat');
    expect(outcomeOf('DRAW')).toBe('draw');
  });
});

const def = (id: string, target: number): MissionDef => ({ id, period: 'daily', title: id, metric: 'battle_completed', target, rewardGold: 10, rewardGems: 0, rewardTickets: 0 });
const row = (id: string, target: number, count: number, claimed = false) => ({ def: def(id, target), progress: { count, claimed } });

describe('missions a battle moved forward', () => {
  it('lists what advanced, completed ones first, and nothing else', () => {
    const before = [row('fight', 3, 1), row('win', 2, 1), row('idle', 1, 0)];
    const after = [row('fight', 3, 2), row('win', 2, 2), row('idle', 1, 0)];
    expect(missionAdvances(before, after)).toEqual([
      { id: 'win', title: 'win', from: 1, count: 2, target: 2, completedNow: true },
      { id: 'fight', title: 'fight', from: 1, count: 2, target: 3, completedNow: false },
    ]);
  });

  it('skips missions already complete or claimed, counts past the target, and a reset (a new day)', () => {
    const before = [row('done', 2, 2), row('claimed', 1, 1, true), row('reset', 3, 2)];
    const after = [row('done', 2, 3), row('claimed', 1, 2, true), row('reset', 3, 0)];
    expect(missionAdvances(before, after)).toEqual([]);
  });
});

const grant = (over: Partial<XpGrantResult>): XpGrantResult => ({ gained: 0, levelBefore: 1, levelAfter: 1, levelsGained: [], xpAfter: 0, masteriesUnlocked: [], masteryPointsGained: 0, gemsGained: 0, ...over });

describe('the Account Level bar', () => {
  it('fills from where this match started to where it ended', () => {
    expect(xpBar(grant({ gained: 5, xpAfter: 15 }))).toEqual({ level: 1, from: 10, to: 15, max: 100, levelUp: false });
  });
  it('starts empty in the new level after a level-up', () => {
    expect(xpBar(grant({ gained: 40, levelBefore: 1, levelAfter: 2, levelsGained: [2], xpAfter: 20 }))).toEqual({ level: 2, from: 0, to: 20, max: 150, levelUp: true });
  });
  it('is full at the level cap', () => {
    expect(xpBar(grant({ gained: 5, levelAfter: 20, xpAfter: 0 }))).toMatchObject({ level: 20, from: 1, to: 1, max: 1 });
  });
});

describe('the Ranked rating change', () => {
  it('reports the change within a division', () => {
    expect(rankedChange(24, 48, false)).toMatchObject({ delta: 24, division: 'Bronze', fromProgress: 24, progress: 48, toNext: 52, nextDivision: 'Silver', promoted: false, demoted: false });
  });
  it('notices a promotion, a demotion and a reward that became ready', () => {
    expect(rankedChange(88, 112, true)).toMatchObject({ division: 'Silver', promoted: true, fromProgress: 0, progress: 12, rewardReady: true });
    expect(rankedChange(104, 92, false)).toMatchObject({ division: 'Bronze', demoted: true, fromProgress: 100, delta: -12 });
    expect(rankedChange(0, 0, false)).toMatchObject({ delta: 0, promoted: false, demoted: false });
  });
});
