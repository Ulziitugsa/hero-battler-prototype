import type { LaneId, SpellZoneInstance, Side } from '../game/types';
import { SpellZoneChit } from './SpellZoneChit';
import { Icon } from './Icon';

export function SpellLaneSlot({
  lane,
  side,
  targetable,
  hasSelection,
  spell,
  onSlotClick,
  onChitClick,
}: {
  lane: LaneId;
  side: Side;
  targetable: boolean;
  hasSelection?: boolean;
  spell: SpellZoneInstance | null;
  onSlotClick?: () => void;
  onChitClick?: (spell: SpellZoneInstance) => void;
}) {
  // An instant Spell may target a lane that already has a persistent Spell sitting in it (it just
  // passes through), so "targetable" alone - not "empty" - decides whether a drop/tap here places.
  const dim = side === 'player' && !spell && !targetable && !!hasSelection;
  return (
    <div
      className={`battle-zone spell-zone ${targetable ? 'targetable' : ''} ${dim ? 'dim' : ''} ${spell ? 'filled' : ''} ${side}`}
      aria-label={spell ? undefined : `${side === 'player' ? 'Your' : "Enemy's"} spell slot, ${lane} lane`}
      onClick={targetable ? onSlotClick : spell ? () => onChitClick?.(spell) : undefined}
      onDragOver={(e) => {
        if (targetable) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (targetable) onSlotClick?.();
      }}
    >
      {spell ? (
        // While targetable, the slot itself handles the click (placing an instant Spell that
        // passes through this lane) - the chit isn't independently clickable in that moment.
        <SpellZoneChit spell={spell} side={side} onClick={targetable ? () => {} : () => onChitClick?.(spell)} />
      ) : (
        <span className="zone-ghost spell-ghost">
          <Icon name="continuousSpell" size={targetable ? 18 : 15} />
          {targetable && <span>Drop spell</span>}
        </span>
      )}
    </div>
  );
}
