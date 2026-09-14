import { useState } from 'react';
import type { GameEvent, GameState, PlayerAction } from '../game/types';
import { getCard } from '../game/cards';
import { EventLogView } from './EventLogView';

export function DebugPanel({
  seed,
  state,
  lastAiAction,
  fullLog,
}: {
  seed: number;
  state: GameState;
  lastAiAction: PlayerAction | null;
  fullLog: GameEvent[];
}) {
  const [showEnemyHand, setShowEnemyHand] = useState(false);

  return (
    <div className="debug-panel">
      <h3>Match</h3>
      <div className="kv">
        <span>Seed</span>
        <span>{seed}</span>
      </div>
      <div className="kv">
        <span>Round</span>
        <span>{state.round}</span>
      </div>
      <div className="kv">
        <span>Status</span>
        <span>{state.status}</span>
      </div>

      <h3>Player</h3>
      <div className="kv">
        <span>Deck / Hand / Graveyard</span>
        <span>
          {state.player.deck.length} / {state.player.hand.length} / {state.player.graveyard.length}
        </span>
      </div>
      <div className="hand-list">
        {state.player.hand.map((h) => (
          <span key={h.handId} className="pill">
            {getCard(h.cardId).shortName}
          </span>
        ))}
      </div>
      <div className="unwoven-list">
        {state.player.graveyard.map((cardId, i) => (
          <span key={i} className="pill">
            {getCard(cardId).shortName}
          </span>
        ))}
      </div>

      <h3>
        Enemy{' '}
        <button type="button" style={{ float: 'right', fontSize: '0.6rem' }} onClick={() => setShowEnemyHand((v) => !v)}>
          {showEnemyHand ? 'hide hand' : 'reveal hand'}
        </button>
      </h3>
      <div className="kv">
        <span>Deck / Hand / Graveyard</span>
        <span>
          {state.enemy.deck.length} / {state.enemy.hand.length} / {state.enemy.graveyard.length}
        </span>
      </div>
      {showEnemyHand && (
        <div className="hand-list">
          {state.enemy.hand.map((h) => (
            <span key={h.handId} className="pill">
              {getCard(h.cardId).shortName}
            </span>
          ))}
        </div>
      )}
      <div className="unwoven-list">
        {state.enemy.graveyard.map((cardId, i) => (
          <span key={i} className="pill">
            {getCard(cardId).shortName}
          </span>
        ))}
      </div>

      <h3>Last AI action</h3>
      <div className="log">
        {lastAiAction === null || lastAiAction.plays.length === 0 ? (
          <div className="log-line">(no plays)</div>
        ) : (
          lastAiAction.plays.map((play, i) => (
            <div key={i} className="log-line">
              {getCard(play.cardId).name} -&gt; {play.lane}
            </div>
          ))
        )}
      </div>

      <h3>Event log</h3>
      <EventLogView events={fullLog} />
    </div>
  );
}
