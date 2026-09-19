import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { STARTER_DECKS, STARTER_DECK_NAMES, type StarterFaction } from '../game/cards/starterDecks';
import { listDeckOptions } from '../game/engine/deckOptions';
import { loadPreferences, savePreferences } from '../game/engine/preferences';
import { getActiveDeck } from '../game/engine/activeDeck';
import { useCollection } from '../game/collection/useCollection';
import { getDeckPresentation } from './decks/deckPresentation';

const FACTIONS: StarterFaction[] = ['kingdom', 'undead', 'infernal'];
const FACTION_LABEL: Record<StarterFaction, string> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal' };

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
  const playerDeckIndex = deckOptions.indexOf(playerDeck);
  const pres = getDeckPresentation(playerDeck, owned);
  const status = { valid: pres.playable };

  function updatePlayerDeck(id: string) {
    setPlayerDeckId(id);
    savePreferences({ selectedDeckId: id, opponentFaction: opponent });
  }

  function updateOpponent(f: StarterFaction) {
    setOpponent(f);
    savePreferences({ selectedDeckId: playerDeckId, opponentFaction: f });
  }

  function stepDeck(delta: number) {
    updatePlayerDeck(deckOptions[(playerDeckIndex + delta + deckOptions.length) % deckOptions.length].id);
  }

  return (
    <div className="skirmish">
      <div className="skirmish-world" aria-hidden="true">
        <div className="skirmish-sky" />
        <div className="skirmish-sun" />
        <div className="skirmish-ridge skirmish-ridge-a" />
        <div className="skirmish-ridge skirmish-ridge-b" />
        <div className="skirmish-scrim" />
      </div>

      <header className="skirmish-header">
        {onBack && (
          <button type="button" className="skirmish-back" onClick={onBack} aria-label="Back to Home">
            <Icon name="back" size={20} />
          </button>
        )}
        <div className="skirmish-heading">
          <h1 className="skirmish-title">Quick battle</h1>
          <p className="skirmish-caption">Pick a rival, then fight</p>
        </div>
      </header>

      <section className="skirmish-yard" aria-labelledby="skirmish-opponent-title">
        <h2 className="skirmish-section" id="skirmish-opponent-title">
          <span>Who are you facing?</span>
        </h2>
        <div className="skirmish-hanging">
          <div className="skirmish-beam" />
          <div className="skirmish-pennants" role="radiogroup" aria-labelledby="skirmish-opponent-title">
            {FACTIONS.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={opponent === f}
                aria-label={STARTER_DECK_NAMES[f]}
                className={`skirmish-pennant ${opponent === f ? 'active' : ''}`}
                onClick={() => updateOpponent(f)}
              >
                <span className="skirmish-pennant-cloth">
                  <span className="skirmish-pennant-sigil">
                    <span className="home-sigil" data-faction={f} />
                  </span>
                  <span className="skirmish-pennant-name">{FACTION_LABEL[f]}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="home-terrace skirmish-terrace">
        <h2 className="skirmish-section skirmish-section-terrace">
          <span>Your deck</span>
        </h2>

        <div className="home-deck-rail skirmish-rail">
          <div className="home-deck-fan" data-faction={playerDeck.faction}>
            <span className="home-deck-card home-deck-card-0" />
            <span className="home-deck-card home-deck-card-1">
              <span className="home-deck-card-gem" />
            </span>
            <span className="home-deck-card home-deck-card-2" />
          </div>
          <div className="home-deck-info" aria-live="polite">
            <div className="home-deck-name">{playerDeck.label}</div>
            <div className="home-deck-meta">
              <span className="home-sigil" data-faction={playerDeck.faction} />
              <span>
                {FACTION_LABEL[playerDeck.faction]} · {playerDeck.cardIds.length} {playerDeck.cardIds.length === 1 ? 'card' : 'cards'}
              </span>
            </div>
            {deckOptions.length > 1 && (
              <div className="skirmish-pips" aria-hidden="true">
                {deckOptions.map((d) => (
                  <span key={d.id} className={`skirmish-pip ${d.id === playerDeck.id ? 'active' : ''}`} />
                ))}
              </div>
            )}
          </div>
          {deckOptions.length > 1 && (
            <div className="skirmish-steppers">
              <button type="button" className="skirmish-step" onClick={() => stepDeck(-1)} aria-label="Previous deck">
                <Icon name="back" size={18} />
              </button>
              <button type="button" className="skirmish-step skirmish-step-next" onClick={() => stepDeck(1)} aria-label="Next deck">
                <Icon name="back" size={18} />
              </button>
            </div>
          )}
        </div>

        {!status.valid && (
          <div className="skirmish-warning" role="alert">
            <Icon name="warning" size={16} />
            <span>{pres.kind === 'starter-locked' ? `${pres.unlock?.name} is locked (${pres.unlock?.collected} / ${pres.unlock?.total} cards). Earn its cards in the Campaign.` : `This deck isn't ready: ${pres.message}. Fix it in Decks before playing.`}</span>
          </div>
        )}

        <div className={`home-fight-socket skirmish-socket ${status.valid ? '' : 'disabled'}`}>
          <div className="home-fight-socket-glow" />
          <div className="home-fight-socket-ring" />
          <button
            type="button"
            className="home-fight-seal"
            aria-label="Fight"
            disabled={!status.valid}
            onClick={() =>
              onStartBattle({ label: playerDeck.label, cardIds: playerDeck.cardIds }, { label: STARTER_DECK_NAMES[opponent], cardIds: STARTER_DECKS[opponent] })
            }
          >
            <span className="home-fight-seal-core">
              <Icon name="battle" size={20} />
              <span>Fight</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
