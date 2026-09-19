import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/TopBar';
import { STARTER_DECKS, STARTER_DECK_NAMES, type StarterFaction } from '../game/cards/starterDecks';
import { listDeckOptions } from '../game/engine/deckOptions';
import { loadPreferences, savePreferences } from '../game/engine/preferences';
import { getActiveDeck } from '../game/engine/activeDeck';
import { useCollection } from '../game/collection/useCollection';
import { getDeckStatus } from './decks/deckStatus';

const FACTIONS: StarterFaction[] = ['kingdom', 'undead', 'infernal'];

export interface DeckChoice {
  label: string;
  cardIds: string[];
}

export function BattleSetupPage({ onStartBattle, onBack }: { onStartBattle: (player: DeckChoice, opponent: DeckChoice) => void; onBack?: () => void }) {
  const deckOptions = useMemo(() => listDeckOptions(), []);
  const prefs = useMemo(() => loadPreferences(), []);
  const owned = useCollection();

  const [playerDeckId, setPlayerDeckId] = useState(() => getActiveDeck().id);
  const [opponent, setOpponent] = useState<StarterFaction>(prefs.opponentFaction);

  const playerDeck = deckOptions.find((d) => d.id === playerDeckId) ?? deckOptions[0];
  const status = getDeckStatus(playerDeck.cardIds, owned);

  function updatePlayerDeck(id: string) {
    setPlayerDeckId(id);
    savePreferences({ selectedDeckId: id, opponentFaction: opponent });
  }

  function updateOpponent(f: StarterFaction) {
    setOpponent(f);
    savePreferences({ selectedDeckId: playerDeckId, opponentFaction: f });
  }

  return (
    <div className="screen-shell">
      <TopBar
        title="Battle"
        caption="Choose your deck and opponent"
        right={
          onBack && (
            <button type="button" className="btn btn-icon" onClick={onBack} aria-label="Back to Home">
              <Icon name="back" />
            </button>
          )
        }
      />

      <div className="battle-setup-card panel-raised">
        <label className="menu-field">
          <span>
            <Icon name="deck" size={15} /> Your deck
          </span>
          <select value={playerDeckId} onChange={(e) => updatePlayerDeck(e.target.value)}>
            {deckOptions.map((d) => (
              <option key={d.id} value={d.id} disabled={!getDeckStatus(d.cardIds, owned).valid}>
                {d.label}{getDeckStatus(d.cardIds, owned).valid ? '' : ' (not ready)'}
              </option>
            ))}
          </select>
        </label>

        {!status.valid && (
          <div className="menu-warning">
            <Icon name="warning" size={15} />
            This deck isn't ready: {status.message}. Fix it in Decks before playing.
          </div>
        )}

        <label className="menu-field">
          <span>
            <Icon name="heroes" size={15} /> Opponent
          </span>
          <select value={opponent} onChange={(e) => updateOpponent(e.target.value as StarterFaction)}>
            {FACTIONS.map((f) => (
              <option key={f} value={f}>
                {STARTER_DECK_NAMES[f]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="btn btn-primary weave-cta"
          disabled={!status.valid}
          onClick={() =>
            onStartBattle({ label: playerDeck.label, cardIds: playerDeck.cardIds }, { label: STARTER_DECK_NAMES[opponent], cardIds: STARTER_DECKS[opponent] })
          }
        >
          <Icon name="battle" size={18} /> FIGHT
        </button>
      </div>
    </div>
  );
}
