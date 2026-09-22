import type { ApiRequest, ApiResponse } from './_lib/http';
import { HttpError, withErrorHandling } from './_lib/http';
import { authenticateCaller, canonicalSideFromRoom } from './_lib/auth';
import { loadRoomForMatch } from './_lib/matchAccess';
import { supabaseAdmin } from './_lib/supabaseAdmin';

/**
 * Used for: picking up the OTHER client's result after a realtime ping, and reconnect-after-refresh.
 * Always returns only the caller's own oriented+redacted view - friendly_matches itself is never exposed.
 */
export default withErrorHandling(async (req: ApiRequest, res: ApiResponse) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');

  const { uid } = await authenticateCaller(req);
  const matchIdParam = req.query.matchId;
  const matchId = Array.isArray(matchIdParam) ? matchIdParam[0] : matchIdParam;
  if (!matchId) throw new HttpError(400, 'matchId is required');

  const room = await loadRoomForMatch(matchId);
  const side = canonicalSideFromRoom(room, uid);

  const { data: match, error } = await supabaseAdmin().from('friendly_matches').select('*').eq('id', matchId).single();
  if (error || !match) throw new HttpError(404, 'Match not found');

  res.status(200).json({
    matchId: match.id,
    roundNumber: match.round_number,
    matchStatus: match.status === 'COMPLETE' ? 'COMPLETE' : 'AWAITING_ACTIONS',
    winner: match.winner,
    actionSubmitted: side === 'player' ? match.player_action_round === match.round_number : match.enemy_action_round === match.round_number,
    view: side === 'player' ? match.host_view : match.guest_view,
    events: side === 'player' ? match.last_events_for_host : match.last_events_for_guest,
  });
});
