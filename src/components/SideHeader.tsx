import { STARTING_HP } from '../game/engine/constants';
import { Icon } from './Icon';
import type { ReactNode } from 'react';
import type { HpFx } from './animation/chitEffects';

/**
 * Battle Screen v8: the enemy banner (top) and the player's HP row (bottom) share the same HP-bar
 * treatment (dark inset plate, heart glyph, left-aligned cream numeral) but differ in weight - the
 * enemy bar is 12px and carries no resource counts, the player bar is 20px and carries the
 * Graveyard/Deck pills, matching the asymmetry in the design: the player tracks their own resources,
 * the enemy's are not surfaced prominently.
 */
export function SideHeader({
  side,
  name,
  rank,
  hp,
  hpFx,
  graveyardPulse,
  deckCount,
  graveyardCount,
  graveyardDisabled,
  onClose,
  onGraveyardClick,
  badge,
}: {
  side: 'player' | 'enemy';
  name: string;
  rank: string;
  hp: number;
  /** Drives the HP plate's flash colour, an enlarge/shake pulse on the numeral, and a floating +/- number by the bar - see components/animation/chitEffects.ts. */
  hpFx?: HpFx | null;
  /** Briefly highlights the Graveyard pill - a card just entered it. */
  graveyardPulse?: boolean;
  deckCount?: number;
  graveyardCount?: number;
  /** Locked out while a round is resolving - see GamePage's resolving-state rule. */
  graveyardDisabled?: boolean;
  onClose?: () => void;
  onGraveyardClick?: () => void;
  /** Small extra HUD element shown beside the pills (the equipped Mastery badge). */
  badge?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, (hp / STARTING_HP) * 100));
  const low = hp <= STARTING_HP * 0.3;

  return (
    <div className={`side-header ${side}`} aria-label={`${name}, ${rank}`}>
      {side === 'enemy' && onClose && (
        <button type="button" className="side-header-close" onClick={onClose} aria-label="Exit battle">
          <Icon name="close" size={11} />
        </button>
      )}
      <span className="side-header-avatar">
        <span className="side-header-avatar-inner" />
      </span>
      <div className="side-header-body">
        <div className="side-header-name">{name}</div>
        <div className={`hp-plate ${low ? 'low' : ''} ${hpFx?.kind === 'damage' ? 'flash-damage hp-hit' : ''} ${hpFx?.kind === 'heal' ? 'flash-heal hp-hit' : ''}`}>
          <span className="hp-plate-fill" style={{ width: `${pct}%` }} />
          <span className="hp-plate-scrim" />
          <span className="hp-plate-readout">
            <Icon name="hp" size={side === 'enemy' ? 8 : 11} filled />
            <span>
              {side === 'player' ? `${hp} / ${STARTING_HP}` : hp}
            </span>
          </span>
          {hpFx && (
            <span key={`${hpFx.kind}-${hp}`} className={`floater hp-floater floater-${hpFx.kind === 'heal' ? 'heal' : 'power-down'}`}>
              {hpFx.kind === 'heal' ? '+' : '-'}
              {hpFx.amount}
            </span>
          )}
        </div>
      </div>
      {side === 'player' && deckCount !== undefined && graveyardCount !== undefined && (
        <div className="side-header-pills">
          {badge}
          <button
            type="button"
            className={`side-header-pill interactive ${graveyardPulse ? 'pill-pulse' : ''}`}
            onClick={onGraveyardClick}
            disabled={graveyardDisabled}
            aria-label={`Open Graveyard, ${graveyardCount} cards`}
          >
            <Icon name="graveyard" size={10} />
            {graveyardCount}
          </button>
          <span className="side-header-pill">
            <Icon name="deck" size={10} />
            {deckCount}
          </span>
        </div>
      )}
    </div>
  );
}
