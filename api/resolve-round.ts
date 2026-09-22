import type { ApiRequest, ApiResponse } from './_lib/http';
import { HttpError, withErrorHandling } from './_lib/http';
import { authenticateCaller, canonicalSideFromRoom } from './_lib/auth';
import { loadRoomForMatch } from './_lib/matchAccess';
import { resolveRoundInternal } from './_lib/resolveRoundInternal';
import { supabaseAdmin } from './_lib/supabaseAdmin';

/**
 * Idempotent recovery/retry endpoint - NOT part of the normal submit flow (see api/submit-action.ts,
 * which resolves inline). Harmless to call speculatively (after a realtime ping, or a client-side "did I
 * miss it" timeout): it re-derives the match's current round from the row itself and shares the exact
 * same claim/validate/resolve/persist logic, so it can only ever no-op or catch up a genuinely stuck
 * resolve (a prior resolver that crashed after claiming the round) - never double-resolve.
 */
export default withErrorHandling(async (req: ApiRequest, res: ApiResponse) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const { uid } = await authenticateCaller(req);
  const body = (req.body ?? {}) as { matchId?: string };
  if (!body.matchId) throw new HttpError(400, 'matchId is required');

  const room = await loadRoomForMatch(body.matchId);
  const side = canonicalSideFromRoom(room, uid);

  const { data: current, error } = await supabaseAdmin().from('friendly_matches').select('round_number').eq('id', body.matchId).single();
  if (error || !current) throw new HttpError(404, 'Match not found');

  const outcome = await resolveRoundInternal(body.matchId, current.round_number);
  if (outcome.kind === 'not_ready') {
    res.status(200).json({ status: 'waiting' });
    return;
  }

  res.status(200).json({
    status: 'resolved',
    roundNumber: outcome.view.roundNumber,
    matchStatus: outcome.view.matchStatus,
    winner: outcome.view.winner,
    view: side === 'player' ? outcome.view.hostView : outcome.view.guestView,
    events: side === 'player' ? outcome.view.hostEvents : outcome.view.guestEvents,
  });
});
