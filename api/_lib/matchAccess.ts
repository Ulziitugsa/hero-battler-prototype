import { HttpError } from './http';
import { supabaseAdmin } from './supabaseAdmin';

export interface RoomMembership {
  roomId: string;
  hostId: string;
  guestId: string | null;
}

/** friendly_matches has zero client grants, so this always goes through the service-role client. */
export async function loadRoomForMatch(matchId: string): Promise<RoomMembership> {
  const client = supabaseAdmin();
  const { data: match, error: matchError } = await client.from('friendly_matches').select('room_id').eq('id', matchId).single();
  if (matchError || !match) throw new HttpError(404, 'Match not found');

  const { data: room, error: roomError } = await client.from('friendly_rooms').select('host_id, guest_id').eq('id', match.room_id).single();
  if (roomError || !room) throw new HttpError(404, 'Room not found');

  return { roomId: match.room_id, hostId: room.host_id, guestId: room.guest_id };
}
