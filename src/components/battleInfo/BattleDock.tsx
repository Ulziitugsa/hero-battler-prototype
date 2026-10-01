import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../Icon';
import type { BattleLogEntry } from './battleLog';
import '../../styles/battleDock.css';

/**
 * The dock over the battle's hand apron. It holds, one at a time:
 *  - the focus panel: the shared focused card detail (card/CardFocusPanel.tsx, layout 'dock') for the card a tap picked
 *    out, in hand, on either board or in a Spell zone;
 *  - the battle log (below): what each effect and clash did, live while a round resolves and on demand between rounds.
 * Between rounds the hand slides down and stays a tap away under the dock, so the board, the Fight seal and both HP
 * bars are never covered. Both are non-modal dialogs: Android Back (App.tsx sends the top dialog an Escape) closes them
 * instead of leaving the battle.
 */

const onEscape = (close: () => void) => (e: KeyboardEvent<HTMLElement>) => {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  close();
};

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
