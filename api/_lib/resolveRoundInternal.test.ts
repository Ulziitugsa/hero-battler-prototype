import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState, PlayerState } from '../../src/game/types';

// A small purpose-built fake of just enough of the supabase-js query-builder surface that
// resolveRoundInternal.ts actually calls, so its claim/validate/resolve/persist logic is testable without
// a real Supabase instance (per the plan). Every builder object is itself awaitable (implements `then`),
// matching how supabase-js's real builders work.
interface MatchRow {
  id: string;
  room_id: string;
  seed: number;
  round_number: number;
  status: 'AWAITING_ACTIONS' | 'RESOLVING' | 'COMPLETE';
  resolution_started_at: string | null;
  canonical_state: GameState;
  player_action: unknown;
  player_action_round: number | null;
  enemy_action: unknown;
  enemy_action_round: number | null;
  host_view: unknown;
  guest_view: unknown;
  last_events_for_host: unknown;
  last_events_for_guest: unknown;
  winner: string | null;
}

function parseOrExpr(expr: string): (row: MatchRow) => boolean {
  // Matches exactly the one shape resolveRoundInternal.ts builds:
  // "status.eq.AWAITING_ACTIONS,and(status.eq.RESOLVING,resolution_started_at.lt.<iso>)"
  const [simple, andPart] = expr.split(',and(');
  const [, simpleValue] = simple.split('.eq.');
  const andClause = andPart.replace(/\)$/, '');
  const [, resolvingValue] = andClause.split(',')[0].split('.eq.');
  const thresholdIso = andClause.split('resolution_started_at.lt.')[1];
  return (row) => row.status === simpleValue || (row.status === resolvingValue && !!row.resolution_started_at && row.resolution_started_at < thresholdIso);
}

