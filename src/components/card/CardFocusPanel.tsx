import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { getCard } from '../../game/cards';
import { cardIdentity } from '../../game/cards/cardPresentation';
import { CardArtwork } from '../CardArtwork';
import { Icon, type IconName } from '../Icon';
import type { FocusAtkChange, FocusDetails } from '../battleInfo/focusDetails';
import '../../styles/cardFocus.css';

/**
 * The focused card detail: layer 2 of a card's information, between its face (layer 1) and Card Inspect (layer 3). One
 * component everywhere a card can be picked out:
 *  - 'dock': in battle, over the hand apron, for a card in hand, a Unit or a Spell on either side of the board. The
 *    battle stays in view: the board, the Fight seal and both HP bars are never covered.
 *  - 'sheet': outside battle (Collection, Deck Builder, Shop and Box contents, pack results, events), a sheet over the
 *    bottom of the screen with the card itself beside its full rules (CardFocusSheet.tsx).
 * Either way it shows the card's name, rarity, faction and type, ATK (current and printed when they differ), HP
 * Contribution where it applies, every effect's full rule under its timing label, what is true of it right now
 * (bonuses and penalties by source, Shield, Silence), and the way to Card Inspect. Card combat has no Card Mastery, so
 * every copy reads as printed; only a historical legacy match can name a legacy Ascension rank.
 * The details come from focusDetails.ts; this component writes no rules text of its own.
 */

export interface FocusAction {
  label: string;
  onClick: () => void;
  icon?: IconName;
  primary?: boolean;
  disabled?: boolean;
}

const onEscape = (close: () => void) => (e: KeyboardEvent<HTMLElement>) => {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  close();
};

const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
const LANE_NAME = { left: 'left', center: 'center', right: 'right' } as const;

function changeText(change: FocusAtkChange): string {
  const lasts = change.lasts === 'round' ? ' this round' : '';
  const tail = change.lasts === 'spell' ? ', while it stays' : change.lasts === 'aura' ? (change.source === 'its own effect' ? ', while that holds' : ', while it is in play') : '';
  return `${signed(change.amount)} ATK${lasts} from ${change.source}${tail}`;
}

/** "Current bonus" (all gains), "Current penalty" (all losses), or "Current changes" (both). */
function changesLabel(changes: FocusAtkChange[]): string {
  const up = changes.every((c) => c.amount > 0);
  const down = changes.every((c) => c.amount < 0);
  const plural = changes.length > 1;
  return up ? `Current bonus${plural ? 'es' : ''}` : down ? `Current penalt${plural ? 'ies' : 'y'}` : 'Current changes';
}

const STATUS_TEXT: Record<string, string> = {
  Shield: 'Shield (survives the next time it would be destroyed)',
};
const ENTERED_TEXT = { revived: 'Revived', summoned: 'Summoned', entered: 'Entered' } as const;

/** A historical legacy match only: the legacy Ascension effects the copy plays there. Never shown in card combat. */
function masteryText(details: FocusDetails): string | null {
  if (details.rules !== 'legacy' || details.kind !== 'unit' || details.masteryRank < 1) return null;
  return details.effects.some((e) => e.mastery) ? 'Legacy Ascension: adds the effects marked Mastery.' : null;
}

