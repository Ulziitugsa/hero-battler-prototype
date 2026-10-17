import { beforeAll, describe, expect, it } from 'vitest';
import type { GameEvent, GameState, PlayerAction } from '../game/types';
import { resolveCardRound } from '../game/cardCombat/engine';
import { chooseCardAiAction } from '../game/cardCombat/ai';
import { replayUpTo } from '../game/engine/replay';
import { registerTrialCards } from './cards';
import { arrange, handIdOf } from './arrange';
import { ARCANE_TRIALS, type ArcaneTrial } from './trials';
import { describePlay, playTrialRound, solveTrial, trialOutcome } from './solver';

// Part D: each Arcane Trial is solvable with the real resolver, its intended solution works, it can be failed, and it has
// no trivial solution. The whole decision space is searched (every legal deployment, every round, with the production
// AI answering), so these numbers are exact, not samples.

beforeAll(registerTrialCards);

/** The pinned search result per trial: every line of play, and how many of them win. */
const EXPECTED: Record<string, { lines: number; wins: number }> = {
  'endless-legion': { lines: 34, wins: 2 },
  ashfall: { lines: 73, wins: 1 },
  'the-unbroken': { lines: 489, wins: 10 },
};

function solutionAction(state: GameState, trial: ArcaneTrial, round: number): PlayerAction {
  const used = new Map<string, number>();
  return {
    plays: trial.solution[round].map(({ cardId, lane }) => {
      const nth = used.get(cardId) ?? 0;
      used.set(cardId, nth + 1);
      return { handId: handIdOf(state, 'player', cardId, nth), cardId, lane };
    }),
  };
}

/** Plays the intended solution through the battle screen's loop, keeping every round's events and pre-round state. */
function playSolution(trial: ArcaneTrial) {
  let state = arrange(trial.position).state;
  const rounds: { base: GameState; events: GameEvent[]; next: GameState }[] = [];
  for (let r = 0; r < trial.solution.length; r++) {
    const action = solutionAction(state, trial, r);
    const ai = chooseCardAiAction(state, 'enemy', state.rngState);
    const resolved = resolveCardRound(state, action, ai.action, ai.nextRngState);
    rounds.push({ base: state, events: resolved.events, next: resolved.nextState });
    state = playTrialRound(state, action).state;
  }
  return { rounds, final: state };
}

describe.each(ARCANE_TRIALS.map((t) => [t.id, t] as const))('Arcane Trial %s', (_id, trial) => {
  it('is solvable, can be failed, and its search result is pinned', () => {
    const start = arrange(trial.position).state;
    const result = solveTrial(start, trial.rounds);
    expect({ lines: result.lines, wins: result.wins.length }).toEqual(EXPECTED[trial.id]);
    expect(result.wins.length).toBeGreaterThan(0);
    expect(result.lines - result.wins.length).toBeGreaterThan(0);
  }, 120_000);

  it('the intended solution wins, in exactly the rounds allowed', () => {
    const { final } = playSolution(trial);
    expect(trial.solution.length).toBe(trial.rounds);
    expect(final.status).toBe('PLAYER_WIN');
    expect(trialOutcome(final, trial.position.round, trial.rounds)).toBe('success');
  });

  it('has no trivial solution: doing nothing fails, and few lines win', () => {
    const start = arrange(trial.position).state;
    let state = start;
    for (let r = 0; r < trial.rounds && state.status === 'IN_PROGRESS'; r++) state = playTrialRound(state, { plays: [] }).state;
    expect(trialOutcome(state, start.round, trial.rounds)).toBe('failure');
    const result = solveTrial(start, trial.rounds);
    // The Endless Legion's two wins are one idea in mirrored lanes (2 of 34 lines).
    expect(result.wins.length / result.lines).toBeLessThan(0.1);
  }, 120_000);

  it('the outcome the battle screen shows is what the resolver decided (replayed events = final state)', () => {
    for (const round of playSolution(trial).rounds) {
      const shown = replayUpTo(round.base, round.events, round.events.length - 1);
      expect(shown.player.hp).toBe(round.next.player.hp);
      expect(shown.enemy.hp).toBe(round.next.enemy.hp);
      for (const side of ['player', 'enemy'] as const)
        for (const lane of ['left', 'center', 'right'] as const) {
          const a = shown[side].heroZones[lane];
          const b = round.next[side].heroZones[lane];
          expect(a ? [a.cardId, a.power] : null).toEqual(b ? [b.cardId, b.power] : null);
        }
      const end = round.events.find((e) => e.type === 'MATCH_END');
      if (round.next.status !== 'IN_PROGRESS') expect(end).toBeDefined();
    }
  });

  it('every winning line uses the trial’s key idea', () => {
    const result = solveTrial(arrange(trial.position).state, trial.rounds);
    for (const line of result.wins) {
      const all = line.join(' ');
      if (trial.id === 'endless-legion') expect(all).toMatch(/spl-blood-pact@(left|right).*spl-dark-ritual@(left|right).*spl-power-surge@center/);
      if (trial.id === 'ashfall') expect(all).toBe('spl-death-wave@left + spl-weakness@right + xp-cataclysm@center');
      if (trial.id === 'the-unbroken') {
        expect(line[0]).toContain('spl-stasis-field@left');
        expect(line[1]).toContain('xp-vow-unbroken@center');
      }
    }
  }, 120_000);
});

