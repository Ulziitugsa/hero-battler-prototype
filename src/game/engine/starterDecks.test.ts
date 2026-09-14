import { describe, expect, it } from 'vitest';
import { STARTER_DECKS } from '../cards/starterDecks';
import { chooseAiAction } from '../ai/simpleAI';
import { createMatch } from './match';
import { beginRound, resolveRound } from './resolveRound';
import { replayUpTo } from './replay';

// Card Set v0.1 sanity: every starter deck matchup should play out a full AI-vs-AI match without
// crashing, stay deterministic under a fixed seed, and keep the replay reducer in sync with the
// engine's own state - the same guarantees determinism.test.ts/replay.test.ts already hold the
// original prototype decks to, now exercised against the new 30-card roster instead.

const MATCHUPS: [keyof typeof STARTER_DECKS, keyof typeof STARTER_DECKS][] = [
  ['kingdom', 'undead'],
  ['undead', 'infernal'],
  ['infernal', 'kingdom'],
];

function playFullMatch(seed: number, playerDeck: string[], enemyDeck: string[]) {
  let { state } = createMatch({ seed, playerDeck, enemyDeck });
  const allEvents = [];
  for (let round = 0; round < 40 && state.status === 'IN_PROGRESS'; round++) {
    const p = chooseAiAction(state, 'player', state.rngState);
    const e = chooseAiAction(state, 'enemy', p.nextRngState);
    const { nextState, events } = resolveRound(state, p.action, e.action, e.nextRngState);
    allEvents.push(...events);

    const replayed = replayUpTo(state, events, events.length - 1);
    expect({ ...replayed, rngState: 0 }).toEqual({ ...nextState, rngState: 0 });

    state = nextState;
    if (state.status !== 'IN_PROGRESS') break;
    const begun = beginRound(state);
    state = begun.nextState;
    allEvents.push(...begun.events);
  }
  return { state, events: allEvents };
}

describe('Card Set v0.1 starter deck matchups', () => {
  for (const [playerFaction, enemyFaction] of MATCHUPS) {
    it(`${playerFaction} vs ${enemyFaction} plays to completion deterministically`, () => {
      const runA = playFullMatch(4242, STARTER_DECKS[playerFaction], STARTER_DECKS[enemyFaction]);
      const runB = playFullMatch(4242, STARTER_DECKS[playerFaction], STARTER_DECKS[enemyFaction]);
      expect(runB.state).toEqual(runA.state);
      expect(runB.events).toEqual(runA.events);
      expect(runA.events.some((e) => e.type === 'SAFEGUARD_TRIPPED')).toBe(false);
    });
  }
});
