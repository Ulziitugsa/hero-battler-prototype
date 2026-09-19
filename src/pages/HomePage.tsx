import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { CardDetail } from '../components/CardDetail';
import { HowToPlaySheet } from '../components/HowToPlaySheet';
import { FightChoiceSheet } from '../components/FightChoiceSheet';
import { getCard } from '../game/cards';
import { ROSTER_BY_FACTION } from '../game/cards/roster';
import { STARTER_DECK_NAMES, STARTER_DECKS, type StarterFaction } from '../game/cards/starterDecks';
import { listDeckOptions } from '../game/engine/deckOptions';
import { getActiveDeck, isDeckPlayable } from '../game/engine/activeDeck';
import { useCollection } from '../game/collection/useCollection';
import { useAccount } from '../game/progression/useAccount';
import { MASTERIES, rankNumeral } from '../game/mastery/definitions';
import { MasteryCrest } from '../components/MasteryCrest';
import { loadPreferences, savePreferences } from '../game/engine/preferences';
import { loadRecentMatches } from '../game/engine/localMatchHistory';
import type { DeckChoice } from './BattleSetupPage';

const STARTER_FACTIONS: StarterFaction[] = ['kingdom', 'undead', 'infernal'];
const FACTION_LABEL: Record<StarterFaction, string> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal' };

const MOTE_COUNT = 5;