describe('what the intended solutions actually do', () => {
  it('The Endless Legion: two sacrifices, two rises, Mordrath at 230 in the clash', () => {
    const [round] = playSolution(ARCANE_TRIALS[0]).rounds;
    expect(round.events.filter((e) => e.type === 'REVIVED').length).toBe(2);
    const center = round.events.find((e) => e.type === 'COMBAT' && e.lane === 'center') as Extract<GameEvent, { type: 'COMBAT' }>;
    expect(center.player?.power).toBe(230);
    expect(center.outcome).toBe('PLAYER_WINS');
  });

  it('Ashfall: Null Templar absorbs Death Wave; one Cataclysm strikes all three lanes', () => {
    const [round] = playSolution(ARCANE_TRIALS[1]).rounds;
    const blocked = round.events.find((e) => e.type === 'IMMUNITY_BLOCKED') as Extract<GameEvent, { type: 'IMMUNITY_BLOCKED' }>;
    expect(blocked.sourceName).toBe('Death Wave');
    const cast = round.events.findIndex((e) => e.type === 'TRIGGER' && e.sourceName === 'Cataclysm');
    const done = round.events.findIndex((e) => e.type === 'SPELL_RESOLVED' && e.name === 'Cataclysm');
    expect(round.events.slice(cast, done).filter((e) => e.type === 'HERO_DESTROYED').length).toBe(2);
  });

  it('The Unbroken: the Runebreaker breaks the Vow; next round the second Vow blocks Unmaking', () => {
    const [first, second] = playSolution(ARCANE_TRIALS[2]).rounds;
    expect(first.events.some((e) => e.type === 'SPELL_ZONE_DESTROYED' && e.side === 'player')).toBe(true);
    expect(first.next.player.heroZones.center?.power).toBe(520);
    const enemyPlayed = second.events.find((e) => e.type === 'REVEAL') as Extract<GameEvent, { type: 'REVEAL' }>;
    expect(enemyPlayed).toBeDefined();
    expect(second.events.some((e) => e.type === 'IMMUNITY_BLOCKED' && e.sourceName === 'Unmaking')).toBe(true);
    expect(second.next.player.heroZones.center?.cardId).toBe('xp-aurelian');
  });

  it('The Unbroken without the second Vow: Unmaking exiles Aurelian', () => {
    const trial = ARCANE_TRIALS[2];
    let state = arrange(trial.position).state;
    state = playTrialRound(state, solutionAction(state, trial, 0)).state;
    const ai = chooseCardAiAction(state, 'enemy', state.rngState);
    expect(describePlay(ai.action)).toContain('xp-unmaking@center');
    const r = resolveCardRound(state, { plays: [] }, ai.action, ai.nextRngState);
    const exiled = r.events.find((e) => e.type === 'HERO_DESTROYED' && e.side === 'player') as Extract<GameEvent, { type: 'HERO_DESTROYED' }>;
    expect(exiled.cardId).toBe('xp-aurelian');
    expect(exiled.exiled).toBe(true);
  });
});
