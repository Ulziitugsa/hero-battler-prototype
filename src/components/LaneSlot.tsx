import type { HeroInstance, LaneId, Side } from '../game/types';
import { BoardChit, type ChitFx } from './BoardChit';
import { Icon } from './Icon';

export function LaneSlot({
  lane,
  side,
  hero,
  targetable,
  hasSelection,
  fx,
  onSlotClick,
  onChitClick,
}: {
  lane: LaneId;
  side: Side;
  hero: HeroInstance | null;
  targetable: boolean;
  /** True while the player has a card selected - dims this zone (once known unavailable) rather than leaving it at resting opacity. Only meaningful for the player's own board. */
  hasSelection?: boolean;
  fx?: ChitFx | null;
  onSlotClick?: () => void;
  onChitClick?: (hero: HeroInstance) => void;
}) {
  const canDrop = !hero && targetable;
  const dim = side === 'player' && !hero && !targetable && !!hasSelection;
  return (
    <div
      className={`battle-zone hero-zone ${targetable ? 'targetable' : ''} ${dim ? 'dim' : ''} ${hero ? 'filled' : ''} ${side}`}
      aria-label={hero ? undefined : `${side === 'player' ? 'Your' : "Enemy's"} hero slot, ${lane} lane`}
      onClick={canDrop ? onSlotClick : undefined}
      onDragOver={(e) => {
        if (canDrop) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (canDrop) onSlotClick?.();
      }}
    >
      {hero ? (
        <BoardChit hero={hero} side={side} fx={fx} onClick={() => onChitClick?.(hero)} />
      ) : (
        <span className="zone-ghost">
          <span className="zone-ghost-corner tl" />
          <span className="zone-ghost-corner tr" />
          <span className="zone-ghost-corner bl" />
          <span className="zone-ghost-corner br" />
          <span className="zone-ghost-hint">
            <Icon name="hero" size={targetable ? 21 : 17} />
            {targetable && <span>Drop hero</span>}
          </span>
        </span>
      )}
    </div>
  );
}
