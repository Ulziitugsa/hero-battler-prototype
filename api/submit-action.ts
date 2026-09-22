import type { ApiRequest, ApiResponse } from './_lib/http';
import { HttpError, withErrorHandling } from './_lib/http';
import { authenticateCaller } from './_lib/auth';
import { supabaseAsUser } from './_lib/supabaseAdmin';
import { resolveRoundInternal } from './_lib/resolveRoundInternal';
import type { Side } from '../src/game/types';
import { isActionShape } from './_lib/actionShape';

/**
 * The only endpoint clients call to act each round. Storage and resolution happen in ONE request so
 * there's no second network call for a client to miss - see the plan's "Submission and resolution are
 * one server round-trip" (fixes the failure window where the second action gets stored but nothing ever
 * resolves it). api/resolve-round.ts remains as an idempotent recovery/retry endpoint on the same shared
 * resolveRoundInternal.
 */
export default withErrorHandling(async (req: ApiRequest, res: ApiResponse) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  const { token } = await authenticateCaller(req);
  const body = (req.body ?? {}) as { matchId?: string; roundNumber?: number; plays?: unknown };
  if (typeof body.matchId !== 'string' || typeof body.roundNumber !== 'number' || !Number.isInteger(body.roundNumber) || (body.roundNumber ?? 0) < 1 || !isActionShape({ plays: body.plays })) {
    throw new HttpError(400, 'matchId, roundNumber, plays are required');
  }

  // Called with the CALLER's own token (not the service role) so submit_round_action's auth.uid() checks
  // - and its derivation of which side the caller is - run exactly as they would from the browser.
  const userClient = supabaseAsUser(token);
  const { data, error } = await userClient.rpc('submit_round_action', {
    p_match_id: body.matchId,
    p_round_number: body.roundNumber,
    p_action: { plays: body.plays },
  });
  if (error) throw new HttpError(400, error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new HttpError(500, 'submit_round_action returned no row');

  if (!row.both_present) {
    res.status(200).json({ status: 'waiting' });
    return;
  }

  const outcome = await resolveRoundInternal(body.matchId, body.roundNumber);
  if (outcome.kind === 'not_ready') {
    res.status(200).json({ status: 'waiting' });
    return;
  }

  const side = row.canonical_side as Side;
  res.status(200).json({
    status: 'resolved',
    roundNumber: outcome.view.roundNumber,
    matchStatus: outcome.view.matchStatus,
    winner: outcome.view.winner,
    view: side === 'player' ? outcome.view.hostView : outcome.view.guestView,
    events: side === 'player' ? outcome.view.hostEvents : outcome.view.guestEvents,
  });
});
