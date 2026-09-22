import { CardArtwork } from '../../components/CardArtwork';
import { getCard } from '../../game/cards';
import { cardArtUrl } from '../../game/cards/art';
import type { GrantResult } from '../../game/collection/types';
import { Gems, Sigil } from '../../components/CardParts';
import '../../styles/rewardCard.css';

/** The card a stage just gave (or is about to): real art or the faction fallback, name, rarity gems, and
 * a NEW / Owned ×N tag decided by the collection layer's GrantResult - never recomputed here. */
export function RewardCard({ cardId, grant, copies = 1 }: { cardId: string; grant: GrantResult | null; copies?: number }) {
  const card = getCard(cardId);
  const url = cardArtUrl(cardId);
  return (
    <div className={`reward-card r-${card.rarity}`}>
      <span className="reward-card-frame">
        <span className={`reward-card-art ${card.faction}`}>
          {url ? <CardArtwork cardId={cardId} /> : <Sigil faction={card.faction} size="lg" />}
        </span>
      </span>
      <span className="reward-card-name">
        {card.name}
        {copies > 1 && <span className="reward-card-copies"> ×{copies}</span>}
      </span>
      <span className="reward-card-line">
        <Gems rarity={card.rarity} />
        {grant && <span className={`reward-card-tag ${grant.isNew ? 'new' : ''}`}>{grant.isNew ? 'New card' : `Owned ×${grant.owned}`}</span>}
      </span>
    </div>
  );
}
