import { STARTING_HP } from '../game/engine/constants';
import { Icon } from './Icon';
import type { ReactNode } from 'react';
import type { HpFx } from './animation/chitEffects';
import type { BattleCallout } from './animation/battleCallouts';
import { useCountUp } from './feedback/useCountUp';

/** How long the HP numeral takes to roll to a new value (the bar itself drops at once; see .hp-plate-ghost). */
const HP_ROLL_MS = 420;

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
  maxHp,
  hpFx,
  graveyardPulse,
  deckCount,
  graveyardCount,
  graveyardDisabled,
  onClose,
  onGraveyardClick,
  onLogClick,
  logOpen,
  badge,
  callout,
  beaten = false,
}: {
  side: 'player' | 'enemy';
  name: string;
  rank: string;
  hp: number;
  maxHp?: number;
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
  /** Card combat: opens the battle log in the dock over the hand (BattleDock.tsx). */
  onLogClick?: () => void;
  logOpen?: boolean;
  /** Small extra HUD element shown beside the pills (the equipped Mastery badge). */
  badge?: ReactNode;
  /** A word for the damage this bar just took ("Burn −45", "Big Hit −120"); see animation/battleCallouts.ts. */
  callout?: BattleCallout | null;
  /** The match is over and this side lost: its HP plate reads as emptied under the result screen. */
  beaten?: boolean;
}) {
  const healthMax = maxHp ?? STARTING_HP;
  const pct = Math.max(0, Math.min(100, (hp / healthMax) * 100));
  const low = hp <= healthMax * 0.3;
  // The numeral rolls down (and up) with the bar instead of jumping; the real value is `hp`, used for everything else.
  const shownHp = useCountUp(hp, { animateDecrease: true, durationMs: HP_ROLL_MS }).display;

  return (
    <div className={`side-header ${side} ${beaten ? 'is-beaten' : ''}`} aria-label={`${name}, ${rank}`}>
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
          <span className="hp-plate-ghost" style={{ width: `${pct}%` }} />
          <span className="hp-plate-fill" style={{ width: `${pct}%` }} />
          <span className="hp-plate-scrim" />
          <span className="hp-plate-readout">
            <Icon name="hp" size={side === 'enemy' ? 8 : 11} filled />
            <span>
              {`${shownHp} / ${healthMax}`}
            </span>
          </span>
          {hpFx && (
            <span key={`${hpFx.kind}-${hp}`} className={`floater hp-floater floater-${hpFx.kind === 'heal' ? 'heal' : 'power-down'}`}>
              {hpFx.kind === 'heal' ? '+' : '-'}
              {hpFx.amount}
            </span>
          )}
        </div>
        {/* On the bar it describes (its right half; the numeral is on the left), never out over the board. */}
        {callout && (
          <span key={callout.key} className={`mw-battle-callout hp ${callout.kind} ${callout.big ? 'big' : ''}`} role="status">
            {callout.text}
          </span>
        )}
      </div>
      {side === 'player' && deckCount !== undefined && graveyardCount !== undefined && (
        <div className="side-header-pills">
          {badge}
          {onLogClick && (
            <button type="button" className={`side-header-pill interactive log-pill ${logOpen ? 'active' : ''}`} onClick={onLogClick} disabled={graveyardDisabled} aria-pressed={!!logOpen} aria-label="Battle log">
              <Icon name="log" size={10} />
              Log
            </button>
          )}
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
