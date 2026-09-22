import { getCard } from '../game/cards';
import { CardArtwork } from './CardArtwork';
import { Gems, Sigil } from './CardParts';
import { Icon } from './Icon';
import '../styles/collectible.css';

/** A physical card face, shared by the ritual and collector's inspection view. */
export function CollectibleCard({ cardId, compact = false }: { cardId: string; compact?: boolean }) {
  const card = getCard(cardId);
  return <span className={`collectible r-${card.rarity} ${card.faction} ${compact ? 'compact' : ''}`}>
    <span className="collectible-art">
      <CardArtwork cardId={cardId} />
    </span>
    <span className="collectible-edging" aria-hidden="true" />
    <span className="collectible-header"><Gems rarity={card.rarity} /><span>{card.rarity}</span></span>
    <span className="collectible-base">
      <span className="collectible-name">{card.name}</span>
      <span className="collectible-kind"><Sigil faction={card.faction} size="sm" />{card.faction} · {card.type === 'hero' ? card.role : card.spellKind === 'CONTINUOUS' ? 'Continuous spell' : 'Spell'}</span>
      {!compact && <span className="collectible-rule">{card.boardText || 'Hold the line.'}</span>}
    </span>
    <span className="collectible-power" aria-label={card.type === 'hero' ? `${card.power} power` : 'Spell'}>{card.type === 'hero' ? card.power : <Icon name={card.spellKind === 'CONTINUOUS' ? 'continuousSpell' : 'spell'} size={20} />}</span>
    <span className="collectible-number">{card.id.replace(/^(kng|und|inf|spl)-/, '').replaceAll('-', ' ')} · I</span>
  </span>;
}
