import { getCard } from '../game/cards';
import { CARD_LORE } from '../game/cards/lore';
import { CollectibleCard } from './CollectibleCard';
import { Icon } from './Icon';
import { useDialogFocus } from './useDialogFocus';
import { Gems, Sigil } from './CardParts';
import { getCollection, getOwnedCount } from '../game/collection/collection';
import { acquisitionSummary } from '../game/collection/acquisition';
import { getAscensionRank } from '../game/ascension/store';
import { getCardAscension } from '../game/ascension/definitions';
import { TRIGGER_LABEL } from '../game/types';

const TYPE_LABEL: Record<string, { icon: 'hero' | 'spell' | 'continuousSpell'; label: string }> = {
  hero: { icon: 'hero', label: 'Unit' },
  ONE_TIME: { icon: 'spell', label: 'Spell' },
  CONTINUOUS: { icon: 'continuousSpell', label: 'Continuous Spell' },
};

export function CardDetail({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const dialog = useDialogFocus(onClose);
  const card = getCard(cardId);
  const typeKey = card.type === 'hero' ? 'hero' : (card.spellKind ?? 'ONE_TIME');
  const typeInfo = TYPE_LABEL[typeKey];
  const lore = CARD_LORE[cardId];
  const owned = getOwnedCount(cardId, getCollection());
  const masterySupported = !!getCardAscension(cardId);
  const masteryStage = getAscensionRank(cardId) + 1;
  const acquisition = acquisitionSummary(cardId).replaceAll('Summon ·', 'Pack set ·');

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div ref={dialog} tabIndex={-1} className="modal-panel card-detail archive-detail card-inspect" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${card.name} card details`}>
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
              <Icon name={typeInfo.icon} size={13} /> {card.type === 'hero' ? 'Unit' : typeInfo.label}
            </span>
            <span className="faction-pill"><Sigil faction={card.faction} size="sm" />{card.faction}</span>
            <span className={`rarity-pill r-${card.rarity}`}><Gems rarity={card.rarity} />{card.rarity}</span>
            {card.type === 'hero' && <span>{card.role}</span>}
          </div>
          <div className="card-inspect-collection"><span>{owned > 0 ? `Owned ×${owned}` : 'Not collected'}</span><span>Acquisition · {acquisition}</span></div>
          {card.type === 'hero' && <div className="card-inspect-mastery"><span>Card Mastery</span><strong>{masterySupported ? `Stage ${['I', 'II', 'III', 'IV', 'V'][masteryStage - 1] ?? masteryStage}` : 'No duplicate path yet'}</strong><small>Existing duplicate progress and save data are preserved.</small></div>}
          {card.tags.length > 0 && <div className="meta tags">{card.tags.join(' · ')}</div>}
          <div className="text">
            <strong className="card-inspect-effect-label">Card effect</strong>
            {card.abilities.length > 0 ? card.abilities.map((a) => <p key={a.trigger + a.text}><span className="card-effect-keyword">{TRIGGER_LABEL[a.trigger]}</span>{a.text}</p>) : <p>No effect — a straightforward stat line.</p>}
          </div>
          {lore && <div className="archive-lore"><span>{lore.title}</span><blockquote>“{lore.quote}”</blockquote><p>{lore.story}</p></div>}
        </div>
      </div>
    </div>
  );
}
