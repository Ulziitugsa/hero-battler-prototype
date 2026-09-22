import type { GameEvent, GameState, Side } from '../types';
import { LANES } from '../types';
import { chooseAiAction } from '../ai/simpleAI';
import { STARTING_HP } from './constants';
import { createMatch } from './match';
import { beginRound, resolveRound } from './resolveRound';

// Headless AI-vs-AI match runner + invariant checker. Deterministic (seeded) and dependency-free, so a
// large sweep is just a loop. Used by engine/aiSweep.test.ts; a SANITY signal for crashes, loops and
// impossible states - it says nothing rigorous about balance (the AI is simple and both sides share it).

export interface MatchReport {
  winner: Side | 'draw' | 'timeout';
  rounds: number;
  safeguardTrips: number;
  maxHandSize: number;
  /** Engine exceptions (an illegal AI action, a thrown error). Should always be empty. */
  errors: string[];
  /** Broken invariants (card conservation, negative Power, duplicate ids...). Should always be empty. */
  violations: string[];
  eventCounts: Record<string, number>;
  /** cardId -> times played from hand (Heroes placed / Spells cast), both sides. */
  played: Record<string, number>;
  /** cardId (Spells only) -> times it resolved with no effect. */
  fizzled: Record<string, number>;
  /** Card names -> TRIGGER events fired (ability actually ran). */
  triggers: Record<string, number>;
}

const MAX_ROUNDS = 60;

function bump(map: Record<string, number>, key: string, n = 1) {
  map[key] = (map[key] ?? 0) + n;
}

function checkInvariants(state: GameState, startSizes: Record<Side, number>, exiled: Record<Side, number>, where: string, out: string[]) {
  for (const side of ['player', 'enemy'] as Side[]) {
    const p = state[side];
    if (!Number.isFinite(p.hp) || p.hp < 0 || p.hp > STARTING_HP) out.push(`${where}: ${side} hp ${p.hp}`);
    const seenHand = new Set<string>();
    for (const h of p.hand) {
      if (seenHand.has(h.handId)) out.push(`${where}: ${side} duplicate handId ${h.handId}`);
      seenHand.add(h.handId);
    }
    let cards = p.deck.length + p.hand.length + p.graveyard.length;
    for (const lane of LANES) {
      const hero = p.heroZones[lane];
      if (hero) {
        if (!Number.isFinite(hero.power)) out.push(`${where}: ${side} ${lane} Hero Power ${hero.power}`);
        if (!hero.token) cards++;
        if (hero.token && !hero.cardId.startsWith('tok-')) out.push(`${where}: ${side} ${lane} token flag on ${hero.cardId}`);
      }
      if (p.spellZones[lane]) cards++;
    }
    for (const id of [...p.deck, ...p.hand.map((h) => h.cardId), ...p.graveyard]) if (id.startsWith('tok-')) out.push(`${where}: ${side} token ${id} in deck/hand/graveyard`);
    if (cards !== startSizes[side] - exiled[side]) out.push(`${where}: ${side} card count ${cards} != ${startSizes[side]} - ${exiled[side]} exiled`);
    if (p.barrier !== undefined) out.push(`${where}: ${side} barrier survived a round`);
  }
}

export function simulateMatch(seed: number, playerDeck: string[], enemyDeck: string[]): MatchReport {
  const report: MatchReport = { winner: 'timeout', rounds: 0, safeguardTrips: 0, maxHandSize: 0, errors: [], violations: [], eventCounts: {}, played: {}, fizzled: {}, triggers: {} };
  const startSizes: Record<Side, number> = { player: playerDeck.length, enemy: enemyDeck.length };
  const exiled: Record<Side, number> = { player: 0, enemy: 0 };

  const record = (events: GameEvent[]) => {
    for (const e of events) {
      bump(report.eventCounts, e.type);
      if (e.type === 'SAFEGUARD_TRIPPED') report.safeguardTrips++;
      if (e.type === 'EXILED') exiled[e.side]++;
      if (e.type === 'TRIGGER') bump(report.triggers, e.sourceName);
      if (e.type === 'REVEAL') for (const pl of e.placements) bump(report.played, pl.cardId);
      if (e.type === 'SPELL_RESOLVED') {
        bump(report.played, e.cardId);
        if (e.fizzled) bump(report.fizzled, e.cardId);
      }
    }
  };
  const trackHands = (s: GameState) => {
    report.maxHandSize = Math.max(report.maxHandSize, s.player.hand.length, s.enemy.hand.length);
  };

  try {
    let { state, events } = createMatch({ seed, playerDeck, enemyDeck });
    record(events);
    trackHands(state);
    while (state.status === 'IN_PROGRESS' && report.rounds < MAX_ROUNDS) {
      const p = chooseAiAction(state, 'player', state.rngState);
      const e = chooseAiAction(state, 'enemy', p.nextRngState);
      const result = resolveRound(state, p.action, e.action, e.nextRngState);
      record(result.events);
      state = result.nextState;
      report.rounds++;
      checkInvariants(state, startSizes, exiled, `round ${report.rounds}`, report.violations);
      if (report.violations.length > 0) break;
      if (state.status !== 'IN_PROGRESS') break;
      const begun = beginRound(state);
      record(begun.events);
      state = begun.nextState;
      trackHands(state);
    }
    report.winner = state.status === 'PLAYER_WIN' ? 'player' : state.status === 'ENEMY_WIN' ? 'enemy' : state.status === 'DRAW' ? 'draw' : 'timeout';
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
  }
  return report;
}
