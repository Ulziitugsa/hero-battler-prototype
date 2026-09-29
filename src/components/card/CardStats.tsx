import type { CardDefinition } from '../../game/types';
import { cardFaceStats, formatStat, HP_CONTRIBUTION_HELP } from '../../game/cards/cardFace';
import { AtkIcon, HpIcon } from './CardIcons';
import '../../styles/cardStats.css';

export type CardStatsSize = 'compact' | 'standard' | 'full';

/**
 * ATK and HP Contribution, the two numbers every Unit card prints.
 * compact:  ⚔130  ♥+85          (battle hand/board)
 * standard: ⚔130  ♥+85          (Collection, Deck Builder), larger
 * full:     ⚔ 130 ATK  ♥ +85 HP (Card Inspect)
 * `livePower` is the battle's current Power; ATK is shown buffed/debuffed against the printed value.
 */
export function CardStats({ card, size = 'standard', livePower, className = '' }: { card: CardDefinition; size?: CardStatsSize; livePower?: number; className?: string }) {
  const printed = cardFaceStats(card);
  const live = cardFaceStats(card, livePower);
  if (!printed || !live) return null;
  const shift = live.atk > printed.atk ? 'up' : live.atk < printed.atk ? 'down' : '';
  const iconSize = size === 'compact' ? 11 : size === 'standard' ? 13 : 18;
  return (
    <span className={`card-stats size-${size} ${className}`} aria-label={`${formatStat(live.atk)} ATK${shift ? ` (printed ${printed.atk})` : ''}. HP Contribution +${printed.hpContribution}: adds this amount to your starting HP.`}>
      <span className={`card-stats-chip atk ${shift}`}>
        <AtkIcon size={iconSize} />
        <strong>{formatStat(live.atk)}</strong>
        {size === 'full' && <small>ATK</small>}
      </span>
      <span className="card-stats-chip hp" title={HP_CONTRIBUTION_HELP}>
        <HpIcon size={iconSize} />
        <strong>+{formatStat(printed.hpContribution)}</strong>
        {size === 'full' && <small>HP</small>}
      </span>
    </span>
  );
}
