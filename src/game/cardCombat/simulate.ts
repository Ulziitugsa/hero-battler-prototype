import type { GameEvent, GameState } from '../types/index.js';
import { beginCardRound, createCardMatch, resolveCardRound, type CardMatchSetup } from './engine.js';
import { chooseCardAiAction } from './ai.js';

// AI-vs-AI matches on the PRODUCTION card resolver and the production card AI, driven exactly the way GamePage drives
// a battle (AI picks for both sides from the same seeded stream, then resolveCardRound, then beginCardRound). Used by
// the Campaign / Ranked re-simulation (scripts/simulate-modes.mjs) and by tests. Deterministic: same setup, same result.

export interface AutoMatchResult {
  status: GameState['status'];
  rounds: number;
  startingHp: { player: number; enemy: number };
  finalHp: { player: number; enemy: number };
  endReason: 'hp' | 'exhausted' | 'round-cap' | undefined;
  /** The whole match's event log, when asked for (`keepEvents`). */
  events?: GameEvent[];
  /** The final state, when events were kept. */
  state?: GameState;
}

export function playCardAiMatch(setup: CardMatchSetup, options: { keepEvents?: boolean } = {}): AutoMatchResult {
  const built = createCardMatch(setup);
  let state = built.nextState;
  const log: GameEvent[] | undefined = options.keepEvents ? [...built.events] : undefined;
  const startingHp = { player: state.player.hp, enemy: state.enemy.hp };
  while (state.status === 'IN_PROGRESS') {
    const p = chooseCardAiAction(state, 'player', state.rngState);
    const e = chooseCardAiAction(state, 'enemy', p.nextRngState);
    const resolved = resolveCardRound(state, p.action, e.action, e.nextRngState);
    log?.push(...resolved.events);
    state = resolved.nextState;
    if (state.status !== 'IN_PROGRESS') break;
    const begun = beginCardRound(state);
    log?.push(...begun.events);
    state = begun.nextState;
  }
  const result: AutoMatchResult = { status: state.status, rounds: state.round, startingHp, finalHp: { player: Math.max(0, state.player.hp), enemy: Math.max(0, state.enemy.hp) }, endReason: state.cardCombat?.endReason };
  return log ? { ...result, events: log, state } : result;
}

export interface SeriesResult {
  games: number;
  /** Share of games the `player` side won; draws count half. */
  winShare: number;
  wins: number;
  losses: number;
  draws: number;
  medianRounds: number;
  p90Rounds: number;
  /** Games that ended any way other than a player at 0 HP (exhausted board or round cap). */
  stalls: number;
  startingHp: { player: number; enemy: number };
  /** Mean HP the player kept in the games they won, as a share of their Starting HP. */
  meanWinHpShare: number;
}

const percentile = (sorted: number[], p: number) => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]);

/** `games` matches of `setup` with seeds seed, seed+1, ... The player side always plays `playerDeck`. */
export function runCardSeries(setup: Omit<CardMatchSetup, 'seed'>, games: number, seed: number): SeriesResult {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let stalls = 0;
  let winHp = 0;
  const rounds: number[] = [];
  let startingHp = { player: 0, enemy: 0 };
  for (let i = 0; i < games; i++) {
    const r = playCardAiMatch({ ...setup, seed: (seed + i * 7919) >>> 0 });
    startingHp = r.startingHp;
    rounds.push(r.rounds);
    if (r.status === 'PLAYER_WIN') {
      wins += 1;
      winHp += r.finalHp.player / Math.max(1, r.startingHp.player);
    } else if (r.status === 'ENEMY_WIN') losses += 1;
    else draws += 1;
    if (r.endReason && r.endReason !== 'hp') stalls += 1;
  }
  rounds.sort((a, b) => a - b);
  return { games, winShare: (wins + draws / 2) / games, wins, losses, draws, medianRounds: percentile(rounds, 0.5), p90Rounds: percentile(rounds, 0.9), stalls, startingHp, meanWinHpShare: wins ? winHp / wins : 0 };
}
