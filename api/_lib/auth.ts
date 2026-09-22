import type { Side } from '../../src/game/types';
import { HttpError, bearerToken, type ApiRequest } from './http';
import { supabaseAdmin } from './supabaseAdmin';
import type { RoomMembership } from './matchAccess';

/** Verifies the caller's Supabase session token (bearer token from the request) and returns their auth uid. Never trusts a client-supplied id. */
export async function authenticateCaller(req: ApiRequest): Promise<{ uid: string; token: string }> {
  const token = bearerToken(req);
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Invalid session');
  return { uid: data.user.id, token };
}

/**
 * Derives the caller's canonical engine Side (host = 'player', guest = 'enemy') from room membership -
 * NEVER from anything the client claims. Throws if the caller isn't a member of the room.
 */
export function canonicalSideFromRoom(room: Pick<RoomMembership, 'hostId' | 'guestId'>, uid: string): Side {
  if (uid === room.hostId) return 'player';
  if (uid === room.guestId) return 'enemy';
  throw new HttpError(403, 'Not a member of this room');
}
