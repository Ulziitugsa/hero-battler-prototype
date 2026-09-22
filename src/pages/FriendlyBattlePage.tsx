import { useEffect, useMemo, useState } from 'react';
import { useFriendlyRoom } from '../net/useFriendlyRoom';
import type { DeckSnapshot } from '../net/friendlyTypes';
import { listDeckOptions } from '../game/engine/deckOptions';
import { isDeckPlayable, getActiveDeck } from '../game/engine/activeDeck';
import '../styles/friendly.css';
import { isFriendlyConfigured } from '../net/supabaseClient';

import { GamePage } from './GamePage';

const NAME_STORAGE_KEY = 'skyloom:friendlyDisplayName';

function loadDisplayName(): string {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveDisplayName(name: string): void {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    // Not worth failing over - just won't be remembered next time.
  }
}


export function FriendlyBattlePage({ onBack }: { onBack: () => void }) {
  const room = useFriendlyRoom();
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const [displayName, setDisplayName] = useState(loadDisplayName);
  const [joinCode, setJoinCode] = useState(() => new URLSearchParams(window.location.search).get('room') ?? '');
  const [selectedDeckId, setSelectedDeckId] = useState(() => getActiveDeck().id);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  async function run(action: () => Promise<void>) {
    setBusy(true); setActionError('');
    try { await action(); } catch (err) { setActionError(err instanceof Error ? err.message : 'Connection failed. Please try again.'); } finally { setBusy(false); }
  }
  async function copyInvite() {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('friendly', ''); url.searchParams.set('room', room.room!.code);
    try { await navigator.clipboard.writeText(url.toString()); setNotice('Invite copied. Send it to your friend.'); }
    catch { setNotice('Share the room code with your friend instead.'); }
  }

  const deckOptions = useMemo(() => listDeckOptions().filter((d) => isDeckPlayable(d.cardIds)), []);
  const selectedDeck = deckOptions.find((d) => d.id === selectedDeckId) ?? deckOptions[0];

  function buildDeckSnapshot(): DeckSnapshot {
    return { cardIds: selectedDeck.cardIds };
  }

  async function handleCreate() {
    setBusy(true);
    try {
      saveDisplayName(displayName);
      await room.createRoom(displayName || 'Player', buildDeckSnapshot());
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    setBusy(true);
    try {
      saveDisplayName(displayName);
      await room.joinRoom(joinCode, displayName || 'Player', buildDeckSnapshot());
    } finally {
      setBusy(false);
    }
  }

  const iAmHost = room.canonicalSide === 'player';
  const myReady = room.room ? (iAmHost ? room.room.host_ready : room.room.guest_ready) : false;
  const opponentReady = room.room ? (iAmHost ? room.room.guest_ready : room.room.host_ready) : false;
  const opponentJoined = room.room ? (iAmHost ? !!room.room.guest_id : true) : false;
  const opponentName = room.room ? (iAmHost ? room.room.guest_display_name : room.room.host_display_name) : null;
  const iWantRematch = room.room ? (iAmHost ? room.room.rematch_host_wants : room.room.rematch_guest_wants) : false;

  if (room.phase === 'IN_MATCH' && room.matchId && room.initialState && room.remoteOpponent) {
    return (
      <><div aria-live="polite" className="friendly-match-notice">{actionError || (room.room?.status === 'ABANDONED' ? 'Your friend left the room. Use the close button to return home.' : '')}</div><GamePage
        key={room.matchId}
        playerDeck={(iAmHost ? room.room?.host_deck : room.room?.guest_deck)?.cardIds ?? selectedDeck.cardIds}
        enemyDeck={[]}
        playerDeckLabel={selectedDeck.label}
        enemyDeckLabel={opponentName ?? 'Opponent'}
        onExit={async () => {
          await room.leave();
          onBack();
        }}
        remoteOpponent={room.remoteOpponent}
        initialState={room.initialState}
        initialEvents={room.initialEvents ?? []}
        friendlyRematch={{
          onRematch: () => run(() => room.requestRematch(true)),
          onLeave: async () => {
            await room.leave();
            onBack();
          },
          waitingForOpponent: iWantRematch,
        }}
      /></>
    );
  }

  return <main className="friendly-page">
    <header className="friendly-header"><button onClick={() => void run(async () => { await room.leave(); onBack(); })}>← Home</button><span>MOONWATER · THE DUELING PIER</span><small>PRIVATE PLAYTEST</small></header>
    <section className="friendly-intro"><span className="moon-eyebrow">A RIVAL. A FRIEND. ONE MORE ROUND.</span><h1>Meet at the <em>pier.</em></h1><p>Bring your formation. Share an invitation.<br />A friendly duel beneath the lanterns.</p></section>
    {(room.error || actionError) && <p className="friendly-error" role="alert">{actionError || room.error}</p>}
    {!isFriendlyConfigured() && <p className="friendly-error" role="status">Online battles are not connected on this build yet. Solo adventures are still available.</p>}
    {notice && <p role="status">{notice}</p>}
    {room.phase === 'STARTING' && !room.room && <p role="status">Reconnecting to your room…</p>}
    {room.phase === 'IDLE' && <div className="friendly-layout">
      <section className="friendly-panel"><span className="moon-eyebrow">01 · YOUR FORMATION</span><h2>Who’s joining the duel?</h2>
        <label>Your name<input maxLength={24} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Wanderer" autoComplete="nickname" /></label>
        <label>Battle deck<select value={selectedDeck?.id} onChange={e => setSelectedDeckId(e.target.value)}>{deckOptions.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
        <div className="friendly-crest" aria-hidden="true">⚔</div><p className="friendly-footnote">Your deck is locked for this room. Both players use base card strength, without mastery or ascension bonuses.</p>
      </section>
      <section className="friendly-panel"><span className="moon-eyebrow">02 · INVITE A FRIEND</span><h2>Save them a place.</h2><p>Create a private room, then send your friend the invite link or six-character code.</p>
        <button className="moon-primary" disabled={busy || !isFriendlyConfigured() || !selectedDeck} onClick={handleCreate}>{busy ? 'Connecting…' : 'Create a room →'}</button>
        <div className="friendly-divider">OR JOIN THEIR ROOM</div>
        <form onSubmit={e => { e.preventDefault(); if (!busy && isFriendlyConfigured() && selectedDeck && joinCode.length === 6) void handleJoin(); }}><label>Invitation code<input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0,6))} placeholder="ABC234" maxLength={6} autoComplete="off" spellCheck={false} /></label><button className="moon-primary" disabled={busy || !isFriendlyConfigured() || !selectedDeck || joinCode.length !== 6}>Join your friend →</button></form>
        <p className="friendly-footnote">No registration required. Open the invite on another device or browser. Private duels do not award currency or affect your campaign.</p>
      </section>
    </div>}
    {(room.phase === 'LOBBY' || room.phase === 'STARTING') && room.room && <section className="friendly-panel friendly-lobby">
      <span className="moon-eyebrow">YOUR TABLE IS RESERVED</span><h2>{opponentJoined ? 'A worthy rival arrives.' : 'Keep a lantern lit.'}</h2><p>{opponentJoined ? 'When you are both ready, the duel begins.' : 'Share your invitation and wait for your friend.'}</p>
      <div className="friendly-invite"><strong>{room.room.code}</strong><button onClick={() => void copyInvite()}>Copy invite link ↗</button></div>
      <div className="friendly-seats"><div><span>YOU</span><h3>{iAmHost ? room.room.host_display_name : room.room.guest_display_name}</h3><p>{myReady ? '✓ Ready for battle' : 'Preparing formation'}</p></div><div><span>YOUR RIVAL</span><h3>{opponentName || 'An open seat'}</h3><p>{opponentReady ? '✓ Ready for battle' : opponentJoined ? 'Preparing formation' : 'Waiting for a friend…'}</p></div></div>
      <button className="moon-primary" disabled={busy || !opponentJoined || room.phase === 'STARTING'} onClick={() => void run(() => room.setReady(!myReady))}>{room.phase === 'STARTING' ? 'Preparing the battlefield…' : myReady ? 'Not ready yet' : 'Ready for battle →'}</button>
      <button className="friendly-leave" disabled={busy} onClick={() => void run(room.leave)}>Leave room</button>
    </section>}
    {room.phase === 'ERROR' && <section className="friendly-panel"><h2>Let’s reconnect.</h2><p>Return to the lobby to create or join a room again.</p><button className="moon-primary" onClick={() => void run(room.leave)}>Return to lobby</button></section>}
    <footer className="friendly-footer">FRIENDLY DUELS · NO RANKINGS · NO STAKES</footer>
  </main>;
}
