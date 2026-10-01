import type { GameEvent, GameState, PlayerAction, Side } from '../game/types';
import type { MatchResolver } from '../game/combat/resolver';

export type RoomStatus = 'WAITING' | 'READY' | 'IN_PROGRESS' | 'COMPLETE' | 'ABANDONED';

export interface DeckSnapshot {
  cardIds: string[];
  /** The combat rules this client plays (combat/resolver.ts PRODUCTION_RULES). The server builds a match only when both
   * players' rules match its own, so two builds never resolve one match differently. Absent on clients before card combat. */
  rules?: MatchResolver;
  /** Legacy fields, never read since card combat: Friendly Battle plays every card at base strength (Mastery I). */
  masteryId?: string;
  masteryRank?: number;
  ascensions?: Record<string, number>;
}

export interface FriendlyRoom {
  id: string;
  code: string;
  status: RoomStatus;
  host_id: string;
  guest_id: string | null;
  host_display_name: string;
  guest_display_name: string | null;
  host_deck: DeckSnapshot | null;
  guest_deck: DeckSnapshot | null;
  host_ready: boolean;
  guest_ready: boolean;
  current_match_id: string | null;
  rematch_host_wants: boolean;
  rematch_guest_wants: boolean;
}

/** What the local browser persists to survive a refresh - see the plan's reconnect design. */
export interface StoredFriendlySession {
  roomId: string;
  matchId: string | null;
  canonicalSide: Side | null;
}

export type RoundOutcome =
  | { status: 'waiting' }
  | { status: 'resolved'; roundNumber: number; matchStatus: 'AWAITING_ACTIONS' | 'COMPLETE'; winner: 'player' | 'enemy' | 'draw' | null; view: GameState; events: GameEvent[] };

export interface MatchViewResponse {
  actionSubmitted?: boolean;
  matchId: string;
  roundNumber: number;
  matchStatus: 'AWAITING_ACTIONS' | 'COMPLETE';
  winner: 'player' | 'enemy' | 'draw' | null;
  view: GameState;
  events: GameEvent[];
}

export type CreateMatchResponse =
  | { status: 'created'; matchId: string; roundNumber: number; view: GameState; events: GameEvent[] }
  /** Another client is actively building the match (within the crash-recovery timeout) - not an error, just not ready yet. */
  | { status: 'building' };

export interface RemoteOpponentController {
  submitAndAwaitRound(playerAction: PlayerAction): Promise<{ kind: 'resolved'; result: { nextState: GameState; events: GameEvent[] } } | { kind: 'opponent-left' }>;
}
