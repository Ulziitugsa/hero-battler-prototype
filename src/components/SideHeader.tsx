import { STARTING_HP } from '../game/engine/constants';
import { Icon } from './Icon';

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
  hpFlash,
  deckCount,
  graveyardCount,
  onClose,
  onGraveyardClick,
}: {
  side: 'player' | 'enemy';
  name: string;
  rank: string;
  hp: number;
  hpFlash?: boolean;
  deckCount?: number;
  graveyardCount?: number;
  onClose?: () => void;
  onGraveyardClick?: () => void;
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
        <div className={`hp-plate ${low ? 'low' : ''} ${hpFlash ? 'flash-damage' : ''}`}>
          <span className="hp-plate-fill" style={{ width: `${pct}%` }} />
          <span className="hp-plate-scrim" />
          <span className="hp-plate-readout">
            <Icon name="hp" size={side === 'enemy' ? 8 : 11} filled />
            <span>
              {side === 'player' ? `${hp} / ${STARTING_HP}` : hp}
            </span>
          </span>
        </div>
      </div>
      {side === 'player' && deckCount !== undefined && graveyardCount !== undefined && (
        <div className="side-header-pills">
          <button type="button" className="side-header-pill interactive" onClick={onGraveyardClick} aria-label={`Open Graveyard, ${graveyardCount} cards`}>
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
