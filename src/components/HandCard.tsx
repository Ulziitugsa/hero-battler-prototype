import { useRef, type CSSProperties } from 'react';
import type { HandCard as HandCardModel } from '../game/types';
import { getCard } from '../game/cards';
import { Icon } from './Icon';
import { GameCard } from './card/GameCard';
import { useBattleCardDisplay } from './combatDisplay';
import { cardEffects } from '../game/cards/cardPresentation';

const LONG_PRESS_MS = 450;

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

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${card.name}. ${cardEffects(card.id, { rules, masteryRank })
        .map((e) => `${e.label}: ${e.full}`)
        .join(' ')} Tap for details; long-press or use the info button to inspect.`}
      className={`hand-card card-face r-${card.rarity} ${selected ? 'selected' : ''}`}
      style={style}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onSelect();
      }}
      onPointerDown={() => {
        longPressed.current = false;
        clearPress();
        pressTimer.current = window.setTimeout(() => {
          longPressed.current = true;
          onInspect();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clearPress}
      onPointerLeave={clearPress}
      onPointerCancel={clearPress}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onSelect();
      }}
      draggable
      onDragStart={(e) => {
        clearPress();
        e.dataTransfer.setData('text/plain', hand.handId);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
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
    </div>
  );
}
