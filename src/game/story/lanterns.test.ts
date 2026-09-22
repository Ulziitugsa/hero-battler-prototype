import { beforeEach, describe, expect, it } from 'vitest';
import { LANTERN_TRIALS, canPlayTrial, completeLanternTrial, loadLanternProgress } from './lanterns';
import { ENCOUNTER_DECKS, campaignEnemyDeck } from '../campaign/encounterDecks';
import { CHAPTER_1 } from '../campaign/chapter1';
import { validateDeck } from '../engine/deckRules';
import { STARTER_DECKS } from '../cards/starterDecks';
import { createMatch } from '../engine/match';
import { chooseAiAction } from '../ai/simpleAI';
import { beginRound, resolveRound } from '../engine/resolveRound';
import { replayUpTo } from '../engine/replay';

beforeEach(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  } });
});

describe('Lanterns story progression', () => {
  it('rejects unknown trials and prevents jumping ahead', () => {
    expect(canPlayTrial('unknown', [])).toBe(false);
    expect(completeLanternTrial(LANTERN_TRIALS[1].id)).toBe(false);
    expect(loadLanternProgress()).toEqual([]);
  });
  it('persists wins in order, allows replays, and never counts a replay twice', () => {
    for (const trial of LANTERN_TRIALS) {
      expect(canPlayTrial(trial.id, loadLanternProgress())).toBe(true);
      expect(completeLanternTrial(trial.id)).toBe(true);
      expect(completeLanternTrial(trial.id)).toBe(true);
    }
    expect(loadLanternProgress()).toEqual(LANTERN_TRIALS.map(t => t.id));
  });
  it('recovers from malformed saved data and reports failed writes', () => {
    localStorage.setItem('embervale:lanterns:v1', '{');
    expect(loadLanternProgress()).toEqual([]);
    localStorage.setItem('embervale:lanterns:v1', '[null, 4, "unknown", "the-unlit-road", "the-unlit-road"]');
    expect(loadLanternProgress()).toEqual(['the-unlit-road']);
    localStorage.setItem = () => { throw new Error('Storage unavailable'); };
    expect(completeLanternTrial(LANTERN_TRIALS[1].id)).toBe(false);
  });
});

describe('Campaign encounter variety', () => {
  it('every new encounter and story deck follows normal deck rules', () => {
    for (const [id, deck] of Object.entries(ENCOUNTER_DECKS)) expect(validateDeck(deck), id).toMatchObject({ valid: true });
    for (const trial of LANTERN_TRIALS) expect(validateDeck([...trial.deck]), trial.name).toMatchObject({ valid: true });
  });
  it('covers all chapter battles and reserves Vharos for the boss', () => {
    for (const node of CHAPTER_1.nodes.filter(n => n.encounter)) {
      const deck = campaignEnemyDeck(node.id);
      expect(deck, node.id).toBeDefined();
      expect(deck!.includes('und-vharos'), node.id).toBe(node.type === 'boss');
    }
    expect(new Set(Object.values(ENCOUNTER_DECKS).map(d => [...d].sort().join(','))).size).toBe(8);
  });
  it('plays every encounter with matching engine and animation replay state', () => {
    for (const deck of Object.values(ENCOUNTER_DECKS)) {
      let { state } = createMatch({ seed: 8341, playerDeck: STARTER_DECKS.kingdom, enemyDeck: deck });
      for (let round = 0; round < 40 && state.status === 'IN_PROGRESS'; round++) {
        const player = chooseAiAction(state, 'player', state.rngState);
        const enemy = chooseAiAction(state, 'enemy', player.nextRngState);
        const resolved = resolveRound(state, player.action, enemy.action, enemy.nextRngState);
        expect(resolved.events.some(event => event.type === 'SAFEGUARD_TRIPPED')).toBe(false);
        const replay = replayUpTo(state, resolved.events, resolved.events.length - 1);
        expect({ ...replay, rngState: 0 }).toEqual({ ...resolved.nextState, rngState: 0 });
        state = resolved.nextState;
        if (state.status === 'IN_PROGRESS') state = beginRound(state).nextState;
      }
      expect(state.status).not.toBe('IN_PROGRESS');
    }
  });
});