export function HomePage({
  onOpenBattleSetup,
  onOpenCampaign,
  onStartQuickBattle,
  onOpenDecks,
  onOpenProfile,
}: {
  onOpenBattleSetup: () => void;
  onOpenCampaign: () => void;
  onStartQuickBattle: (player: DeckChoice, opponent: DeckChoice) => void;
  onOpenDecks: () => void;
  onOpenProfile: () => void;
}) {
  const prefs = useMemo(() => loadPreferences(), []);
  const deckOptions = useMemo(() => listDeckOptions(), []);

  // Real state, not just a memoed read of preferences - the deck-rail crests below let the player
  // switch their active starter deck without leaving Home, so this screen needs to re-render on that
  // change rather than only picking up a new preference on next mount.
  const owned = useCollection();
  const account = useAccount();
  const equippedMastery = account.equippedMasteryId ? MASTERIES[account.equippedMasteryId] : null;
  const [selectedDeckId, setSelectedDeckId] = useState(() => getActiveDeck().id);
  const selectedDeck = deckOptions.find((d) => d.id === selectedDeckId) ?? deckOptions[0];

  const recentMatches = useMemo(() => loadRecentMatches(), []);
  const lastMatch = recentMatches[0];

  const featuredCardId = ROSTER_BY_FACTION[selectedDeck.faction].find((id) => getCard(id).rarity === 'legendary');
  const featuredCard = featuredCardId ? getCard(featuredCardId) : null;

  const [inspectCardId, setInspectCardId] = useState<string | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showFightChoice, setShowFightChoice] = useState(false);

  function selectStarter(faction: StarterFaction) {
    const id = `starter-${faction}`;
    const deck = deckOptions.find((d) => d.id === id);
    if (!deck || !isDeckPlayable(deck.cardIds, owned)) return;
    setSelectedDeckId(id);
    savePreferences({ selectedDeckId: id, opponentFaction: prefs.opponentFaction });
  }

  /** Rematch: a quick battle with the currently active deck against the last-used AI opponent - the
   * same quick-match this screen used to expose as a separate "Practice Battle" button. */
  function rematch() {
    savePreferences({ selectedDeckId: selectedDeck.id, opponentFaction: prefs.opponentFaction });
    onStartQuickBattle(
      { label: selectedDeck.label, cardIds: selectedDeck.cardIds },
      { label: STARTER_DECK_NAMES[prefs.opponentFaction], cardIds: STARTER_DECKS[prefs.opponentFaction] },
    );
  }

  const lastResultWord = lastMatch ? (lastMatch.winner === 'player' ? 'Won' : lastMatch.winner === 'enemy' ? 'Lost' : 'Draw') : null;

  return (
    <div className="home-embervale">
      <div className="home-scene" aria-hidden="true">
        <div className="home-sky" />
        <div className="home-sun" />
        <div className="home-ridge home-ridge-a" />
        <div className="home-ridge home-ridge-b" />
        <div className="home-ridge home-ridge-c" />

        <div className="home-tower">
          <div className="home-tower-body" />
          <div className="home-tower-roof-band" />
          <div className="home-tower-roof-cap" />
          <div className="home-tower-window home-tower-window-a" />
          <div className="home-tower-window home-tower-window-b" />
        </div>
        <div className="home-wall-stub">
          <div className="home-wall-stub-body" />
          <div className="home-wall-stub-cap" />
        </div>

        <div className="home-balustrade">
          <div className="home-balustrade-top" />
          <div className="home-balustrade-bottom" />
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i} className="home-baluster" style={{ left: `${(10 + i * 36) / 3.9}%` }} />
          ))}
        </div>
        <div className="home-terrace-hairline" />

        <div className="home-banner home-banner-a">
          <div className="home-banner-cloth" />
          <div className="home-banner-trim" />
        </div>
        <div className="home-banner home-banner-b">
          <div className="home-banner-cloth" />
          <div className="home-banner-trim" />
        </div>

        <div className="home-motes">
          {Array.from({ length: MOTE_COUNT }, (_, i) => (
            <span key={i} className="home-mote" style={{ left: `${12 + i * 40}px`, animationDuration: `${7 + i * 1.6}s`, animationDelay: `${i * 1.9}s` }} />
          ))}
        </div>

        <div className="home-scrim-top" />

        <div className="home-hero-figure">
          <div className="home-hero-halo" />
          <div className="home-hero-shadow" />
          <div className="home-hero-silhouette" />
          <div className="home-hero-sheen" />
        </div>

        <div className="home-topbar">
          <button type="button" className="home-identity" onClick={onOpenProfile}>
            <span className="home-identity-avatar">
              <span className="home-identity-avatar-inner" />
            </span>
            <span className="home-identity-text">
              <span className="home-identity-name">Wanderer</span>
              <span className="home-identity-caption">Level {account.level}</span>
            </span>
          </button>
          <button type="button" className="home-help-plate" onClick={() => setShowHowToPlay(true)}>
            <Icon name="help" size={15} />
            <span>How to play</span>
          </button>
        </div>

        {lastMatch && (
          <button type="button" className="home-rematch-chip" onClick={rematch}>
            <Icon name="check" size={11} />
            <span>
              {lastResultWord} vs {lastMatch.enemyDeckLabel}
            </span>
            <span className="divider" />
            <span className="rematch-label">Rematch</span>
          </button>
        )}

        {featuredCard && (
          <button type="button" className="home-nameplate" onClick={() => setInspectCardId(featuredCard.id)}>
            <span className="home-nameplate-text">
              <span className="home-nameplate-name">{featuredCard.name}</span>
              <span className="home-nameplate-meta">
                {FACTION_LABEL[selectedDeck.faction]} · {featuredCard.rarity[0].toUpperCase() + featuredCard.rarity.slice(1)}
              </span>
            </span>
            <Icon name="back" size={13} className="home-nameplate-chevron" />
          </button>
        )}
      </div>

      <div className="home-terrace">
        <div className="home-deck-rail">
          <div className="home-deck-fan" data-faction={selectedDeck.faction}>
            <span className="home-deck-card home-deck-card-0" />
            <span className="home-deck-card home-deck-card-1">
              <span className="home-deck-card-gem" />
            </span>
            <span className="home-deck-card home-deck-card-2" />
          </div>
          <div className="home-deck-info">
            <div className="home-deck-name">{selectedDeck.label}</div>
            <div className="home-deck-meta">
              <span className="home-sigil" data-faction={selectedDeck.faction} />
              <span>
                {FACTION_LABEL[selectedDeck.faction]} · {selectedDeck.cardIds.length} cards
              </span>
            </div>
            {equippedMastery && (
              <div className="home-deck-mastery">
                <MasteryCrest id={equippedMastery.id} size={12} />
                <span>
                  {equippedMastery.name} {rankNumeral(account.unlockedMasteries[equippedMastery.id] ?? 1)}
                </span>
              </div>
            )}
            <div className="home-deck-crests">
              {STARTER_FACTIONS.map((f) => {
                const deck = deckOptions.find((d) => d.id === `starter-${f}`);
                const usable = !!deck && isDeckPlayable(deck.cardIds, owned);
                return (
                  <button
                    key={f}
                    type="button"
                    className={`home-crest ${selectedDeckId === `starter-${f}` ? 'active' : ''} ${usable ? '' : 'locked'}`}
                    onClick={() => selectStarter(f)}
                    disabled={!usable}
                    aria-label={usable ? STARTER_DECK_NAMES[f] : `${STARTER_DECK_NAMES[f]} (locked)`}
                  >
                    <span className="home-sigil" data-faction={f} />
                  </button>
                );
              })}
            </div>
          </div>
          <button type="button" className="home-edit-seal" onClick={onOpenDecks}>
            <span className="home-edit-seal-chip">
              <Icon name="edit" size={19} />
            </span>
            <span>Edit</span>
          </button>
        </div>

        <div className="home-fight-socket">
          <div className="home-fight-socket-glow" />
          <div className="home-fight-socket-ring" />
          <button type="button" className="home-fight-seal" onClick={() => setShowFightChoice(true)} aria-label="Fight">
            <span className="home-fight-seal-core">
              <Icon name="battle" size={20} />
              <span>Fight</span>
            </span>
          </button>
        </div>
      </div>

      {showHowToPlay && <HowToPlaySheet onClose={() => setShowHowToPlay(false)} />}
      {inspectCardId && <CardDetail cardId={inspectCardId} onClose={() => setInspectCardId(null)} />}
      {showFightChoice && (
        <FightChoiceSheet
          onClose={() => setShowFightChoice(false)}
          onOpenCampaign={() => {
            setShowFightChoice(false);
            onOpenCampaign();
          }}
          onOpenQuickBattle={() => {
            setShowFightChoice(false);
            onOpenBattleSetup();
          }}
        />
      )}
    </div>
  );
}
