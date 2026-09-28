import type { CardDefinition } from '../game/types';
import { cardStatsPreview, cardStatsPreviewEnabled } from '../game/cards/cardStatsPreview';
import { Icon } from './Icon';
import '../styles/cardStats.css';

export function CardStatPair({ card, compact = false, effectivePower }: { card: CardDefinition; compact?: boolean; effectivePower?: number }) {
  if (!cardStatsPreviewEnabled()) return null;
  const stats = cardStatsPreview(card, effectivePower);
  if (!stats) return null;
  return <span className={`card-stat-pair ${compact ? 'compact' : ''}`} aria-label={`ATK ${stats.atk}. LP contribution ${stats.lp}, adds to your starting Life.`}>
    <span className="card-stat atk"><Icon name="attack" size={compact ? 12 : 15} /><small>ATK</small><strong>{stats.atk}</strong></span>
    <span className="card-stat lp" title="LP Contribution — adds to your starting Life."><Icon name="lp" size={compact ? 12 : 15} filled /><small>{compact ? '' : 'LP'}</small><strong>{stats.lp}</strong></span>
  </span>;
}
