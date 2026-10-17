import { useMemo, useState } from 'react';
import type { LabLayerView } from '../pages/GamePage';
import { useReducedMotion } from '../components/animation/timing';
import { labMoments, type LabMoment, type MomentKind } from './moments';

// Card Discovery Lab: the key-moment layer over the battle board. While a round resolves, the latest moment appears as a
// short callout on the band between the two rows (so no Unit is covered) the instant playback reaches the events it
// describes, naming the card responsible. Between rounds, a pill keeps the last round's moments a tap away. Everything
// shown comes from labMoments over the resolver's events.

const ICON: Record<MomentKind, string> = {
  chain: '⛓',
  echo: '⟳',
  removal: '✕',
  sacrifice: '✝',
  deathLine: '☠',
  revive: '↑',
  turned: '⇄',
  immune: '◇',
  bypass: '➚',
  token: '+',
  shield: '◈',
  prevented: '◈',
  burst: '✹',
  swing: '±',
  returned: '↩',
};

const WHOSE: Record<'player' | 'enemy', string> = { player: 'Your', enemy: 'Enemy' };

function Moment({ moment, compact = false }: { moment: LabMoment; compact?: boolean }) {
  return (
    <div className={`lab-moment lab-moment-${moment.side}${compact ? ' compact' : ''}`} data-kind={moment.kind}>
      <span className="lab-moment-icon" aria-hidden="true">{ICON[moment.kind]}</span>
      <span className="lab-moment-body">
        <span className="lab-moment-title">
          <b>{moment.title}</b>
          <span className="lab-moment-source">{WHOSE[moment.side]} {moment.source}</span>
        </span>
        <span className="lab-moment-detail">{moment.detail}</span>
      </span>
    </div>
  );
}

export function LabMomentsLayer({ view }: { view: LabLayerView }) {
  const reducedMotion = useReducedMotion();
  const moments = useMemo(() => labMoments(view.events, view.base), [view.events, view.base]);
  const [openFor, setOpenFor] = useState<readonly unknown[] | null>(null);
  const shown = moments.filter((m) => m.until <= view.revealedUntil);
  const open = openFor === view.events && !view.resolving;
  return (
    <div className={`lab-layer${reducedMotion ? ' reduced-motion' : ''}`}>
      {view.resolving && shown.length > 0 && (
        <div className="lab-callouts" role="status" aria-live="polite">
          {shown.slice(-1).map((m) => (
            <Moment key={m.key} moment={m} />
          ))}
        </div>
      )}
      {!view.resolving && moments.length > 0 && (
        <button type="button" className="lab-moments-pill" aria-expanded={open} onClick={() => setOpenFor(open ? null : view.events)}>
          ✦ Round {view.round - 1}: {moments.length} key moment{moments.length > 1 ? 's' : ''}
        </button>
      )}
      {open && (
        <div className="lab-moments-sheet" role="dialog" aria-label={`Round ${view.round - 1} key moments`}>
          <div className="lab-moments-sheet-head">
            <b>Round {view.round - 1} key moments</b>
            <button type="button" onClick={() => setOpenFor(null)} aria-label="Close key moments">✕</button>
          </div>
          <div className="lab-moments-list">
            {moments.map((m) => (
              <Moment key={m.key} moment={m} compact />
            ))}
          </div>
          <p className="lab-moments-foot">From this round’s combat events. The Log has every line.</p>
        </div>
      )}
    </div>
  );
}
