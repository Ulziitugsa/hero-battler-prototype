import type { GameEvent, GameState, PlayerAction, Side } from '../../src/game/types';
import { beginRound, resolveRound, validateDeployment } from '../../src/game/engine/resolveRound';
import { orientEventsForViewer, orientStateForViewer } from '../../src/game/engine/perspective';
import { HttpError } from './http';
import { supabaseAdmin } from './supabaseAdmin';
import { isActionShape } from './actionShape';

/** A claimed-but-unfinished resolve older than this is assumed crashed and safe to reclaim (see plan: "Recoverable resolving-claim"). */
const RESOLVING_RECOVERY_TIMEOUT_MS = 20_000;

export interface ResolvedRoundView {
  matchId: string;
  roundNumber: number;
  matchStatus: 'AWAITING_ACTIONS' | 'COMPLETE';
  hostView: GameState;
  guestView: GameState;
  hostEvents: GameEvent[];
  guestEvents: GameEvent[];
  winner: 'player' | 'enemy' | 'draw' | null;
}

export type ResolveOutcome = { kind: 'not_ready' } | { kind: 'resolved'; view: ResolvedRoundView };

interface MatchRow {
  id: string;
  room_id: string;
  seed: number;
  round_number: number;
  status: 'AWAITING_ACTIONS' | 'RESOLVING' | 'COMPLETE';
  canonical_state: GameState;
  player_action: PlayerAction | null;
  player_action_round: number | null;
  enemy_action: PlayerAction | null;
  enemy_action_round: number | null;
  host_view: GameState | null;
  guest_view: GameState | null;
  last_events_for_host: GameEvent[] | null;
  last_events_for_guest: GameEvent[] | null;
  winner: 'player' | 'enemy' | 'draw' | null;
}

function viewFromRow(row: MatchRow): ResolvedRoundView {
  return {
    matchId: row.id,
    roundNumber: row.round_number,
    matchStatus: row.status === 'COMPLETE' ? 'COMPLETE' : 'AWAITING_ACTIONS',
    hostView: row.host_view as GameState,
    guestView: row.guest_view as GameState,
    hostEvents: (row.last_events_for_host as GameEvent[]) ?? [],
    guestEvents: (row.last_events_for_guest as GameEvent[]) ?? [],
    winner: row.winner,
  };
}

/** Only ever safe to use when an action FAILED validation - keeps the match alive/deterministic instead of wedging it. */
const NO_PLAYS: PlayerAction = { plays: [] };

function legalOrEmpty(state: GameState, side: Side, action: PlayerAction | null): PlayerAction {
  if (!isActionShape(action)) return NO_PLAYS;
  return validateDeployment(state, side, action).legal ? action : NO_PLAYS;
}

/**
 * The single authoritative round resolver, shared by api/submit-action.ts (the normal inline path) and
 * api/resolve-round.ts (the idempotent crash-recovery path) - see the plan's "Submission and resolution
 * are one server round-trip" and "Recoverable resolving-claim" sections. Never trusts a caller's claimed
 * action set or game state: everything is re-read from the DB and re-validated with validateDeployment.
 */
export async function resolveRoundInternal(matchId: string, expectedRound: number): Promise<ResolveOutcome> {
  const client = supabaseAdmin();

  const { data: current, error: readError } = await client.from('friendly_matches').select('*').eq('id', matchId).single();
  if (readError || !current) throw new HttpError(404, 'Match not found');
  const currentRow = current as MatchRow;

  if (currentRow.round_number > expectedRound || currentRow.status === 'COMPLETE') {
    // Someone else already fully resolved this (or a later) round - report where things stand now.
    return { kind: 'resolved', view: viewFromRow(currentRow) };
  }
  if (currentRow.round_number < expectedRound) {
    throw new HttpError(409, 'Round not reached yet');
  }

  const timeoutThreshold = new Date(Date.now() - RESOLVING_RECOVERY_TIMEOUT_MS).toISOString();
  const { data: claimed, error: claimError } = await client
    .from('friendly_matches')
    .update({ status: 'RESOLVING', resolution_started_at: new Date().toISOString() })
    .eq('id', matchId)
    .eq('round_number', expectedRound)
    .or(`status.eq.AWAITING_ACTIONS,and(status.eq.RESOLVING,resolution_started_at.lt.${timeoutThreshold})`)
    .select('*');
  if (claimError) throw new HttpError(500, claimError.message);
  if (!claimed || claimed.length === 0) {
    // Another request holds a live (non-timed-out) claim - it'll finish shortly, or a later retry will.
    return { kind: 'not_ready' };
  }
  const row = claimed[0] as MatchRow;

  const bothPresent = row.player_action_round === expectedRound && row.enemy_action_round === expectedRound;
  if (!bothPresent) {
    // Shouldn't happen via the normal submit-action path, but defends api/resolve-round's speculative
    // recovery calls against reclaiming a round that only has one action so far.
    await client
      .from('friendly_matches')
      .update({ status: 'AWAITING_ACTIONS', resolution_started_at: null })
      .eq('id', matchId)
      .eq('round_number', expectedRound)
      .eq('status', 'RESOLVING');
    return { kind: 'not_ready' };
  }

  const canonicalState = row.canonical_state;
  const playerAction = legalOrEmpty(canonicalState, 'player', row.player_action);
  const enemyAction = legalOrEmpty(canonicalState, 'enemy', row.enemy_action);

  const resolved = resolveRound(canonicalState, playerAction, enemyAction, row.seed);
  let finalState = resolved.nextState;
  let events = resolved.events;
  if (finalState.status === 'IN_PROGRESS') {
    const begun = beginRound(finalState);
    finalState = begun.nextState;
    events = [...events, ...begun.events];
  }

  const matchComplete = finalState.status !== 'IN_PROGRESS';
  const winner: 'player' | 'enemy' | 'draw' | null = finalState.status === 'PLAYER_WIN' ? 'player' : finalState.status === 'ENEMY_WIN' ? 'enemy' : finalState.status === 'DRAW' ? 'draw' : null;

  const hostView = orientStateForViewer(finalState, 'player');
  const guestView = orientStateForViewer(finalState, 'enemy');
  const hostEvents = orientEventsForViewer(events, 'player');
  const guestEvents = orientEventsForViewer(events, 'enemy');

  const { data: persisted, error: persistError } = await client
    .from('friendly_matches')
    .update({
      status: matchComplete ? 'COMPLETE' : 'AWAITING_ACTIONS',
      resolution_started_at: null,
      round_number: finalState.round,
      canonical_state: finalState,
      player_action: null,
      player_action_round: null,
      enemy_action: null,
      enemy_action_round: null,
      host_view: hostView,
      guest_view: guestView,
      last_events_for_host: hostEvents,
      last_events_for_guest: guestEvents,
      winner,
      completed_at: matchComplete ? new Date().toISOString() : null,
    })
    .eq('id', matchId)
    .select('*')
    .single();
  if (persistError || !persisted) throw new HttpError(500, persistError?.message ?? 'Failed to persist round result');

  const { data: ping } = await client.from('friendly_match_pings').select('event_seq').eq('match_id', matchId).single();
  await client
    .from('friendly_match_pings')
    .update({ event_seq: (ping?.event_seq ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq('match_id', matchId);

  return { kind: 'resolved', view: viewFromRow(persisted as MatchRow) };
}
