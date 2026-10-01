import type { LaneId, SpellZoneInstance, Side } from '../game/types';
import { SpellZoneChit } from './SpellZoneChit';
import type { ChitVisual } from './animation/chitEffects';
import { Icon } from './Icon';

export function SpellLaneSlot({
  lane,
  side,
  targetable,
  hasSelection,
  spell,
  anim,
  interactionDisabled,
  focused,
  onSlotClick,
  onChitClick,
}: {
  lane: LaneId;
  side: Side;
  targetable: boolean;
  hasSelection?: boolean;
  spell: SpellZoneInstance | null;
  anim?: ChitVisual | null;
  interactionDisabled?: boolean;
  /** Card combat: this Spell is the card the focus panel shows. */
  focused?: boolean;
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
      // The chit handles its own tap; this only catches a tap on the slot around it (a tap on the chit used to fire twice).
      onClick={targetable ? onSlotClick : spell && !interactionDisabled ? (e) => e.target === e.currentTarget && onChitClick?.(spell) : undefined}
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
        <SpellZoneChit spell={spell} side={side} anim={anim} disabled={interactionDisabled} focused={focused} onClick={targetable ? () => {} : () => onChitClick?.(spell)} />
      ) : (
        <span className="zone-ghost spell-ghost">
          <Icon name="continuousSpell" size={targetable ? 18 : 15} />
          {targetable && <span>Drop spell</span>}
        </span>
      )}
    </div>
  );
}
