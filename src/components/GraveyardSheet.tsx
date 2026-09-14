import { useState } from 'react';
import type { Side } from '../game/types';
import { getCard } from '../game/cards';
import { cardArtUrl } from '../game/cards/art';
import { Icon } from './Icon';

/**
 * A real, inspectable Graveyard (mechanics foundation pass). Graveyard contents are treated as
 * public information for now - both sides are viewable from the same sheet via the tab row, rather
 * than adding a second tappable affordance to the (deliberately minimal) enemy banner. Opens from the
 * player's own Graveyard pill in SideHeader; a full navigation page would be overkill for this, so
 * it's a bottom sheet in the same dark/carved language as the rest of Battle.
 */
export function GraveyardSheet({
  playerGraveyard,
  enemyGraveyard,
  onClose,
  onInspect,
}: {
  playerGraveyard: string[];
  enemyGraveyard: string[];
  onClose: () => void;
  onInspect: (cardId: string) => void;
}) {
  const [side, setSide] = useState<Side>('player');
  const cardIds = side === 'player' ? playerGraveyard : enemyGraveyard;
  // Destruction order is oldest-first in state; show most-recently-lost cards at the top.
  const ordered = [...cardIds].reverse();

  return (
    <div className="overlay-backdrop graveyard-overlay" onClick={onClose}>
      <div className="graveyard-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="graveyard-header">
          <span className="graveyard-title">Graveyard</span>
          <button type="button" className="graveyard-close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="graveyard-tabs">
          <button type="button" className={`graveyard-tab ${side === 'player' ? 'active' : ''}`} onClick={() => setSide('player')}>
            Yours ({playerGraveyard.length})
          </button>
          <button type="button" className={`graveyard-tab ${side === 'enemy' ? 'active' : ''}`} onClick={() => setSide('enemy')}>
            Enemy&apos;s ({enemyGraveyard.length})
          </button>
        </div>

        {ordered.length === 0 ? (
          <div className="graveyard-empty">
            <Icon name="graveyard" size={22} />
            <span>Nothing here yet.</span>
          </div>
        ) : (
          <div className="graveyard-list">
            {ordered.map((cardId, i) => {
              const card = getCard(cardId);
              const artUrl = cardArtUrl(cardId);
              const typeLabel = card.type === 'hero' ? 'Hero' : card.spellKind === 'CONTINUOUS' ? 'Continuous Spell' : 'Spell';
              return (
                <button type="button" className="graveyard-card-row" key={`${cardId}-${i}`} onClick={() => onInspect(cardId)}>
                  <span className="graveyard-card-art">
                    <span className={`zone-card-art ${card.faction}`}>{artUrl && <img className="zone-card-art-image" src={artUrl} alt="" draggable={false} />}</span>
                  </span>
                  <span className="graveyard-card-info">
                    <span className="graveyard-card-name">{card.name}</span>
                    <span className="graveyard-card-meta">
                      <span className={`battle-sigil ${card.faction}`} />
                      {typeLabel}
                    </span>
                  </span>
                  {card.power !== undefined && <span className="graveyard-card-power">{card.power}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
