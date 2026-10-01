import { useEffect, useState } from 'react';
import type { CardDefinition } from '../../game/types';
import { Icon } from '../../components/Icon';
import { useCollection } from '../../game/collection/useCollection';
import { useAscension } from '../../game/ascension/useAscension';
import { useEconomy } from '../../game/economy/useEconomy';
import { ascendCard, ascensionLabel, getAscensionStatus } from '../../game/ascension/ascend';
import { hpContributionAt, MASTERY_HPC_PCT } from '../../game/cardCombat/stats';
import { stageFromAscensionRank } from '../../game/cardMastery/model';
import { RewardFeedback } from '../../components/RewardFeedback';
import { track } from '../../analytics/track';
import '../../styles/ascension.css';
import { haptics } from '../../platform/haptics';

/** Carved marks showing current duplicate-funded Card Mastery progress. */
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
 * The Card Mastery action of an owned card's detail sheet: what the next stage does, what it costs (duplicates, plus Gold
 * for Mastery IV and V) and the button. Every number comes from game/ascension - this component decides nothing.
 * A Unit's Mastery raises its HP Contribution only; ATK never changes. A Spell's Mastery is a collection mark only.
 */
export function AscensionPanel({ card, priority = false }: { card: CardDefinition; priority?: boolean }) {
  const owned = useCollection();
  const ascension = useAscension();
  const economy = useEconomy();
  const [confirming, setConfirming] = useState(false);
  const [ascending, setAscending] = useState(false);
  const [feedback, setFeedback] = useState<{ rank: number; improvement: string } | null>(null);
  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 1100);
    return () => window.clearTimeout(timeout);
  }, [feedback]);
  const status = getAscensionStatus(card.id, owned, ascension, undefined, economy.gold);
  const unit = card.type === 'hero';
  const nextStage = status.nextRank !== null ? stageFromAscensionRank(status.nextRank) : 0;
  const hpcNow = unit ? hpContributionAt(card, stageFromAscensionRank(status.rank)) : 0;
  const hpcNext = unit && nextStage ? hpContributionAt(card, nextStage) : 0;
  const nextPct = nextStage ? (MASTERY_HPC_PCT[nextStage - 1] ?? 0) : 0;
  const improvement = unit ? `HP Contribution +${nextPct}%` : 'Mastery mark';

  useEffect(() => {
    if (!ascending) return;
    const timeout = window.setTimeout(() => {
      const result = ascendCard(card.id);
      if (result.ok) {
        void haptics.ascension();
        setFeedback({ rank: result.newRank, improvement });
        track('milestone_animation_shown', { milestone: 'ascension', heroId: card.id, rank: result.newRank });
      }
      setAscending(false);
      setConfirming(false);
    }, 240);
    return () => window.clearTimeout(timeout);
  }, [ascending, card.id, improvement]);

  if (!status.supported) return null;

  const costLine = status.cost !== null ? `${status.cost} duplicate ${status.cost === 1 ? 'copy' : 'copies'}${status.goldCost > 0 ? ` and ${status.goldCost.toLocaleString('en-US')} Gold` : ''}` : '';

  return (
    <section className={`asc-panel ascension-panel ${priority ? 'progression-primary' : ''} ${feedback ? 'ascension-flare' : ''}`} aria-label="Raise Card Mastery">
      <div className="asc-head">
        <span className="asc-title">
          <AscensionPips rank={status.rank + 1} max={status.maxRank + 1} />
          {ascensionLabel(status.rank)}
          {status.nextRank === null && <em>Max</em>}
        </span>
        <span className="asc-copies">
          ×{status.owned} · {status.spare} spare
        </span>
      </div>
      {feedback && <RewardFeedback tone="major" detail={feedback.improvement}>{ascensionLabel(feedback.rank)}</RewardFeedback>}
      {ascending && <p className="ascension-sequence-status" role="status">The sigil answers…</p>}

      {status.nextRank !== null && status.cost !== null && (
        <>
          <p className="asc-next">
            <strong>Next: {ascensionLabel(status.nextRank)}</strong>
            {unit ? (
              <span>
                HP Contribution +{nextPct}% ({hpcNow} → {hpcNext}). ATK never changes.
              </span>
            ) : (
              <span>A Mastery mark for your collection. The Spell plays the same in battle.</span>
            )}
          </p>

          {confirming ? (
            <div className="asc-confirm" role="alertdialog" aria-label="Confirm Card Mastery">
              <span>
                Raise {card.shortName} to {ascensionLabel(status.nextRank)}? Uses {costLine}.
              </span>
              <span className="asc-confirm-btns">
                <button type="button" className="asc-btn" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button type="button" className="asc-btn gold" disabled={ascending} onClick={() => setAscending(true)}>
                  {ascending ? 'Applying…' : 'Confirm'}
                </button>
              </span>
            </div>
          ) : (
            <button type="button" className={`asc-btn wide ${status.canAscend ? 'gold' : ''}`} disabled={!status.canAscend} onClick={() => setConfirming(true)}>
              <Icon name={status.canAscend ? 'power' : 'lock'} size={14} />
              Raise Mastery · {costLine}
            </button>
          )}
          {!status.canAscend && status.reason && <p className="asc-reason">{status.reason}</p>}
        </>
      )}
    </section>
  );
}
