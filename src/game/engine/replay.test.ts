import { describe, expect, it } from 'vitest';
import { defaultInfernalDeck, defaultUndeadDeck } from '../cards';
import { chooseAiAction } from '../ai/simpleAI';
import { createMatch } from './match';
import { beginRound, resolveRound } from './resolveRound';
import { replayUpTo } from './replay';

// The UI reconstructs intermediate board states by replaying resolveRound's own event log for
// animation. If the reducer and the engine ever disagree about what an event means, replaying every
// event must still land exactly on the engine's own nextState - this test is the tripwire for that.
describe('replay reducer matches engine state', () => {
  it('stays in sync with resolveRound across a full AI-vs-AI match', () => {
    let { state } = createMatch({ seed: 7, playerDeck: defaultInfernalDeck(15), enemyDeck: defaultUndeadDeck(15) });

    for (let round = 0; round < 20 && state.status === 'IN_PROGRESS'; round++) {
      const p = chooseAiAction(state, 'player', state.rngState);
      const en = chooseAiAction(state, 'enemy', p.nextRngState);
      const { nextState, events } = resolveRound(state, p.action, en.action, en.nextRngState);

      // rngState is an internal engine-continuity value with no visible effect on the board - it's
      // not reconstructable from the event log by design, so it's excluded from this comparison.
      const replayed = replayUpTo(state, events, events.length - 1);
      expect({ ...replayed, rngState: 0 }).toEqual({ ...nextState, rngState: 0 });

      state = nextState;
      if (state.status !== 'IN_PROGRESS') break;
      state = beginRound(state).nextState;
    }
  });
});
