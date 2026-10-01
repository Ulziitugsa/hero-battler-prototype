import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { getCard } from '../../game/cards';
import { CardArtwork } from '../CardArtwork';
import { Icon } from '../Icon';
import type { BattleLogEntry } from './battleLog';
import type { FocusAtkChange, FocusDetails } from './focusDetails';
import '../../styles/battleDock.css';

/**
 * The dock over card combat's hand apron (Info layers pass). It holds the two layers between a card's face and Card
 * Inspect, one at a time:
 *  - the focus panel: the card a tap picked out (in hand, on either board, in a Spell zone), larger art, ATK and HP
 *    Contribution, every effect's full rule, and what is true of it right now;
 *  - the battle log: what each effect and clash did, live while a round resolves and on demand between rounds.
 * Between rounds the hand slides down and stays a tap away under the dock, so the board, the Fight seal and both HP
 * bars are never covered. Both are non-modal dialogs: Android Back (App.tsx sends the top dialog an Escape) closes them
 * instead of leaving the battle.
 */

const onEscape = (close: () => void) => (e: KeyboardEvent<HTMLElement>) => {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  close();
};

const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
const LANE_NAME = { left: 'left', center: 'center', right: 'right' } as const;

function changeText(change: FocusAtkChange): string {
  const lasts = change.lasts === 'round' ? ' this round' : '';
  const tail = change.lasts === 'spell' ? ', while it stays' : '';
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

export function BattleFocusPanel({ details, onClose, onInspect }: { details: FocusDetails; onClose: () => void; onInspect: () => void }) {
  const card = getCard(details.cardId);
  const unit = details.kind === 'unit';
  const shift = unit && details.atk !== undefined && details.printedAtk !== undefined ? (details.atk > details.printedAtk ? 'up' : details.atk < details.printedAtk ? 'down' : '') : '';
  const where =
    details.place === 'hand' ? 'In your hand' : `${details.owner === 'player' ? 'Your' : 'Enemy'} ${details.place === 'spellZone' ? 'Spell, ' : ''}${details.lane ? `${LANE_NAME[details.lane]} lane` : ''}`;
  const entered = details.entered && `${ENTERED_TEXT[details.entered.how]} at ${details.entered.atk} ATK${details.changes.length === 0 ? ` (printed ${details.printedAtk})` : ''}`;
  const status = [...(entered ? [entered] : []), ...details.status.map((s) => STATUS_TEXT[s] ?? s)];
  const lane = details.laneUnits;
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
    if (!tight && el.scrollHeight > el.clientHeight + 1) setFit({ key, tight: true });
    else setMore(el.scrollHeight > el.clientHeight + el.scrollTop + 1);
  }, [details, key, tight]);
  return (
    <section className={`battle-dock bd-focus ${details.owner} ${details.place}`} data-fit={tight ? 'tight' : 'base'} role="dialog" aria-label={`${details.name}, ${where}`} onKeyDown={onEscape(onClose)}>
      <div className="bd-side">
        <span className={`bd-art r-${card.rarity} ${card.faction}`}>
          <CardArtwork cardId={details.cardId} animated={false} />
          {details.owner === 'enemy' && <span className="bd-owner">Enemy</span>}
        </span>
        <span className="bd-stats">
          {unit ? (
            <>
              <span className={`bd-atk ${shift}`} aria-label={`${details.atk} ATK${shift ? `, printed ${details.printedAtk}` : ''}`}>
                <span className="bd-stat-label">ATK</span>
                <strong>{details.atk}</strong>
              </span>
              {details.hpContribution !== undefined && (
                <span className="bd-hpc" title="HP Contribution: what this card added to its player's Starting HP" aria-label={`HP Contribution +${details.hpContribution}`}>
                  <span className="bd-stat-label">HP</span>+{details.hpContribution}
                </span>
              )}
            </>
          ) : (
            <span className="bd-kind">{details.kind === 'continuous' ? 'Continuous Spell' : 'Spell'}</span>
          )}
        </span>
      </div>
      <div className={`bd-main ${more ? 'has-more' : ''}`} ref={main} onScroll={(e) => measure(e.currentTarget)}>
        <header className="bd-head">
          <h2 className={`bd-name r-${card.rarity}`}>{details.name}</h2>
          <button type="button" className="bd-inspect" onClick={onInspect} aria-label={`Inspect ${details.name}`}>
            Inspect
          </button>
          <button type="button" className="bd-close" onClick={onClose} aria-label="Close card details">
            <Icon name="close" size={13} />
          </button>
        </header>
        <ul className="bd-effects">
          {details.effects.length === 0 && <li className="bd-none">No effect.</li>}
          {details.effects.map((effect, i) => (
            <li key={i} className={effect.active === false ? 'is-off' : ''}>
              <span className="bd-label">
                {effect.active !== undefined && <span className={`bd-dot ${effect.active ? 'on' : 'off'}`} aria-hidden="true" />}
                {effect.chip}:
              </span>{' '}
              {effect.text}
              {effect.active !== undefined && <span className={`bd-state ${effect.active ? 'on' : 'off'}`}> {effect.active ? 'Active now.' : 'Not active now.'}</span>}
            </li>
          ))}
        </ul>
        {details.changes.length > 0 && (
          <p className="bd-now">
            <span className="bd-label">{changesLabel(details.changes)}:</span> {details.changes.map(changeText).join('; ')}
            {shift && <span className="bd-printed"> (printed {details.printedAtk})</span>}.
          </p>
        )}
        {status.length > 0 && (
          <p className="bd-now">
            <span className="bd-label">Status:</span> {status.join('; ')}.
          </p>
        )}
        {lane && (lane.yours || lane.theirs) && (
          <p className="bd-now">
            <span className="bd-label">In this lane:</span> {[lane.yours && `your ${lane.yours}`, lane.theirs && `enemy ${lane.theirs}`].filter(Boolean).join(', ')}.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * The battle log. `live` while a round resolves: it fills in step by step under the round's number and has no close
 * button (the hand is away anyway). Between rounds it is the whole match so far, newest at the bottom.
 */
export function BattleLogPanel({ entries, live, round, onClose }: { entries: BattleLogEntry[]; live: boolean; round?: number; onClose?: () => void }) {
  const list = useRef<HTMLOListElement>(null);
  // Older lines fade out under the header once the list has scrolled.
  const [scrolled, setScrolled] = useState(false);
  // Keep the newest line in view as lines arrive.
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setScrolled(el.scrollTop > 0);
  }, [entries.length]);
  return (
    <section className={`battle-dock bd-log ${live ? 'live' : ''}`} role={live ? 'log' : 'dialog'} aria-label="Battle log" onKeyDown={onClose && onEscape(onClose)}>
      <header className="bd-log-head">
        <span className="bd-log-title">{live && round ? `Round ${round}` : 'Battle log'}</span>
        <span className="bd-log-sub">{live ? 'Resolving' : 'Newest at the bottom'}</span>
        {onClose && (
          <button type="button" className="bd-close" onClick={onClose} aria-label="Close battle log">
            <Icon name="close" size={13} />
          </button>
        )}
      </header>
      <ol className={`bd-log-list ${scrolled ? 'is-scrolled' : ''}`} ref={list} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}>
        {entries.length === 0 && <li className="bd-log-empty">{live ? 'Cards reveal…' : 'Nothing yet. Each effect and clash is listed here as rounds resolve.'}</li>}
        {entries.map((entry) =>
          entry.kind === 'round' ? (
            <li key={entry.key} className="bd-log-round">
              <span>{entry.who}</span>
            </li>
          ) : (
            <li key={entry.key} className={`bd-log-row ${entry.side ?? 'neutral'} ${entry.kind}`}>
              <b className="bd-log-who">{entry.who}</b>
              <span className="bd-log-dash"> — </span>
              {entry.label && <span className="bd-log-label">{entry.label}: </span>}
              <span className="bd-log-text">{entry.text}</span>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
