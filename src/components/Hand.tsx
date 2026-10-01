import type { HandCard as HandCardModel } from '../game/types';
import { HandCard } from './HandCard';

// The hand: tall, readable cards that sit side by side with almost no fan, so their rules read straight. Three cards
// (the usual hand) never overlap; a fourth or fifth overlaps and the selected card comes to the front. Positions are
// laid out on a 390-wide reference and converted to % of the scene's width; vertical offsets stay small px deltas.
const REF_W = 390;
const CARD_W = 117;
/** While the focus panel or the battle log sits over the apron, the hand slides down until only the top of each card
 * (its name and the top of its art) shows under the panel, still a tap away. A share of the apron's height. */
const PEEK_TOP = '78%';

function layout(count: number, selectedIndex: number | null, peek = false) {
  const cx = 195;
  const step = count <= 3 ? 123 : Math.min(123, Math.round((372 - CARD_W) / (count - 1)));
  const total = CARD_W + step * (count - 1);
  const left0 = cx - total / 2;
  const mid = (count - 1) / 2;
  const spread = 1.2;

  return Array.from({ length: count }, (_, i) => {
    const d = i - mid;
    const on = selectedIndex === i;
    const rot = count === 1 ? 0 : d * spread;
    const drop = Math.min(3, Math.abs(d) * 2);
    const top = 8 + drop + (on ? -12 : 0);
    const scale = on && !peek ? 1.03 : 1;
    return {
      leftPct: ((left0 + step * i) / REF_W) * 100,
      top: peek ? `calc(${PEEK_TOP} + ${on ? -5 : drop}px)` : `${top}px`,
      rot,
      scale,
      z: on ? 30 : 10 + i,
    };
  });
}

export function Hand({
  hand,
  selectedHandId,
  usedHandIds,
  onSelect,
  onInspect,
  onDragStart,
  onDragEnd,
  peek = false,
}: {
  hand: HandCardModel[];
  selectedHandId: string | null;
  usedHandIds: Set<string>;
  onSelect: (hand: HandCardModel) => void;
  onInspect: (cardId: string) => void;
  onDragStart: (hand: HandCardModel) => void;
  onDragEnd: () => void;
  /** The dock is over the apron; only the top of each card shows. */
  peek?: boolean;
}) {
  const visible = hand.filter((h) => !usedHandIds.has(h.handId));
  const selectedIndex = selectedHandId ? visible.findIndex((h) => h.handId === selectedHandId) : -1;
  const positions = layout(visible.length, selectedIndex >= 0 ? selectedIndex : null, peek);

  return (
    <div className={`hand-fan readable ${peek ? 'peek' : ''}`}>
      {visible.map((h, i) => {
        const pos = positions[i];
        return (
          <HandCard
            key={h.handId}
            hand={h}
            selected={selectedIndex === i}
            style={{
              left: `${pos.leftPct}%`,
              top: pos.top,
              transform: `rotate(${pos.rot.toFixed(1)}deg) scale(${pos.scale})`,
              zIndex: pos.z,
            }}
            onSelect={() => onSelect(h)}
            onInspect={() => onInspect(h.cardId)}
            onDragStart={() => onDragStart(h)}
            onDragEnd={onDragEnd}
          />
        );
      })}
    </div>
  );
}
