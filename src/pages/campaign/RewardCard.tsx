import { getCard } from '../../game/cards';
import type { GrantResult } from '../../game/collection/types';
import { cardCopyView } from '../../game/cards/cardCopy';
import { GameCard } from '../../components/card/GameCard';
import '../../styles/rewardCard.css';

/** The card a stage just gave (or is about to): the game's one card face (GameCard, tile density: art, name, rarity,
 * ATK, HP Contribution and every effect's battle line), and a NEW / Owned ×N tag decided by the collection layer's
 * GrantResult - never recomputed here. */
export function RewardCard({ cardId, grant, copies = 1 }: { cardId: string; grant: GrantResult | null; copies?: number }) {
  const card = getCard(cardId);
  const copy = cardCopyView(cardId);
  return (
    <div className={`reward-card r-${card.rarity}`}>
      <span className="reward-card-face">
        <GameCard cardId={cardId} density="tile" hpContribution={copy.hpContribution} />
      </span>
      <span className="reward-card-line">
        {copies > 1 && <span className="reward-card-copies">×{copies}</span>}
        {grant && <span className={`reward-card-tag ${grant.isNew ? 'new' : ''}`}>{grant.isNew ? 'New card' : `Owned ×${grant.owned}`}</span>}
      </span>
    </div>
  );
}
