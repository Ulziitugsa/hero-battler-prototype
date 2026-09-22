import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameEvent, GameState, PlayerAction, Side } from '../game/types';
import * as friendlyApi from './friendlyApi';
import type { DeckSnapshot, FriendlyRoom, RemoteOpponentController, RoundOutcome, StoredFriendlySession } from './friendlyTypes';

const STORAGE_KEY = 'skyloom:friendlySession';
const PING_TIMEOUT_MS = 3000;

/**
 * Subscribes to the ping channel immediately and returns a promise that resolves the first time it
 * fires, plus a way to cancel/clean up early. Deliberately separate from the wait loop below so a caller
 * can start listening BEFORE doing anything else (see submitAndAwaitRound) - the websocket handshake to
 * establish a Realtime subscription takes real network time, and the one-shot ping event is lost forever
 * if it fires before anyone is listening.
 */
function subscribeToPingOnce(matchId: string): { wait: Promise<void>; cancel: () => void } {
  let done = false;
  let resolveWait: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    resolveWait = resolve;
  });
  const unsubscribe = friendlyApi.subscribeToPing(matchId, () => {
    if (done) return;
    done = true;
    unsubscribe();
    resolveWait();
  });
  return {
    wait,
    cancel: () => {
      if (done) return;
      done = true;
      unsubscribe();
      resolveWait();
    },
  };
}

function loadStoredSession(): StoredFriendlySession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredFriendlySession) : null;
  } catch {
    return null;
  }
}

function saveStoredSession(session: StoredFriendlySession | null): void {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage can throw (private browsing, quota) - losing the ability to reconnect isn't worth crashing over.
  }
}

export type FriendlyPhase = 'IDLE' | 'LOBBY' | 'STARTING' | 'IN_MATCH' | 'ERROR';

export interface UseFriendlyRoomResult {
  phase: FriendlyPhase;
  room: FriendlyRoom | null;
  canonicalSide: Side | null;
  error: string | null;
  createRoom(displayName: string, deck: DeckSnapshot): Promise<void>;
  joinRoom(code: string, displayName: string, deck: DeckSnapshot): Promise<void>;
  setReady(ready: boolean): Promise<void>;
  leave(): Promise<void>;
  requestRematch(wants: boolean): Promise<void>;
  matchId: string | null;
  initialState: GameState | null;
  initialEvents: GameEvent[] | null;
  remoteOpponent: RemoteOpponentController | null;
}

/**
 * Owns Friendly Battle's room/match lifecycle end to end: create/join, the realtime room subscription
 * (ready flags, match start, rematch, abandonment - safe to broadcast in full, see the migration), the
 * ping-triggered match pickup, and localStorage-based reconnect. Everything this hook hands to GamePage
 * (initialState/initialEvents/remoteOpponent) is already server-oriented for this browser's canonical
 * side - GamePage never needs to know whether it's rendering for the host or the guest.
 */
