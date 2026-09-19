import { Gems, Sigil } from '../../components/CardParts';
import { getCard } from '../../game/cards';
import { cardArtUrl } from '../../game/cards/art';
import type { GrantResult } from '../../game/collection/types';
import { RARITY_LABEL } from '../../game/summon/view';

const FACTION_LABEL: Record<string, string> = { kingdom: 'Kingdom', undead: 'Undead', infernal: 'Infernal', wildborn: 'Wildborn' };

/** A summoned card: real art (or the faction fallback), name, rarity, faction, New / Owned ×N. `grant` comes from the collection layer - never recomputed here. */
export function SummonCard({ cardId, grant, size, delay = 0, onClick }: { cardId: string; grant: GrantResult; size: 'lg' | 'sm'; delay?: number; onClick?: () => void }) {
  const card = getCard(cardId);
  const url = cardArtUrl(cardId);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`summon-card ${size} r-${card.rarity}`} style={{ animationDelay: `${delay}ms` }} onClick={onClick} aria-label={onClick ? `Inspect ${card.name}` : undefined}>
      <span className="summon-card-frame">
        <span className={`summon-card-art ${card.faction}`}>
          {url ? <img src={url} alt="" draggable={false} /> : <Sigil faction={card.type !== 'hero' ? 'spell' : card.faction} size={size === 'lg' ? 'lg' : 'md'} />}
        </span>
      </span>
      <span className="summon-card-name">{card.name}</span>
      <span className="summon-card-meta">
        <Gems rarity={card.rarity} />
        <span>
          {RARITY_LABEL[card.rarity]} · {FACTION_LABEL[card.faction] ?? card.faction}
        </span>
      </span>
      <span className={`summon-card-tag ${grant.isNew ? 'new' : ''}`}>{grant.isNew ? 'New card' : `Owned ×${grant.owned}`}</span>
    </Tag>
  );
}
