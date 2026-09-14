import { getCard } from '../game/cards';
import { cardArtUrl } from '../game/cards/art';
import { Icon } from './Icon';

const TYPE_LABEL: Record<string, { icon: 'hero' | 'spell' | 'continuousSpell'; label: string }> = {
  hero: { icon: 'hero', label: 'Hero' },
  ONE_TIME: { icon: 'spell', label: 'Spell' },
  CONTINUOUS: { icon: 'continuousSpell', label: 'Continuous Spell' },
};

export function CardDetail({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const card = getCard(cardId);
  const typeKey = card.type === 'hero' ? 'hero' : (card.spellKind ?? 'ONE_TIME');
  const typeInfo = TYPE_LABEL[typeKey];
  const artUrl = cardArtUrl(cardId);

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="modal-panel card-detail" onClick={(e) => e.stopPropagation()}>
        <div className={`art ${card.faction}`}>
          {artUrl && <img className="art-image" src={artUrl} alt="" draggable={false} />}
          <div className={`rarity-tag rarity-${card.rarity}`}>{card.rarity}</div>
          <button type="button" className="btn btn-icon card-detail-close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
          {card.power !== undefined && <div className="card-detail-power stat-chip">
            <Icon name="power" size={14} /> <strong>{card.power}</strong>
          </div>}
        </div>
        <div className="body">
          <div className="name">{card.name}</div>
          <div className="meta">
            <span className="type-pill">
              <Icon name={typeInfo.icon} size={13} /> {typeInfo.label}
            </span>
            <span className="faction-pill">{card.faction}</span>
            <span>{card.role}</span>
          </div>
          {card.tags.length > 0 && <div className="meta tags">{card.tags.join(' · ')}</div>}
          <div className="text">
            {card.abilities.length > 0 ? card.abilities.map((a) => <p key={a.trigger + a.text}>{a.text}</p>) : 'No ability - a straightforward, reliable stat line.'}
          </div>
        </div>
      </div>
    </div>
  );
}
