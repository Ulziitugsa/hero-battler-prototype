import type { HandCard as HandCardModel } from '../game/types';
import { HandCard } from './HandCard';

// Fan math ported from Battle Screen v8's `hand(n, sel)`. Reference canvas is 390 wide / the hand
// apron is 188 tall; left offsets convert to % of scene width, vertical offsets stay small px deltas
// (a handful of pixels at most - not worth a second unit conversion for this little movement).
const REF_W = 390;
const CARD_W = 106;

function layout(count: number, selectedIndex: number | null) {
  const cx = 195;
  const step = count <= 3 ? 112 : Math.min(108, Math.round((330 - CARD_W) / (count - 1)));
  const total = CARD_W + step * (count - 1);
  const left0 = cx - total / 2;
  const mid = (count - 1) / 2;
  const spread = count <= 3 ? 4 : 3.2;

  return Array.from({ length: count }, (_, i) => {
    const d = i - mid;
    const on = selectedIndex === i;
    const rot = count === 1 ? 0 : d * spread;
    const drop = Math.min(8, Math.abs(d) * Math.abs(d) * 1.5);
    const top = 12 + drop + (on ? -18 : 0);
    const scale = on ? 1.05 : 1;
    return {
      leftPct: ((left0 + step * i) / REF_W) * 100,
      topPx: top,
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
}: {
  hand: HandCardModel[];
  selectedHandId: string | null;
  usedHandIds: Set<string>;
  onSelect: (hand: HandCardModel) => void;
  onInspect: (cardId: string) => void;
  onDragStart: (hand: HandCardModel) => void;
  onDragEnd: () => void;
}) {
  const visible = hand.filter((h) => !usedHandIds.has(h.handId));
  const selectedIndex = selectedHandId ? visible.findIndex((h) => h.handId === selectedHandId) : -1;
  const positions = layout(visible.length, selectedIndex >= 0 ? selectedIndex : null);

  return (
    <div className="hand-fan">
      {visible.map((h, i) => {
        const pos = positions[i];
        return (
          <HandCard
            key={h.handId}
            hand={h}
            selected={selectedIndex === i}
            style={{
              left: `${pos.leftPct}%`,
              top: `${pos.topPx}px`,
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