export function useFriendlyRoom(): UseFriendlyRoomResult {
  const [phase, setPhase] = useState<FriendlyPhase>(() => loadStoredSession() ? 'STARTING' : 'IDLE');
  const [room, setRoom] = useState<FriendlyRoom | null>(null);
  const [canonicalSide, setCanonicalSide] = useState<Side | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [initialState, setInitialState] = useState<GameState | null>(null);
  const [initialEvents, setInitialEvents] = useState<GameEvent[] | null>(null);

  const roomRef = useRef<FriendlyRoom | null>(null);
  const roundNumberRef = useRef(1);
  const startingRef = useRef(false);
  const unsubscribeRoomRef = useRef<(() => void) | null>(null);

  const persist = useCallback((roomId: string, side: Side, mId: string | null) => {
    saveStoredSession({ roomId, matchId: mId, canonicalSide: side });
  }, []);

  const applyOutcome = useCallback((outcome: RoundOutcome): { kind: 'resolved'; result: { nextState: GameState; events: GameEvent[] } } | { kind: 'opponent-left' } => {
    if (outcome.status !== 'resolved') throw new Error('applyOutcome called on a non-resolved outcome');
    roundNumberRef.current = outcome.roundNumber;
    return { kind: 'resolved', result: { nextState: outcome.view, events: outcome.events } };
  }, []);

  // A plain function (not a comparison inlined at each call site) so TS can't "narrow away" the
  // ABANDONED case across the awaits in awaitOpponentAction below - roomRef.current is mutated by the
  // room subscription's callback, which TS has no visibility into from within this function body.
  function isRoomAbandoned(): boolean {
    return !roomRef.current || roomRef.current.status === 'ABANDONED';
  }

  // `firstPing`, when given, is a subscription started BEFORE whatever put us in this waiting state (see
  // submitAndAwaitRound) - reused for the first loop iteration instead of subscribing fresh, so a
  // resolve that happens in the brief window before we even knew we'd be waiting is never missed.
  const awaitOpponentAction = useCallback(
    async (mId: string, firstPing?: { wait: Promise<void>; cancel: () => void }): Promise<{ kind: 'resolved'; result: { nextState: GameState; events: GameEvent[] } } | { kind: 'opponent-left' }> => {
      let pending = firstPing;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (isRoomAbandoned()) {
          pending?.cancel();
          return { kind: 'opponent-left' };
        }

        const waiter = pending ?? subscribeToPingOnce(mId);
        pending = undefined;
        const pinged = await Promise.race([waiter.wait.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PING_TIMEOUT_MS))]);
        waiter.cancel();

        if (isRoomAbandoned()) return { kind: 'opponent-left' };

        // Checked unconditionally - whether the ping fired or this tick just timed out - because a
        // missed one-shot ping (Realtime never replays it) would otherwise mean `recoverResolve` below
        // keeps reporting "nothing to do" for the NEXT round forever (it only ever recovers the match's
        // CURRENT round, not "did MY round already finish while I wasn't looking").
        const view = await friendlyApi.fetchMyMatchView(mId);
        if (view.matchStatus === 'COMPLETE' || view.roundNumber > roundNumberRef.current) {
          return applyOutcome({ status: 'resolved', roundNumber: view.roundNumber, matchStatus: view.matchStatus, winner: view.winner, view: view.view, events: view.events });
        }
        if (pinged) continue; // a ping for something else (e.g. a rematch flag) - keep waiting

        // Timed out waiting for a ping - covers a resolver crashing mid-resolve (see plan's recovery timeout).
        const recovered = await friendlyApi.recoverResolve(mId);
        if (recovered.status === 'resolved') return applyOutcome(recovered);
      }
    },
    [applyOutcome],
  );

  const remoteOpponent: RemoteOpponentController | null = matchId
    ? {
        async submitAndAwaitRound(playerAction: PlayerAction) {
          // Start listening for the ping BEFORE submitting, not after learning we lost the race. The two
          // players' submissions usually land within moments of each other, so a subscription only
          // started once THIS side hears back "waiting" would frequently still be mid-handshake when the
          // OTHER side's resolve fires the ping - missing it and falling all the way back to the
          // multi-second poll timeout every round. That was the actual cause of the two players' reveal
          // animations visibly starting seconds apart instead of together.
          const latest = await friendlyApi.fetchMyMatchView(matchId);
          if (latest.roundNumber > roundNumberRef.current || latest.matchStatus === 'COMPLETE') {
            return applyOutcome({ status: 'resolved', ...latest });
          }
          if (latest.actionSubmitted) return awaitOpponentAction(matchId);
          const firstPing = subscribeToPingOnce(matchId);
          let outcome: RoundOutcome;
          try {
            outcome = await friendlyApi.submitAction(matchId, roundNumberRef.current, playerAction.plays);
          } catch (err) {
            firstPing.cancel();
            throw err;
          }
          if (outcome.status === 'resolved') {
            firstPing.cancel();
            return applyOutcome(outcome);
          }
          return awaitOpponentAction(matchId, firstPing);
        },
      }
    : null;

  const attachRoomSubscription = useCallback((roomId: string) => {
    unsubscribeRoomRef.current?.();
    unsubscribeRoomRef.current = friendlyApi.subscribeToRoom(roomId, (updated) => {
      roomRef.current = updated;
      setRoom(updated);
    });
  }, []);

  // Realtime is a latency improvement, not a delivery guarantee. Reconcile after
  // missed events, reconnects, and creation claims whose worker stopped early.
  useEffect(() => {
    if (!room?.id) return;
    let cancelled = false;
    const id = room.id;
    const timer = window.setInterval(() => {
      void friendlyApi.fetchRoom(id).then(updated => {
        if (cancelled) return;
        roomRef.current = updated;
        setRoom(updated);
      }).catch(() => { /* Next poll retries; do not discard an active match. */ });
    }, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [room?.id]);

  useEffect(() => {
    if (room && matchId && ((room.status === 'READY' && !room.current_match_id) || (room.current_match_id && room.current_match_id !== matchId))) {
      setMatchId(null);
      setInitialState(null);
      setInitialEvents(null);
      setPhase('LOBBY');
    }
  }, [room, matchId]);

  const enterMatch = useCallback(
    (roomId: string, side: Side, mId: string, roundNumber: number, view: GameState, events: GameEvent[]) => {
      roundNumberRef.current = roundNumber;
      setMatchId(mId);
      setInitialState(view);
      setInitialEvents(events);
      persist(roomId, side, mId);
      setPhase('IN_MATCH');
    },
    [persist],
  );

  // Both clients normally call this at nearly the same moment (both react to the room flipping READY).
  // api/create-match.ts's claim is concurrency-safe, so this either builds the match, hands back an
  // already-built one, or - if another client is actively building it right now - reports 'building'
  // rather than an error. The 'building' case is picked up by the effect below instead, which watches the
  // room's own current_match_id via realtime (already subscribed) so this client doesn't need to poll.
  const startMatch = useCallback(
    async (roomId: string, side: Side) => {
      if (startingRef.current) return;
      startingRef.current = true;
      setPhase('STARTING');
      try {
        const result = await friendlyApi.createMatch(roomId);
        if (result.status === 'created') enterMatch(roomId, side, result.matchId, result.roundNumber, result.view, result.events);
        // 'building': leave phase at STARTING - the current_match_id watcher effect below takes it from here.
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start the match');
        setPhase('ERROR');
      } finally {
        startingRef.current = false;
      }
    },
    [enterMatch],
  );

  // Reacts to the room flipping to READY (both sides ready) by building the match.
  useEffect(() => {
    if (room?.status === 'READY' && canonicalSide && !matchId && phase !== 'STARTING') {
      void startMatch(room.id, canonicalSide);
    }
    if (room?.status === 'ABANDONED' && phase !== 'IN_MATCH') {
      setError('The other player left the room.');
      setPhase('ERROR');
    }
  }, [room, canonicalSide, matchId, phase, startMatch]);

  const recoveringRoomId = room?.status === 'IN_PROGRESS' && !room.current_match_id ? room.id : null;
  useEffect(() => {
    if (!recoveringRoomId || !canonicalSide || matchId) return;
    const timer = window.setInterval(() => void startMatch(recoveringRoomId, canonicalSide), 5000);
    return () => window.clearInterval(timer);
  }, [recoveringRoomId, canonicalSide, matchId, startMatch]);

  // Picks up a match built by the OTHER client (the one that won the create-match claim) via the room's
  // own realtime subscription, rather than this client polling create-match itself.
  useEffect(() => {
    const currentRoom = room;
    const currentMatchId = currentRoom?.current_match_id;
    if (currentRoom && currentMatchId && canonicalSide && !matchId) {
      let cancelled = false;
      friendlyApi.fetchMyMatchView(currentMatchId).then((view) => {
        if (cancelled) return;
        enterMatch(currentRoom.id, canonicalSide, currentMatchId, view.roundNumber, view.view, view.events);
      }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not reconnect. Retrying…'); });
      return () => { cancelled = true; };
    }
  }, [room, canonicalSide, matchId, enterMatch]);

  // Reconnect-after-refresh: restore a previously joined room/match from localStorage.
  useEffect(() => {
    // ?friendly&reset skips reconnect entirely and forgets any saved session - useful when testing
    // repeatedly, since reconnect otherwise silently drops you back into whatever room this browser last
    // touched (by design, for a genuine accidental refresh) even if you actually wanted a clean slate.
    if (new URLSearchParams(window.location.search).has('reset')) {
      saveStoredSession(null);
      setPhase('IDLE');
      return;
    }

    const stored = loadStoredSession();
    if (!stored) {
      setPhase('IDLE');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const fetchedRoom = await friendlyApi.fetchRoom(stored.roomId);
        if (cancelled) return;
        if (fetchedRoom.status === 'ABANDONED') {
          saveStoredSession(null);
          setPhase('IDLE');
          return;
        }
        roomRef.current = fetchedRoom;
        setRoom(fetchedRoom);
        setCanonicalSide(stored.canonicalSide);
        attachRoomSubscription(stored.roomId);

        if ((fetchedRoom.status === 'IN_PROGRESS' || fetchedRoom.status === 'COMPLETE') && fetchedRoom.current_match_id) {
          const view = await friendlyApi.fetchMyMatchView(fetchedRoom.current_match_id);
          if (cancelled) return;
          roundNumberRef.current = view.roundNumber;
          setMatchId(fetchedRoom.current_match_id);
          setInitialState(view.view);
          setInitialEvents(view.events);
          setPhase('IN_MATCH');
        } else {
          setPhase('LOBBY');
        }
      } catch {
        if (cancelled) return;
        saveStoredSession(null);
        setPhase('IDLE');
      }
    })();

    return () => { cancelled = true; unsubscribeRoomRef.current?.(); roomRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRoom = useCallback(
    async (displayName: string, deck: DeckSnapshot) => {
      setError(null);
      try {
        const created = await friendlyApi.createRoom(displayName, deck);
        roomRef.current = created;
        setRoom(created);
        setCanonicalSide('player');
        persist(created.id, 'player', null);
        attachRoomSubscription(created.id);
        setPhase('LOBBY');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create room');
        setPhase('IDLE');
      }
    },
    [attachRoomSubscription, persist],
  );

  const joinRoom = useCallback(
    async (code: string, displayName: string, deck: DeckSnapshot) => {
      setError(null);
      try {
        const joined = await friendlyApi.joinRoom(code, displayName, deck);
        roomRef.current = joined;
        setRoom(joined);
        setCanonicalSide('enemy');
        persist(joined.id, 'enemy', null);
        attachRoomSubscription(joined.id);
        setPhase('LOBBY');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to join room');
        setPhase('IDLE');
      }
    },
    [attachRoomSubscription, persist],
  );

  const setReady = useCallback(async (ready: boolean) => {
    if (!roomRef.current) return;
    const updated = await friendlyApi.setReady(roomRef.current.id, ready);
    roomRef.current = updated;
    setRoom(updated);
  }, []);

  const requestRematch = useCallback(async (wants: boolean) => {
    if (!roomRef.current) return;
    const updated = await friendlyApi.requestRematch(roomRef.current.id, wants);
    roomRef.current = updated;
    setRoom(updated);
    if (updated.status === 'READY') {
      setMatchId(null);
      setInitialState(null);
      setInitialEvents(null);
    }
  }, []);

  const leave = useCallback(async () => {
    if (roomRef.current) await friendlyApi.leaveRoom(roomRef.current.id).catch(() => undefined);
    unsubscribeRoomRef.current?.();
    roomRef.current = null;
    setError(null);
    saveStoredSession(null);
    setRoom(null);
    setCanonicalSide(null);
    setMatchId(null);
    setInitialState(null);
    setInitialEvents(null);
    setPhase('IDLE');
  }, []);

  return { phase, room, canonicalSide, error, createRoom, joinRoom, setReady, leave, requestRematch, matchId, initialState, initialEvents, remoteOpponent };
}
