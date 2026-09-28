import { getCard } from '../game/cards';
import { CardArtwork } from './CardArtwork';
import { Gems, Sigil } from './CardParts';
import { Icon } from './Icon';
import { CardStatPair } from './CardStatPair';
import { cardStatsPreviewEnabled } from '../game/cards/cardStatsPreview';
import '../styles/collectible.css';

/** A physical card face, shared by the ritual and collector's inspection view. */
export function CollectibleCard({ cardId, compact = false, treatment = 'base' }: { cardId: string; compact?: boolean; treatment?: 'base' | 'foil' | 'event' }) {
  const card = getCard(cardId);
  const preview = card.type === 'hero' && cardStatsPreviewEnabled();
  return <span className={`collectible r-${card.rarity} ${card.faction} treatment-${treatment} ${compact ? 'compact' : ''} ${preview ? 'preview-stats' : ''}`} data-treatment={treatment}>
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
    {card.type === 'hero' && cardStatsPreviewEnabled()
      ? <span className="collectible-stats"><CardStatPair card={card} compact={compact} /></span>
      : <span className="collectible-power" aria-label={card.type === 'hero' ? `${card.power} power` : 'Spell'}>{card.type === 'hero' ? card.power : <Icon name={card.spellKind === 'CONTINUOUS' ? 'continuousSpell' : 'spell'} size={20} />}</span>}
    <span className="collectible-number">{card.id.replace(/^(kng|und|inf|spl)-/, '').replaceAll('-', ' ')} · I</span>
  </span>;
}
