import { currentAccessToken, supabase } from './supabaseClient';
import { generateRoomCode } from './roomCode';
import type { CreateMatchResponse, DeckSnapshot, FriendlyRoom, MatchViewResponse, RoundOutcome } from './friendlyTypes';

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await currentAccessToken();
  const res = await fetch(path, {
    ...init,
    signal: AbortSignal.timeout(30000),
    cache: 'no-store',
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const body = await res.json().catch(() => { throw new Error('Online battle service is unavailable. Please try again shortly.'); });
  if (!res.ok) throw new Error(body.error ?? `Request to ${path} failed (${res.status})`);
  return body as T;
}

const MAX_CODE_ATTEMPTS = 5;

/** Retries on a room-code unique-violation - collisions are rare enough at this scale that a client-side retry is fine. */
export async function createRoom(displayName: string, deck: DeckSnapshot): Promise<FriendlyRoom> {
  await currentAccessToken(); // ensures the anonymous session exists before the RPC call
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    const { data, error } = await supabase().rpc('create_room', { p_code: code, p_host_display_name: displayName, p_host_deck: deck });
    if (!error) return data as FriendlyRoom;
    lastError = error;
    if (!error.message.includes('duplicate key')) break;
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to create room');
}

export async function joinRoom(code: string, displayName: string, deck: DeckSnapshot): Promise<FriendlyRoom> {
  await currentAccessToken();
  const { data, error } = await supabase().rpc('join_room_by_code', { p_code: code.trim().toUpperCase(), p_guest_display_name: displayName, p_guest_deck: deck });
  if (error) throw new Error(error.message);
  return data as FriendlyRoom;
}

export async function setReady(roomId: string, ready: boolean): Promise<FriendlyRoom> {
  const { data, error } = await supabase().rpc('set_ready', { p_room_id: roomId, p_ready: ready });
  if (error) throw new Error(error.message);
  return data as FriendlyRoom;
}

export async function requestRematch(roomId: string, wants: boolean): Promise<FriendlyRoom> {
  const { data, error } = await supabase().rpc('request_rematch', { p_room_id: roomId, p_wants: wants });
  if (error) throw new Error(error.message);
  return data as FriendlyRoom;
}

export async function leaveRoom(roomId: string): Promise<void> {
  const { error } = await supabase().rpc('leave_room', { p_room_id: roomId });
  if (error) throw new Error(error.message);
}

/** RLS restricts this to a room the caller actually belongs to - used to restore state after a refresh. */
export async function fetchRoom(roomId: string): Promise<FriendlyRoom> {
  const { data, error } = await supabase().from('friendly_rooms').select('*').eq('id', roomId).single();
  if (error || !data) throw new Error(error?.message ?? 'Room not found');
  return data as FriendlyRoom;
}

export function createMatch(roomId: string): Promise<CreateMatchResponse> {
  return callApi<CreateMatchResponse>('/api/create-match', { method: 'POST', body: JSON.stringify({ roomId }) });
}

export function submitAction(matchId: string, roundNumber: number, plays: unknown[]): Promise<RoundOutcome> {
  return callApi<RoundOutcome>('/api/submit-action', { method: 'POST', body: JSON.stringify({ matchId, roundNumber, plays }) });
}

export function recoverResolve(matchId: string): Promise<RoundOutcome> {
  return callApi<RoundOutcome>('/api/resolve-round', { method: 'POST', body: JSON.stringify({ matchId }) });
}

export function fetchMyMatchView(matchId: string): Promise<MatchViewResponse> {
  return callApi<MatchViewResponse>(`/api/match-view?matchId=${encodeURIComponent(matchId)}`, { method: 'GET' });
}

export function subscribeToRoom(roomId: string, onChange: (room: FriendlyRoom) => void): () => void {
  const channel = supabase()
    .channel(`friendly-room-${roomId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friendly_rooms', filter: `id=eq.${roomId}` }, (payload) => {
      onChange(payload.new as FriendlyRoom);
    })
    .subscribe();
  return () => {
    supabase().removeChannel(channel);
  };
}

export function subscribeToPing(matchId: string, onPing: () => void): () => void {
  const channel = supabase()
    .channel(`friendly-match-ping-${matchId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friendly_match_pings', filter: `match_id=eq.${matchId}` }, () => {
      onPing();
    })
    .subscribe();
  return () => {
    supabase().removeChannel(channel);
  };
}
