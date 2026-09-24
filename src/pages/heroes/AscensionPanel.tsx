import { useState } from 'react';
import type { CardDefinition } from '../../game/types';
import { Icon } from '../../components/Icon';
import { useCollection } from '../../game/collection/useCollection';
import { useAscension } from '../../game/ascension/useAscension';
import { ascendCard, ascensionLabel, getAscensionStatus } from '../../game/ascension/ascend';
import { getCardAscension } from '../../game/ascension/definitions';
import { starsForNextRank } from '../../game/ascension/stars';
import { StarStrip } from './StarStrip';
import '../../styles/ascension.css';

/** Three carved marks showing how far a card has Ascended. */
export function AscensionPips({ rank, max }: { rank: number; max: number }) {
  return (
    <span className="asc-pips" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < rank ? 'on' : ''} />
      ))}
    </span>
  );
}

/**
 * The Ascension section of an OWNED card's detail sheet: current rank, copies, the next rank's concise
 * change and cost, and one Ascend button with a single inline confirmation. Missing cards don't render
 * it; cards without an Ascension path say so in one quiet line. Every number comes from
 * game/ascension - this component decides nothing.
 */
export function AscensionPanel({ card }: { card: CardDefinition }) {
  const owned = useCollection();
  const ascension = useAscension();
  const [confirming, setConfirming] = useState(false);
  const status = getAscensionStatus(card.id, owned, ascension);
  const def = getCardAscension(card.id);

  if (!status.supported || !def) return <p className="asc-later">Ascension coming later.</p>;

  const nextDef = status.nextRank ? def.ranks[status.nextRank - 1] : null;

  return (
    <section className="asc-panel" aria-label="Ascension">
      <div className="asc-head">
        <span className="asc-title">
          <AscensionPips rank={status.rank} max={status.maxRank} />
          {ascensionLabel(status.rank)}
          {status.nextRank === null && <em>Max</em>}
        </span>
        <span className="asc-copies">
          ×{status.owned} · {status.spare} spare
        </span>
      </div>

      {nextDef && status.cost !== null && (
        <>
          <p className="asc-next">
            <strong>
              {ascensionLabel(nextDef.rank)} · {nextDef.name}
            </strong>
            <span>{nextDef.summary}</span>
            {(() => {
              const nextStars = starsForNextRank(card.id);
              return nextStars !== null ? (
                <span className="asc-next-stars">
                  <StarStrip stars={nextStars} size={11} /> at {ascensionLabel(nextDef.rank)}
                </span>
              ) : null;
            })()}
          </p>

          {confirming ? (
            <div className="asc-confirm" role="alertdialog" aria-label="Confirm Ascension">
              <span>
                Ascend {card.shortName} to {ascensionLabel(nextDef.rank)}? Consumes {status.cost} duplicate {status.cost === 1 ? 'copy' : 'copies'}.
              </span>
              <span className="asc-confirm-btns">
                <button type="button" className="asc-btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="asc-btn gold"
                  onClick={() => {
                    ascendCard(card.id);
                    setConfirming(false);
                  }}
                >
                  Confirm
                </button>
              </span>
            </div>
          ) : (
            <button type="button" className={`asc-btn wide ${status.canAscend ? 'gold' : ''}`} disabled={!status.canAscend} onClick={() => setConfirming(true)}>
              <Icon name={status.canAscend ? 'power' : 'lock'} size={14} />
              Ascend · {status.cost} {status.cost === 1 ? 'duplicate' : 'duplicates'}
            </button>
          )}
          {!status.canAscend && status.reason && <p className="asc-reason">{status.reason}</p>}
        </>
      )}
    </section>
  );
}
