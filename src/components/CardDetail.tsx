import { getCard } from '../game/cards';
import { CARD_LORE } from '../game/cards/lore';
import { CollectibleCard } from './CollectibleCard';
import { Icon } from './Icon';
import { useDialogFocus } from './useDialogFocus';

const TYPE_LABEL: Record<string, { icon: 'hero' | 'spell' | 'continuousSpell'; label: string }> = {
  hero: { icon: 'hero', label: 'Hero' },
  ONE_TIME: { icon: 'spell', label: 'Spell' },
  CONTINUOUS: { icon: 'continuousSpell', label: 'Continuous Spell' },
};

export function CardDetail({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const dialog = useDialogFocus(onClose);
  const card = getCard(cardId);
  const typeKey = card.type === 'hero' ? 'hero' : (card.spellKind ?? 'ONE_TIME');
  const typeInfo = TYPE_LABEL[typeKey];
  const lore = CARD_LORE[cardId];

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div ref={dialog} tabIndex={-1} className="modal-panel card-detail archive-detail" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={card.name}>
        <div className="archive-detail-card">
          <CollectibleCard cardId={cardId} />
          <button type="button" className="btn btn-icon card-detail-close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
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
          {lore && <div className="archive-lore"><span>{lore.title}</span><blockquote>“{lore.quote}”</blockquote><p>{lore.story}</p></div>}
        </div>
      </div>
    </div>
  );
}
