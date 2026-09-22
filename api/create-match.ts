import type { ApiRequest, ApiResponse } from './_lib/http.js';
import { HttpError, withErrorHandling } from './_lib/http.js';
import { authenticateCaller, canonicalSideFromRoom } from './_lib/auth.js';
import { supabaseAdmin } from './_lib/supabaseAdmin.js';
import { createMatch } from '../src/game/engine/match.js';
import { validateDeck } from '../src/game/engine/deckRules.js';
import { makeSeed } from '../src/game/engine/rng.js';
import { orientEventsForViewer, orientStateForViewer } from '../src/game/engine/perspective.js';
import type { Side } from '../src/game/types/index.js';

interface DeckSnapshot {
  cardIds: string[];
  masteryId?: string;
  masteryRank?: number;
  ascensions?: Record<string, number>;
}


/** A claimed-but-unfinished build older than this is assumed crashed and safe to reclaim - same pattern as resolveRoundInternal.ts's RESOLVING timeout. */
const BUILD_RECOVERY_TIMEOUT_MS = 20_000;

/**
 * Builds the match once both players are ready. Deck shuffling needs the engine's JS RNG helpers, which
 * SQL can't run - so unlike the other three RPC-backed room actions, this one step happens here instead
 * of in a Postgres function.
 *
 * Both players' clients normally call this at nearly the same moment (both react to the room flipping
 * READY) - so this has to be a real concurrency-safe claim, not just "idempotent once someone's already
 * finished". An earlier version claimed on `status='IN_PROGRESS' AND current_match_id IS NULL` with no
 * timeout, which can't tell "someone else is still actively building" apart from "a previous attempt
 * crashed and never finished" - both look identical. That let a second concurrent request ALSO win the
 * claim and build a SECOND, separate match for the same room: each player then submitted actions into a
 * different database row the other side never saw, a permanent silent "stuck waiting" with no error.
 * Fixed with the same started_at + timeout pattern as the round-resolution RESOLVING claim.
 */
export default withErrorHandling(async (req: ApiRequest, res: ApiResponse) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const { uid } = await authenticateCaller(req);
  const body = (req.body ?? {}) as { roomId?: string };
  if (!body.roomId) throw new HttpError(400, 'roomId is required');

  const client = supabaseAdmin();
  const { data: room, error: roomError } = await client.from('friendly_rooms').select('host_id, guest_id').eq('id', body.roomId).single();
  if (roomError || !room) throw new HttpError(404, 'Room not found');

  const side = canonicalSideFromRoom({ hostId: room.host_id, guestId: room.guest_id }, uid);

  const buildTimeoutThreshold = new Date(Date.now() - BUILD_RECOVERY_TIMEOUT_MS).toISOString();
  const { data: claimed, error: claimError } = await client
    .from('friendly_rooms')
    .update({ status: 'IN_PROGRESS', match_creation_started_at: new Date().toISOString() })
    .eq('id', body.roomId)
    .or(`status.eq.READY,and(status.eq.IN_PROGRESS,current_match_id.is.null,match_creation_started_at.lt.${buildTimeoutThreshold})`)
    .select('*')
    .single();

  if (claimError || !claimed) {
    // Didn't win the claim - re-read fresh (never trust the pre-claim room row for this check, since the
    // winner may have finished, or still be finishing, in the time it took to get here).
    const { data: current, error: currentError } = await client.from('friendly_rooms').select('current_match_id').eq('id', body.roomId).single();
    if (currentError || !current) throw new HttpError(404, 'Room not found');
    if (current.current_match_id) return respondWithMatchView(res, current.current_match_id, side);
    // Someone else is actively building it (within the timeout) - not an error, just not ready yet. The
    // client should keep waiting (it's already subscribed to this room's realtime updates and will see
    // current_match_id appear once the build finishes).
    res.status(200).json({ status: 'building' });
    return;
  }

  if (!claimed.host_deck || !claimed.guest_deck) throw new HttpError(400, 'Both players must select a deck before Ready');
  const hostDeck = claimed.host_deck as DeckSnapshot;
  const guestDeck = claimed.guest_deck as DeckSnapshot;

  for (const deck of [hostDeck, guestDeck]) {
    if (!Array.isArray(deck.cardIds) || deck.cardIds.some(id => typeof id !== 'string') || !validateDeck(deck.cardIds).valid) {
      await client.from('friendly_rooms').update({ status: 'ABANDONED' }).eq('id', body.roomId);
      throw new HttpError(400, 'A selected deck is invalid. Please create a room with a legal deck.');
    }
  }
  const seed = makeSeed();
  const { state, events } = createMatch({
    seed,
    playerDeck: hostDeck.cardIds,
    enemyDeck: guestDeck.cardIds,
  });

  const hostView = orientStateForViewer(state, 'player');
  const guestView = orientStateForViewer(state, 'enemy');
  const hostEvents = orientEventsForViewer(events, 'player');
  const guestEvents = orientEventsForViewer(events, 'enemy');

  const { data: match, error: matchError } = await client
    .from('friendly_matches')
    .insert({
      room_id: body.roomId,
      seed,
      round_number: state.round,
      status: 'AWAITING_ACTIONS',
      canonical_state: state,
      host_view: hostView,
      guest_view: guestView,
      last_events_for_host: hostEvents,
      last_events_for_guest: guestEvents,
    })
    .select('*')
    .single();
  if (matchError || !match) throw new HttpError(500, matchError?.message ?? 'Failed to create match');

  await client.from('friendly_match_pings').insert({ match_id: match.id, room_id: body.roomId, event_seq: 0 });
  await client.from('friendly_rooms').update({ current_match_id: match.id }).eq('id', body.roomId);

  res.status(200).json({
    status: 'created',
    matchId: match.id,
    roundNumber: match.round_number,
    view: side === 'player' ? hostView : guestView,
    events: side === 'player' ? hostEvents : guestEvents,
  });
});

async function respondWithMatchView(res: ApiResponse, matchId: string, side: Side) {
  const { data: match, error } = await supabaseAdmin().from('friendly_matches').select('*').eq('id', matchId).single();
  if (error || !match) throw new HttpError(404, 'Match not found');
  res.status(200).json({
    status: 'created',
    matchId: match.id,
    roundNumber: match.round_number,
    view: side === 'player' ? match.host_view : match.guest_view,
    events: side === 'player' ? match.last_events_for_host : match.last_events_for_guest,
  });
}