export function CardFocusPanel({
  details,
  layout,
  onClose,
  onInspect,
  side,
  actions = [],
}: {
  details: FocusDetails;
  layout: 'dock' | 'sheet';
  onClose: () => void;
  onInspect: () => void;
  /** The sheet's card face (CardFocusSheet passes the real card); the dock draws its own art and stats. */
  side?: ReactNode;
  /** Sheet only: what the screen lets you do with the card (add it to a deck, ...), beside Inspect. */
  actions?: FocusAction[];
}) {
  const card = getCard(details.cardId);
  const unit = details.kind === 'unit';
  const shift = unit && details.atk !== undefined && details.printedAtk !== undefined ? (details.atk > details.printedAtk ? 'up' : details.atk < details.printedAtk ? 'down' : '') : '';
  const inBattle = details.place !== 'card';
  const where = !inBattle
    ? ''
    : details.place === 'hand'
      ? 'In your hand'
      : `${details.owner === 'player' ? 'Your' : 'Enemy'} ${details.place === 'spellZone' ? 'Spell, ' : ''}${details.lane ? `${LANE_NAME[details.lane]} lane` : ''}`;
  const entered = details.entered && `${ENTERED_TEXT[details.entered.how]} at ${details.entered.atk} ATK${details.changes.length === 0 ? ` (printed ${details.printedAtk})` : ''}`;
  const status = [...(entered ? [entered] : []), ...details.status.map((s) => STATUS_TEXT[s] ?? s)];
  const lane = details.laneUnits;
  const mastery = masteryText(details);
  // A card whose rules don't fit sets them a little tighter; if they still don't, they scroll, and fade out at the
  // bottom while there is more below. A newly picked card starts at the top of its rules.
  const main = useRef<HTMLDivElement>(null);
  const key = `${details.cardId}|${details.owner}|${details.place}|${details.lane}`;
  const [fit, setFit] = useState({ key, tight: false });
  const tight = fit.key === key && fit.tight;
  const [more, setMore] = useState(false);
  const measure = (el: HTMLDivElement) => setMore(el.scrollHeight > el.clientHeight + el.scrollTop + 1);
  useLayoutEffect(() => {
    if (main.current) main.current.scrollTop = 0;
  }, [key]);
  useLayoutEffect(() => {
    const el = main.current;
    if (!el) return;
    if (layout === 'dock' && !tight && el.scrollHeight > el.clientHeight + 1) setFit({ key, tight: true });
    else setMore(el.scrollHeight > el.clientHeight + el.scrollTop + 1);
  }, [details, key, tight, layout]);

  const atkLabel = details.atk !== undefined ? `${details.atk} ATK${shift ? `, printed ${details.printedAtk}` : ''}` : '';

  return (
    <section
      className={`card-focus cf-${layout} ${layout === 'dock' ? 'battle-dock' : ''} ${details.owner} ${details.place} r-${card.rarity}`}
      data-fit={tight ? 'tight' : 'base'}
      role="dialog"
      aria-label={`${details.name}${where ? `, ${where}` : ''}`}
      onKeyDown={onEscape(onClose)}
    >
      <div className="cf-side">
        {side ?? (
          <>
            <span className={`cf-art r-${card.rarity} ${card.faction}`}>
              <CardArtwork cardId={details.cardId} animated={false} />
              {details.owner === 'enemy' && <span className="cf-owner">Enemy</span>}
            </span>
            <span className="cf-side-stats">
              {unit ? (
                <>
                  <span className={`cf-atk ${shift}`} aria-label={atkLabel}>
                    <span className="cf-stat-label">ATK</span>
                    <strong>{details.atk}</strong>
                  </span>
                  {details.hpContribution !== undefined && (
                    <span className="cf-hpc" title="HP Contribution: what this card added to its player's Starting HP" aria-label={`HP Contribution +${details.hpContribution}`}>
                      <span className="cf-stat-label">HP</span>+{details.hpContribution}
                    </span>
                  )}
                </>
              ) : (
                <span className="cf-kind">{details.kind === 'continuous' ? 'Continuous Spell' : details.kind === 'attached' ? 'Attached Spell' : 'Spell'}</span>
              )}
            </span>
          </>
        )}
      </div>
      <div className={`cf-main ${more ? 'has-more' : ''}`} ref={main} onScroll={(e) => measure(e.currentTarget)}>
        <header className="cf-head">
          <h2 className={`cf-name r-${card.rarity}`}>{details.name}</h2>
          {layout === 'dock' && (
            <button type="button" className="cf-inspect" onClick={onInspect} aria-label={`Inspect ${details.name}`}>
              Inspect
            </button>
          )}
          <button type="button" className="cf-close" onClick={onClose} aria-label="Close card details">
            <Icon name="close" size={13} />
          </button>
        </header>
        {layout === 'sheet' && <p className="cf-identity">{cardIdentity(card)}</p>}
        {layout === 'sheet' && unit && (
          <p className="cf-statline">
            <span className={`cf-atk ${shift}`} aria-label={atkLabel}>
              <span className="cf-stat-label">ATK</span> <strong>{details.atk}</strong>
            </span>
            {shift && <span className="cf-printed">printed {details.printedAtk}</span>}
            {details.hpContribution !== undefined && (
              <span className="cf-hpc" aria-label={`HP Contribution +${details.hpContribution}`}>
                <span className="cf-stat-label">HP Contribution</span> <strong>+{details.hpContribution}</strong>
              </span>
            )}
          </p>
        )}
        <ul className="cf-effects">
          {details.effects.length === 0 && <li className="cf-none">No effect.</li>}
          {details.effects.map((effect, i) => (
            <li key={i} className={effect.active === false ? 'is-off' : ''}>
              <span className="cf-label">
                {effect.active !== undefined && <span className={`cf-dot ${effect.active ? 'on' : 'off'}`} aria-hidden="true" />}
                {effect.label}:
              </span>{' '}
              {effect.text}
              {(effect.oncePerRound || effect.mastery) && (
                <span className="cf-tags">
                  {effect.oncePerRound && ' Once per round.'}
                  {effect.mastery && <span className="cf-tag-mastery"> Mastery.</span>}
                </span>
              )}
              {effect.active !== undefined && <span className={`cf-state ${effect.active ? 'on' : 'off'}`}> {effect.active ? 'Active now.' : 'Not active now.'}</span>}
            </li>
          ))}
        </ul>
        {details.changes.length > 0 && (
          <p className="cf-now">
            <span className="cf-label">{changesLabel(details.changes)}:</span> {details.changes.map(changeText).join('; ')}
            {shift && layout === 'dock' && <span className="cf-printed"> (printed {details.printedAtk})</span>}.
          </p>
        )}
        {status.length > 0 && (
          <p className="cf-now">
            <span className="cf-label">Status:</span> {status.join('; ')}.
          </p>
        )}
        {details.attachedTo && (
          <p className="cf-now">
            <span className="cf-label">Attached to:</span> {details.attachedTo}. It goes to the Graveyard when that Unit leaves play.
          </p>
        )}
        {lane && (lane.yours || lane.theirs) && (
          <p className="cf-now">
            <span className="cf-label">In this lane:</span> {[lane.yours && `your ${lane.yours}`, lane.theirs && `enemy ${lane.theirs}`].filter(Boolean).join(', ')}.
          </p>
        )}
        {mastery && (
          <p className="cf-now cf-mastery">
            <span className="cf-label">Mastery:</span> {mastery}
          </p>
        )}
        {layout === 'sheet' && (
          <div className="cf-actions">
            {actions.map((action) => (
              <button type="button" key={action.label} className={`cf-action ${action.primary ? 'primary' : ''}`} onClick={action.onClick} disabled={action.disabled}>
                {action.icon && <Icon name={action.icon} size={14} />}
                {action.label}
              </button>
            ))}
            <button type="button" className="cf-action inspect" onClick={onInspect}>
              <Icon name="help" size={14} />
              Inspect
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