function makeFakeClient(matches: MatchRow[], pings: { match_id: string; event_seq: number }[]) {
  function selectBuilder<T>(rows: T[], filters: ((r: T) => boolean)[]) {
    const filtered = () => rows.filter((r) => filters.every((f) => f(r)));
    const builder = {
      eq(col: keyof T, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      single: async () => {
        const [found] = filtered();
        return found ? { data: found, error: null } : { data: null, error: { message: 'not found' } };
      },
      then(resolve: (v: { data: T[]; error: null }) => void) {
        resolve({ data: filtered(), error: null });
      },
    };
    return builder;
  }

  function updateBuilder(rows: MatchRow[], patch: Partial<MatchRow>) {
    const filters: ((r: MatchRow) => boolean)[] = [];
    let orPredicate: ((r: MatchRow) => boolean) | null = null;
    const apply = () => {
      const targets = rows.filter((r) => filters.every((f) => f(r)) && (!orPredicate || orPredicate(r)));
      for (const t of targets) Object.assign(t, patch);
      return targets;
    };
    const builder = {
      eq(col: keyof MatchRow, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      or(expr: string) {
        orPredicate = parseOrExpr(expr);
        return builder;
      },
      select() {
        const updated = apply();
        return {
          single: async () => (updated[0] ? { data: updated[0], error: null } : { data: null, error: { message: 'no rows' } }),
          then(resolve: (v: { data: MatchRow[]; error: null }) => void) {
            resolve({ data: updated, error: null });
          },
        };
      },
      then(resolve: (v: { data: MatchRow[]; error: null }) => void) {
        resolve({ data: apply(), error: null });
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      if (table === 'friendly_matches') {
        return {
          select: () => selectBuilder(matches, []),
          update: (patch: Partial<MatchRow>) => updateBuilder(matches, patch),
        };
      }
      if (table === 'friendly_match_pings') {
        return {
          select: () => selectBuilder(pings, []),
          update: (patch: { event_seq: number; updated_at: string }) => {
            const filters: ((r: (typeof pings)[number]) => boolean)[] = [];
            const builder = {
              eq(col: 'match_id', val: string) {
                filters.push((r) => r[col] === val);
                return builder;
              },
              then(resolve: (v: { data: null; error: null }) => void) {
                for (const p of pings.filter((r) => filters.every((f) => f(r)))) Object.assign(p, patch);
                resolve({ data: null, error: null });
              },
            };
            return builder;
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

let fakeMatches: MatchRow[] = [];
let fakePings: { match_id: string; event_seq: number }[] = [];

vi.mock('./supabaseAdmin', () => ({
  supabaseAdmin: () => makeFakeClient(fakeMatches, fakePings),
}));

// Imported AFTER the mock is registered.
const { resolveRoundInternal } = await import('./resolveRoundInternal');

function player(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    side: 'player',
    hp: 20,
    deck: [],
    hand: [],
    graveyard: [],
    heroZones: { left: null, center: null, right: null },
    spellZones: { left: null, center: null, right: null },
    ...overrides,
  };
}

function baseState(): GameState {
  return { round: 1, rngState: 42, player: player(), enemy: { ...player(), side: 'enemy' }, status: 'IN_PROGRESS' };
}

function makeRow(overrides: Partial<MatchRow> = {}): MatchRow {
  return {
    id: 'm1',
    room_id: 'r1',
    seed: 1,
    round_number: 1,
    status: 'AWAITING_ACTIONS',
    resolution_started_at: null,
    canonical_state: baseState(),
    player_action: { plays: [] },
    player_action_round: 1,
    enemy_action: { plays: [] },
    enemy_action_round: 1,
    host_view: null,
    guest_view: null,
    last_events_for_host: null,
    last_events_for_guest: null,
    winner: null,
    ...overrides,
  };
}

beforeEach(() => {
  fakeMatches = [];
  fakePings = [];
});

describe('resolveRoundInternal', () => {
  it('reports not_ready when only one action has been submitted for the round', async () => {
    fakeMatches = [makeRow({ enemy_action: null, enemy_action_round: null })];
    fakePings = [{ match_id: 'm1', event_seq: 0 }];

    const outcome = await resolveRoundInternal('m1', 1);
    expect(outcome.kind).toBe('not_ready');
    expect(fakeMatches[0].status).toBe('AWAITING_ACTIONS'); // reverted, not left claimed
  });

  it('resolves exactly once when both actions are present, advancing the round and bumping the ping', async () => {
    fakeMatches = [makeRow()];
    fakePings = [{ match_id: 'm1', event_seq: 0 }];

    const outcome = await resolveRoundInternal('m1', 1);
    expect(outcome.kind).toBe('resolved');
    if (outcome.kind !== 'resolved') throw new Error('unreachable');
    expect(outcome.view.roundNumber).toBe(2); // resolveRound + beginRound advance from round 1 -> 2
    expect(fakeMatches[0].status).toBe('AWAITING_ACTIONS');
    expect(fakeMatches[0].player_action_round).toBeNull(); // cleared for the next round
    expect(fakePings[0].event_seq).toBe(1);
  });

  it('a concurrent recovery call for the same round does not double-resolve (round only advances once)', async () => {
    fakeMatches = [makeRow()];
    fakePings = [{ match_id: 'm1', event_seq: 0 }];

    const [a, b] = await Promise.all([resolveRoundInternal('m1', 1), resolveRoundInternal('m1', 1)]);
    const resolvedCount = [a, b].filter((o) => o.kind === 'resolved').length;
    expect(resolvedCount).toBeGreaterThanOrEqual(1);
    expect(fakeMatches[0].round_number).toBe(2); // never advances past round 2 from a single pair of actions
    expect(fakePings[0].event_seq).toBe(1); // bumped exactly once
  });

  it('rejects (via HttpError) a request for a round further ahead than the match has reached', async () => {
    fakeMatches = [makeRow({ round_number: 1 })];
    await expect(resolveRoundInternal('m1', 2)).rejects.toThrow('Round not reached yet');
  });

  it('treats a request for an already-passed round as "already resolved" and returns the current result', async () => {
    fakeMatches = [makeRow({ round_number: 3, status: 'COMPLETE', host_view: baseState(), guest_view: baseState(), winner: 'player' })];
    const outcome = await resolveRoundInternal('m1', 2);
    expect(outcome.kind).toBe('resolved');
    if (outcome.kind !== 'resolved') throw new Error('unreachable');
    expect(outcome.view.matchStatus).toBe('COMPLETE');
    expect(outcome.view.winner).toBe('player');
  });

  it('does not reclaim a live (not-yet-timed-out) RESOLVING claim', async () => {
    fakeMatches = [makeRow({ status: 'RESOLVING', resolution_started_at: new Date().toISOString() })];
    const outcome = await resolveRoundInternal('m1', 1);
    expect(outcome.kind).toBe('not_ready');
  });

  it('reclaims a RESOLVING claim older than the recovery timeout and completes it', async () => {
    const staleTimestamp = new Date(Date.now() - 60_000).toISOString();
    fakeMatches = [makeRow({ status: 'RESOLVING', resolution_started_at: staleTimestamp })];
    fakePings = [{ match_id: 'm1', event_seq: 0 }];

    const outcome = await resolveRoundInternal('m1', 1);
    expect(outcome.kind).toBe('resolved');
  });

  it('downgrades an illegal stored action to no plays instead of crashing the match', async () => {
    // An illegal play (a hand card that doesn't exist) should never trust-crash the resolver - it fizzles
    // into "no plays" for that side, keeping the match alive and deterministic (see legalOrEmpty).
    fakeMatches = [makeRow({ player_action: { plays: [{ handId: 'not-real', cardId: 'kng-common-knight', lane: 'left' }] } })];
    fakePings = [{ match_id: 'm1', event_seq: 0 }];

    const outcome = await resolveRoundInternal('m1', 1);
    expect(outcome.kind).toBe('resolved');
    if (outcome.kind !== 'resolved') throw new Error('unreachable');
    expect(outcome.view.hostView.player.heroZones.left).toBeNull(); // the illegal play never landed
  });
});
