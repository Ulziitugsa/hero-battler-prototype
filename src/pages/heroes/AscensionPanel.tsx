import { useEffect, useState } from 'react';
import type { CardDefinition } from '../../game/types';
import { Icon } from '../../components/Icon';
import { useCollection } from '../../game/collection/useCollection';
import { useAscension } from '../../game/ascension/useAscension';
import { ascendCard, ascensionLabel, getAscensionStatus } from '../../game/ascension/ascend';
import { getCardAscension } from '../../game/ascension/definitions';
import { getAscensionRank } from '../../game/ascension/store';
import { getHeroLevel } from '../../game/heroLevel/store';
import { rosterPowerForHero } from '../../game/heroLevel/rosterPower';
import { starsForCard, starsForNextRank } from '../../game/ascension/stars';
import { StarStrip } from './StarStrip';
import { RewardFeedback } from '../../components/RewardFeedback';
import { track } from '../../analytics/track';
import '../../styles/ascension.css';
import { haptics } from '../../platform/haptics';

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
export function AscensionPanel({ card, priority = false }: { card: CardDefinition; priority?: boolean }) {
  const owned = useCollection();
  const ascension = useAscension();
  const [confirming, setConfirming] = useState(false);
  const [ascending, setAscending] = useState(false);
  const [feedback, setFeedback] = useState<{ rank: number; stars: number; power: number; improvement: string } | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 1100);
    return () => window.clearTimeout(timeout);
  }, [feedback]);
  const status = getAscensionStatus(card.id, owned, ascension);
  const def = getCardAscension(card.id);
  const nextDef = status.nextRank && def ? def.ranks[status.nextRank - 1] : null;
  const level = getHeroLevel(card.id);
  const rank = getAscensionRank(card.id);
  const rosterGain = nextDef ? rosterPowerForHero(card.power ?? 0, level, rank + 1) - rosterPowerForHero(card.power ?? 0, level, rank) : 0;
  const improvement = nextDef?.summary ?? 'Hero strengthened';

  useEffect(() => {
    if (!ascending) return;
    const timeout = window.setTimeout(() => {
      const result = ascendCard(card.id);
      if (result.ok) {
        void haptics.ascension();
        const stars = starsForCard(card.id);
        setFeedback({ rank: result.newRank, stars, power: rosterGain, improvement });
        track('milestone_animation_shown', { milestone: 'ascension', heroId: card.id, rank: result.newRank });
      }
      setAscending(false);
      setConfirming(false);
    }, 240);
    return () => window.clearTimeout(timeout);
  }, [ascending, card.id, rosterGain, improvement]);

  if (!status.supported || !def) return <p className="asc-later">Ascension coming later.</p>;

  return (
    <section className={`asc-panel ascension-panel ${priority ? 'progression-primary' : ''} ${feedback ? 'ascension-flare' : ''}`} aria-label="Ascension">
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
      {feedback && <RewardFeedback tone="major" detail={`Ascension ${feedback.rank} · ${feedback.stars} of 5 Stars · ${feedback.improvement}`}>Roster Power +{feedback.power}</RewardFeedback>}
      {ascending && <p className="ascension-sequence-status" role="status">The sigil answers…</p>}

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
            <span className="asc-roster-change">Adds <strong>+{rosterGain} Roster Power</strong> toward Campaign strength.</span>
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
                  disabled={ascending}
                  onClick={() => setAscending(true)}
                >
                  {ascending ? 'Ascending…' : 'Confirm'}
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
