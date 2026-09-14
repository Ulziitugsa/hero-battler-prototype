import { describe, expect, it } from 'vitest';
import { defaultInfernalDeck, defaultUndeadDeck } from '../cards';
import { chooseAiAction } from '../ai/simpleAI';
import { createMatch } from './match';
import { beginRound, resolveRound } from './resolveRound';

function playRounds(seed: number, rounds: number) {
  let { state } = createMatch({ seed, playerDeck: defaultInfernalDeck(15), enemyDeck: defaultUndeadDeck(15) });
  const allEvents = [];
  for (let i = 0; i < rounds && state.status === 'IN_PROGRESS'; i++) {
    const p = chooseAiAction(state, 'player', state.rngState);
    const e = chooseAiAction(state, 'enemy', p.nextRngState);
    const result = resolveRound(state, p.action, e.action, e.nextRngState);
    allEvents.push(...result.events);
    state = result.nextState;
    if (state.status !== 'IN_PROGRESS') break;
    const begun = beginRound(state);
    state = begun.nextState;
    allEvents.push(...begun.events);
  }
  return { state, events: allEvents };
}

describe('Seed determinism', () => {
  it('identical seed + identical (AI-driven) actions produce an identical state and event log', () => {
    const runA = playRounds(182734, 10);
    const runB = playRounds(182734, 10);
    expect(runB.state).toEqual(runA.state);
    expect(runB.events).toEqual(runA.events);
  });

  it('a different seed is very likely to diverge (sanity check the seed is actually used)', () => {
    const runA = playRounds(1, 10);
    const runB = playRounds(2, 10);
    expect(runB.events).not.toEqual(runA.events);
  });
});
