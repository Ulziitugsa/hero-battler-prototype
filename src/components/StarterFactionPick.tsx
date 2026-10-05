import { useState } from 'react';
import { CardArtwork } from './CardArtwork';
import { getCard } from '../game/cards';
import type { StarterFaction } from '../game/cards/starterDecks';
import { CORE_FACTIONS, CORE_FACTION_NAMES, CORE_FACTION_PITCH } from '../game/core/corePackages';
import { chooseStarterFaction } from '../game/core/coreAccess';
import { getCollection, setCollection } from '../game/collection/collection';
import { starterDeckId } from '../game/collection/starterUnlock';
import { loadPreferences, savePreferences } from '../game/engine/preferences';
import '../styles/starterPick.css';

/** The Legendary each faction's Core package is built around (shown on its choice). */
const HEADLINE: Record<StarterFaction, string> = { kingdom: 'kng-paladin', undead: 'und-vharos', infernal: 'inf-infernal-lord' };
const RIVAL: Record<StarterFaction, StarterFaction> = { kingdom: 'undead', undead: 'infernal', infernal: 'kingdom' };

/**
 * A new account's one-time choice of starter faction (core/coreAccess.ts). The choice gives that faction's free Core
 * package and makes its starter deck the active deck; the other two packages unlock in the first Campaign stages, so
 * nothing is lost by picking. Shown once, before Home, and never again.
 */
export function StarterFactionPick({ onPicked }: { onPicked: () => void }) {
  const [selected, setSelected] = useState<StarterFaction | null>(null);
  function confirm() {
    if (!selected) return;
    chooseStarterFaction(selected, { getOwned: getCollection, setOwned: setCollection });
    savePreferences({ ...loadPreferences(), selectedDeckId: starterDeckId(selected), opponentFaction: RIVAL[selected] });
    onPicked();
  }
  return <main className="starter-pick" aria-labelledby="starter-pick-title">
    <header>
      <span className="starter-pick-kicker">CHOOSE YOUR BANNER</span>
      <h1 id="starter-pick-title">Pick your first faction</h1>
      <p>You get its 10 Core cards and a ready starter deck. The other two factions' Core cards unlock in the first Campaign battles.</p>
    </header>
    <div className="starter-pick-options" role="radiogroup" aria-label="Starter faction">
      {CORE_FACTIONS.map((faction) => <button type="button" key={faction} role="radio" aria-checked={selected === faction} className={`starter-pick-option ${faction} ${selected === faction ? 'selected' : ''}`} onClick={() => setSelected(faction)}>
        <span className="starter-pick-art" aria-hidden="true"><CardArtwork cardId={HEADLINE[faction]} /></span>
        <span className="starter-pick-copy">
          <strong>{CORE_FACTION_NAMES[faction]}</strong>
          <span>{CORE_FACTION_PITCH[faction]}</span>
          <small>Led by {getCard(HEADLINE[faction]).name}</small>
        </span>
      </button>)}
    </div>
    <button type="button" className="starter-pick-confirm" onClick={confirm} disabled={!selected}>{selected ? `Start with ${CORE_FACTION_NAMES[selected]}` : 'Choose a faction'}</button>
  </main>;
}
