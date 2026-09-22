import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../cards';
import { PLAYTEST_ROSTER } from '../cards/roster';
import { ARCHETYPE_DECKS } from '../cards/archetypeDecks';
import { STARTER_DECKS } from '../cards/starterDecks';
import { simulateMatch, type MatchReport } from './simulate';

// AI-vs-AI stability sweep over the expanded card pool. This is a SANITY signal - crashes, infinite
// loops, safeguard trips, impossible board states, runaway hands, cards that never do anything - and is
// NOT evidence of balance: both seats use the same simple heuristic AI. Set SWEEP_SEEDS=200 for a big run
// (prints the full matrix); the default keeps the suite fast.

const SEEDS = Number(process.env.SWEEP_SEEDS ?? 12);
const DECKS: Record<string, string[]> = { ...ARCHETYPE_DECKS, kingdom: STARTER_DECKS.kingdom, undead: STARTER_DECKS.undead, infernal: STARTER_DECKS.infernal };
const NAMES = Object.keys(DECKS);

interface Cell {
  wins: number;
  losses: number;
  draws: number;
  timeouts: number;
}

function runSweep() {
  const matrix: Record<string, Record<string, Cell>> = {};
  const total: MatchReport[] = [];
  for (const a of NAMES) {
    matrix[a] = {};
    for (const b of NAMES) {
      const cell: Cell = { wins: 0, losses: 0, draws: 0, timeouts: 0 };
      for (let i = 0; i < SEEDS; i++) {
        const r = simulateMatch(1000 + i * 7919 + NAMES.indexOf(a) * 131 + NAMES.indexOf(b), DECKS[a], DECKS[b]);
        total.push(r);
        if (r.winner === 'player') cell.wins++;
        else if (r.winner === 'enemy') cell.losses++;
        else if (r.winner === 'draw') cell.draws++;
        else cell.timeouts++;
      }
      matrix[a][b] = cell;
    }
  }
  return { matrix, total };
}

const sweep = runSweep();

describe('AI-vs-AI sweep (sanity, not balance)', () => {
  it('runs every deck against every deck (both seats) without a crash, illegal action or broken invariant', () => {
    const errors = sweep.total.flatMap((r) => r.errors);
    const violations = sweep.total.flatMap((r) => r.violations);
    expect(errors).toEqual([]);
    expect(violations).toEqual([]);
  });

  it('never trips the death-chain safeguard', () => {
    expect(sweep.total.reduce((n, r) => n + r.safeguardTrips, 0)).toBe(0);
  });

  it('every match finishes (no infinite games) and hands stay sane', () => {
    expect(sweep.total.filter((r) => r.winner === 'timeout').length).toBe(0);
    expect(Math.max(...sweep.total.map((r) => r.maxHandSize))).toBeLessThanOrEqual(8);
  });

  it('every expansion mechanic actually fires somewhere in the sweep', () => {
    const totals: Record<string, number> = {};
    for (const r of sweep.total) for (const [k, v] of Object.entries(r.eventCounts)) totals[k] = (totals[k] ?? 0) + v;
    for (const type of ['TOKEN_SUMMONED', 'DAMAGE_PREVENTED', 'COMBAT_STALLED', 'IMMUNITY_BLOCKED', 'SILENCED', 'SHIELD_CONSUMED', 'OVERFLOW_DAMAGE']) {
      expect(totals[type] ?? 0, type).toBeGreaterThan(0);
    }
  });

  it('every deck (as a whole) wins some and loses some - no auto-win, no dead archetype', () => {
    for (const a of NAMES) {
      let wins = 0;
      let games = 0;
      for (const b of NAMES) {
        if (a === b) continue;
        const c = matrix(a, b);
        wins += c.wins + (matrix(b, a).losses);
        games += SEEDS * 2;
      }
      const rate = wins / games;
      expect(rate, `${a} win rate ${(rate * 100).toFixed(0)}%`).toBeGreaterThan(0.08);
      expect(rate, `${a} win rate ${(rate * 100).toFixed(0)}%`).toBeLessThan(0.92);
    }
  });

  it('every roster card is played at least once across the sweep decks or is explicitly outside every reference deck', () => {
    const inDeck = new Set(Object.values(DECKS).flat());
    const played = new Set(sweep.total.flatMap((r) => Object.keys(r.played)));
    for (const id of inDeck) expect(played.has(id), `${id} was never played`).toBe(true);
    // Cards outside every reference deck are fine, but list them so the omission is a decision, not an accident.
    const outside = PLAYTEST_ROSTER.filter((id) => !inDeck.has(id));
    expect(outside.every((id) => ALL_CARDS.some((c) => c.id === id))).toBe(true);
  });

  it('is deterministic: the same seed and decks give the identical report', () => {
    const a = simulateMatch(4242, DECKS.mage, DECKS.beast);
    const b = simulateMatch(4242, DECKS.mage, DECKS.beast);
    expect(b).toEqual(a);
  });

  if (process.env.SWEEP_SEEDS) {
    it('prints the matrix', () => {
      const rows = NAMES.map((a) => `${a.padEnd(12)} ${NAMES.map((b) => `${Math.round((matrix(a, b).wins / SEEDS) * 100)}%`.padStart(5)).join(' ')}`);
      const played: Record<string, number> = {};
      const fizzled: Record<string, number> = {};
      for (const r of sweep.total) {
        for (const [k, v] of Object.entries(r.played)) played[k] = (played[k] ?? 0) + v;
        for (const [k, v] of Object.entries(r.fizzled)) fizzled[k] = (fizzled[k] ?? 0) + v;
      }
      const fizzleRates = Object.keys(fizzled)
        .map((k) => `${k}: ${Math.round((fizzled[k] / played[k]) * 100)}% fizzled of ${played[k]}`)
        .join('\n');
      const avgRounds = sweep.total.reduce((n, r) => n + r.rounds, 0) / sweep.total.length;
      // eslint-disable-next-line no-console
      console.log(`\nMatches: ${sweep.total.length}  avg rounds: ${avgRounds.toFixed(1)}\n${' '.repeat(12)} ${NAMES.map((n) => n.slice(0, 5).padStart(5)).join(' ')}\n${rows.join('\n')}\n\nFizzle rates:\n${fizzleRates}`);
      expect(true).toBe(true);
    });
  }
});

function matrix(a: string, b: string): Cell {
  return sweep.matrix[a][b];
}
