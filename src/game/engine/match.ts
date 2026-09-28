import type { GameState, MasteryLoadout, Side } from '../types/index.js';
import { STARTING_HP } from './constants.js';
import { createPlayerState } from './deck.js';
import { beginRound } from './resolveRound.js';
import { getCard } from '../cards/index.js';
import { commanderHpForRoster } from '../combatV2/model.js';

export interface MatchSetup {
  seed: number;
  playerDeck: string[];
  enemyDeck: string[];
  startingHp?: number;
  /** Equipped Masteries for this match. Omit for none. */
  masteries?: Partial<Record<Side, MasteryLoadout>>;
  /** Ascension ranks per side (cardId -> rank). Omit for none / Base everywhere. */
  ascensions?: Partial<Record<Side, Record<string, number>>>;
  /** Hero Levels per side (cardId -> level). Omit for none / Level 1 everywhere. */
  heroLevels?: Partial<Record<Side, Record<string, number>>>;
  combatModel?: 'legacy' | 'v2';
}

/** Builds the round-1 state (shuffled decks, Round 1 start-of-round effects + draw-to-target already applied). */
export function createMatch(setup: MatchSetup): { state: GameState; events: ReturnType<typeof beginRound>['events'] } {
  const playerMaxHp = setup.combatModel === 'v2'
    ? commanderHpForRoster(setup.playerDeck.filter(id => getCard(id).type === 'hero'), setup.heroLevels?.player, setup.ascensions?.player)
    : STARTING_HP;
  const enemyMaxHp = setup.combatModel === 'v2'
    ? commanderHpForRoster(setup.enemyDeck.filter(id => getCard(id).type === 'hero'), setup.heroLevels?.enemy, setup.ascensions?.enemy)
    : STARTING_HP;
  const playerHp = setup.startingHp ?? playerMaxHp;
  const enemyHp = setup.combatModel === 'v2' ? enemyMaxHp : setup.startingHp ?? enemyMaxHp;
  const { player, nextState: afterPlayer } = createPlayerState('player', setup.playerDeck, playerHp, setup.seed);
  const { player: enemy, nextState: afterEnemy } = createPlayerState('enemy', setup.enemyDeck, enemyHp, afterPlayer);
  if (setup.combatModel === 'v2') {
    player.maxHp = playerMaxHp;
    enemy.maxHp = enemyMaxHp;
  }

  const round1: GameState = {
    round: 1,
    rngState: afterEnemy,
    player,
    enemy,
    status: 'IN_PROGRESS',
    ...(setup.combatModel ? { combatModel: setup.combatModel } : {}),
    ...(setup.masteries ? { masteries: setup.masteries } : {}),
    ...(setup.ascensions ? { ascensions: setup.ascensions } : {}),
    ...(setup.heroLevels ? { heroLevels: setup.heroLevels } : {}),
  };

  const { nextState, events } = beginRound(round1);
  return { state: nextState, events };
}
