import type { GameState, MasteryLoadout, Side } from '../types';
import { STARTING_HP } from './constants';
import { createPlayerState } from './deck';
import { beginRound } from './resolveRound';

export interface MatchSetup {
  seed: number;
  playerDeck: string[];
  enemyDeck: string[];
  startingHp?: number;
  /** Equipped Masteries for this match. Omit for none. */
  masteries?: Partial<Record<Side, MasteryLoadout>>;
  /** Ascension ranks per side (cardId -> rank). Omit for none / Base everywhere. */
  ascensions?: Partial<Record<Side, Record<string, number>>>;
}

/** Builds the round-1 state (shuffled decks, Round 1 start-of-round effects + draw-to-target already applied). */
export function createMatch(setup: MatchSetup): { state: GameState; events: ReturnType<typeof beginRound>['events'] } {
  const hp = setup.startingHp ?? STARTING_HP;
  const { player, nextState: afterPlayer } = createPlayerState('player', setup.playerDeck, hp, setup.seed);
  const { player: enemy, nextState: afterEnemy } = createPlayerState('enemy', setup.enemyDeck, hp, afterPlayer);

  const round1: GameState = {
    round: 1,
    rngState: afterEnemy,
    player,
    enemy,
    status: 'IN_PROGRESS',
    ...(setup.masteries ? { masteries: setup.masteries } : {}),
    ...(setup.ascensions ? { ascensions: setup.ascensions } : {}),
  };

  const { nextState, events } = beginRound(round1);
  return { state: nextState, events };
}
