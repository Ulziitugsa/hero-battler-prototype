import type { CardMasteryView } from '../../game/cardMastery/model';

/** Five Card Mastery pips (Mastery I-V). Replaces the retired Star readout; reuses its strip styling. */
export function MasteryPips({ view, size = 12 }: { view: CardMasteryView; size?: number }) {
  if (!view.owned) return null;
  return (
    <span className="star-strip mastery-pips" aria-label={`${view.label}, ${view.pips.filled} of ${view.pips.total}`}>
      {Array.from({ length: view.pips.total }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" className={i < view.pips.filled ? 'on' : ''} aria-hidden="true">
          <path d="M12 2 20 12 12 22 4 12Z" />
        </svg>
      ))}
    </span>
  );
}
