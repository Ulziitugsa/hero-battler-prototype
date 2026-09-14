import type { CSSProperties } from 'react';
import type { HandCard as HandCardModel } from '../game/types';
import { getCard } from '../game/cards';
import { cardArtUrl } from '../game/cards/art';
import { Icon } from './Icon';
import { RARITY_GEMS } from './cardVisuals';

function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
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
  const isSpell = card.type === 'spell';
  const continuous = card.spellKind === 'CONTINUOUS';
  const gemCount = RARITY_GEMS[card.rarity];
  const artUrl = !isSpell ? cardArtUrl(card.id) : null;

  return (
    <button
      type="button"
      className={`hand-card ${selected ? 'selected' : ''}`}
      style={style}
      onClick={onSelect}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', hand.handId);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <span className={`hand-card-art ${card.faction} ${isSpell ? 'spell' : 'hero'}`}>
        {artUrl && <img className="hand-card-art-image" src={artUrl} alt="" draggable={false} />}
        {!isSpell && !artUrl && (
          <>
            <span className="hand-card-figure-head" />
            <span className="hand-card-figure-body" />
          </>
        )}
        {isSpell && <span className={`hand-card-sigil ${continuous ? 'cont' : 'once'}`} />}
        <span className="hand-card-gems">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className={`gem ${i < gemCount ? 'on' : ''}`} />
          ))}
        </span>
      </span>

      {!isSpell && <span className="hand-card-power">{card.power}</span>}
      {isSpell && (
        <span className="hand-card-token">
          <Icon name={continuous ? 'continuousSpell' : 'spell'} size={14} />
        </span>
      )}

      <span className="hand-card-plate">
        <span className="hand-card-plate-name">{card.name}</span>
      </span>
      <span className="hand-card-sub">
        <span className={`battle-sigil ${card.faction}`} />
        <span>{isSpell ? `${capitalize(card.faction)} spell` : `${capitalize(card.faction)} · ${card.role}`}</span>
      </span>
      <span className="hand-card-ability">{card.abilities[0]?.text ?? 'No ability.'}</span>

      <span
        className="hand-card-inspect"
        role="button"
        aria-label="Inspect card"
        onClick={(e) => {
          e.stopPropagation();
          onInspect();
        }}
      >
        <Icon name="help" size={12} />
      </span>
    </button>
  );
}
