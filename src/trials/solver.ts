import type { DeployPlay, GameState, LaneId, PlayerAction } from '../game/types';
import { getCombatCard } from '../game/cardCombat/cards';
import { beginCardRound, resolveCardRound, validateCardDeployment } from '../game/cardCombat/engine';
import { chooseCardAiAction } from '../game/cardCombat/ai';

// Arcane Trials: exhaustive search over a trial's real decision space. Every legal deployment the player could make in
// every round is played through the production resolver, with the production AI answering each one exactly as the
// battle screen asks it to (chooseCardAiAction on the pre-round state, then resolveCardRound with its RNG, then
// beginCardRound). Used by the tests to prove a trial is solvable, that its intended line works, that it can be failed,
// and how many winning lines there are.

const LANES: LaneId[] = ['left', 'center', 'right'];

/** Every legal deployment `side`... the player... can make from this state (the empty play included). */
export function legalDeployments(state: GameState): PlayerAction[] {
  const hand = state.player.hand;
  const out: PlayerAction[] = [];
  const seen = new Set<string>();
  const choose = (i: number, chosen: DeployPlay[]) => {
    if (i === hand.length) {
      const action = { plays: chosen };
      // Identical cards in different hand slots give the same play: count it once.
      const key = chosen
        .map((p) => `${p.cardId}@${p.lane}`)
        .sort()
        .join('|');
      if (seen.has(key)) return;
      if (!validateCardDeployment(state, 'player', action).legal) return;
      seen.add(key);
      out.push(action);
      return;
    }
    choose(i + 1, chosen);
    const card = hand[i];
    const type = getCombatCard(card.cardId).type;
    for (const lane of LANES) {
      if (chosen.some((p) => p.lane === lane && getCombatCard(p.cardId).type === type)) continue;
      choose(i + 1, [...chosen, { handId: card.handId, cardId: card.cardId, lane }]);
    }
  };
  choose(0, []);
  return out;
}

export interface TrialRoundResult {
  state: GameState;
  enemyAction: PlayerAction;
}

/** One round exactly as GamePage plays it: the AI chooses from the pre-round state, the resolver decides, the next round begins. */
export function playTrialRound(state: GameState, action: PlayerAction): TrialRoundResult {
  const ai = chooseCardAiAction(state, 'enemy', state.rngState);
  const resolved = resolveCardRound(state, action, ai.action, ai.nextRngState);
  const next = resolved.nextState.status === 'IN_PROGRESS' ? beginCardRound(resolved.nextState).nextState : resolved.nextState;
  return { state: next, enemyAction: ai.action };
}

export type TrialOutcome = 'success' | 'failure' | 'ongoing';

/** A trial's verdict after a round: won by the round limit, lost (defeat, a draw, or the limit passed), or still going. */
export function trialOutcome(state: GameState, startRound: number, rounds: number): TrialOutcome {
  if (state.status === 'PLAYER_WIN') return 'success';
  if (state.status !== 'IN_PROGRESS') return 'failure';
  return state.round > startRound + rounds - 1 ? 'failure' : 'ongoing';
}

export interface SolveResult {
  /** Every complete line the player could take (one deployment per round until the trial ends). */
  lines: number;
  /** Winning lines, as card@lane lists per round. */
  wins: string[][];
}

export const describePlay = (action: PlayerAction) =>
  action.plays.length === 0
    ? '(nothing)'
    : action.plays
        .map((p) => `${p.cardId}@${p.lane}`)
        .sort()
        .join(' + ');

/** Explores every line of play for `rounds` rounds from `start`. */
export function solveTrial(start: GameState, rounds: number): SolveResult {
  const result: SolveResult = { lines: 0, wins: [] };
  const walk = (state: GameState, path: string[]) => {
    for (const action of legalDeployments(state)) {
      const next = playTrialRound(state, action).state;
      const outcome = trialOutcome(next, start.round, rounds);
      const line = [...path, describePlay(action)];
      if (outcome === 'ongoing') walk(next, line);
      else {
        result.lines += 1;
        if (outcome === 'success') result.wins.push(line);
      }
    }
  };
  walk(start, []);
  return result;
}
