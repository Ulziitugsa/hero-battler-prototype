import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { HandCard as HandCardModel } from '../game/types';
import { getCard } from '../game/cards';
import { Icon } from './Icon';
import { GameCard } from './card/GameCard';
import { useBattleCardDisplay } from './combatDisplay';
import { cardEffects } from '../game/cards/cardPresentation';

const LONG_PRESS_MS = 450;
/** How far a press has to travel before it is a drag rather than a tap (and before long-press stops counting). */
export const DRAG_START_PX = 10;

/** One drag at a time across the hand: a second finger must not start another (dropping either would place whichever
 * card was selected last) or take over the one in progress. */
let dragOwner: object | null = null;

/** The slot a dragged card is over: the same element a tap would place it on (LaneSlot / SpellLaneSlot). */
function targetUnder(x: number, y: number): HTMLElement | null {
  const el = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
  return el?.closest<HTMLElement>('.battle-zone.targetable') ?? null;
}

export function HandCard({
  hand,
  selected,
  style,
  onSelect,
  onInspect,
  onDragStart,
  onDragEnd,
}: {
  hand: HandCardModel;
  selected: boolean;
  style: CSSProperties;
  onSelect: () => void;
  onInspect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const card = getCard(hand.cardId);
  // The battle's rules (card combat or legacy) decide the card's wording and ATK; the face is the same in every mode.
  const display = useBattleCardDisplay();
  const rules = display?.rules ?? 'card';
  const masteryRank = display?.masteryRank(card.id, 'player') ?? 0;
  // Long-press anywhere on the card opens Card Inspect (the (i) button does the same in one tap).
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const clearPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  // Drag to place: a pointer drag (touch, pen or mouse) rather than HTML drag-and-drop, which on a phone only starts
  // after a long press - the gesture that already opens Inspect. The card stays in the hand, a copy follows the finger,
  // the slot under it lights up, and letting go on it places the card exactly as tapping that slot would.
  const drag = useRef<{ pointerId: number; x0: number; y0: number; grabX: number; grabY: number; active: boolean; over: HTMLElement | null } | null>(null);
  const suppressClick = useRef(false);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ width: number; height: number; x: number; y: number } | null>(null);
  const self = useRef({});
  const dragEnd = useRef(onDragEnd);
  useEffect(() => {
    dragEnd.current = onDragEnd;
  });

  // Unmounted mid-gesture (the round moved on, the battle ended): no late Inspect, no lit slot, no held drag.
  useEffect(
    () => () => {
      clearPress();
      const d = drag.current;
      drag.current = null;
      d?.over?.classList.remove('drag-over');
      if (dragOwner === self.current) {
        dragOwner = null;
        if (d?.active) dragEnd.current();
      }
    },
    [],
  );

  const setOver = (next: HTMLElement | null) => {
    const d = drag.current;
    if (!d || d.over === next) return;
    d.over?.classList.remove('drag-over');
    next?.classList.add('drag-over');
    d.over = next;
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>, drop: boolean) => {
    const d = drag.current;
    // Another finger lifting is not the end of this drag.
    if (d && d.pointerId !== event.pointerId) return;
    drag.current = null;
    if (dragOwner === self.current) dragOwner = null;
    if (!d?.active) return;
    const target = drop ? d.over : null;
    d.over?.classList.remove('drag-over');
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setGhost(null);
    // The click that follows this pointerup belongs to the drag, not to a tap on the card.
    suppressClick.current = true;
    if (target) target.click();
    else onDragEnd();
  };

  const host = typeof document !== 'undefined' ? document.querySelector('.battle-stage') : null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${card.name}. ${cardEffects(card.id, { rules, masteryRank })
        .map((e) => `${e.label}: ${e.full}`)
        .join(' ')} Tap for details; long-press or use the info button to inspect.`}
      className={`hand-card card-face r-${card.rarity} ${selected ? 'selected' : ''} ${ghost ? 'dragging' : ''}`}
      style={style}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onSelect();
      }}
      onPointerDown={(event) => {
        // A drag is already under way (this card or another): leave it alone. (A press that never became a drag holds
        // nothing: a mouse released off the card sends its pointerup elsewhere, so it must not lock the card.)
        if (drag.current?.active || (dragOwner && dragOwner !== self.current)) return;
        longPressed.current = false;
        suppressClick.current = false;
        clearPress();
        pressTimer.current = window.setTimeout(() => {
          longPressed.current = true;
          drag.current = null;
          onInspect();
        }, LONG_PRESS_MS);
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        // Where on the card it was grabbed, measured on the untransformed card (the fan rotates and scales it).
        const el = event.currentTarget;
        const r = el.getBoundingClientRect();
        const grabX = event.clientX - (r.left + r.width / 2 - el.offsetWidth / 2);
        const grabY = event.clientY - (r.top + r.height / 2 - el.offsetHeight / 2);
        drag.current = { pointerId: event.pointerId, x0: event.clientX, y0: event.clientY, grabX, grabY, active: false, over: null };
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d || d.pointerId !== event.pointerId) return;
        if (!d.active) {
          if (Math.hypot(event.clientX - d.x0, event.clientY - d.y0) < DRAG_START_PX) return;
          if (dragOwner && dragOwner !== self.current) return;
          dragOwner = self.current;
          d.active = true;
          clearPress();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setGhost({ width: event.currentTarget.offsetWidth, height: event.currentTarget.offsetHeight, x: event.clientX - d.grabX, y: event.clientY - d.grabY });
          onDragStart();
        }
        // Follow the finger without re-rendering: the copy is moved directly, by transform only.
        const el = ghostRef.current;
        if (el) el.style.transform = `translate3d(${event.clientX - d.grabX}px, ${event.clientY - d.grabY}px, 0) rotate(-3deg) scale(1.06)`;
        setOver(targetUnder(event.clientX, event.clientY));
      }}
      onPointerUp={(event) => {
        if (drag.current && drag.current.pointerId !== event.pointerId) return;
        clearPress();
        endDrag(event, true);
      }}
      onLostPointerCapture={(event) => {
        // Capture taken away from the card mid-drag: the pointerup may never come here. (Only the card's own capture: a touch
        // starts captured to the element under the finger, and handing that to the card fires this from the child.)
        if (event.target === event.currentTarget && drag.current?.active && drag.current.pointerId === event.pointerId) endDrag(event, false);
      }}
      onPointerLeave={() => {
        if (!drag.current?.active) clearPress();
      }}
      onPointerCancel={(event) => {
        if (drag.current && drag.current.pointerId !== event.pointerId) return;
        clearPress();
        endDrag(event, false);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onSelect();
      }}
    >
      <GameCard cardId={card.id} density="hand" rules={rules} masteryRank={masteryRank} atk={display?.handAtk(card.id)} />
      <button
        type="button"
        className="hand-card-inspect"
        aria-label={`Inspect ${card.name}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onInspect();
        }}
      >
        <Icon name="help" size={14} />
      </button>
      {ghost &&
        host &&
        createPortal(
          <div ref={ghostRef} className="hand-drag-ghost card-face" aria-hidden="true" style={{ width: ghost.width, height: ghost.height, transform: `translate3d(${ghost.x}px, ${ghost.y}px, 0) rotate(-3deg) scale(1.06)` }}>
            <GameCard cardId={card.id} density="hand" rules={rules} masteryRank={masteryRank} atk={display?.handAtk(card.id)} />
          </div>,
          host,
        )}
    </div>
  );
}
