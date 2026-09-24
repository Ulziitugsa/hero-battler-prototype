import { MAX_STARS } from '../../game/ascension/stars';

/** Five carved star marks - the duplicate-progression readout (see game/ascension/stars.ts). Renders
 * nothing for 0 stars so an unowned or freshly-owned card doesn't show an empty row. */
export function StarStrip({ stars, size = 12 }: { stars: number; size?: number }) {
  if (stars <= 0) return null;
  return (
    <span className="star-strip" aria-label={`${stars} of ${MAX_STARS} stars`}>
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" className={i < stars ? 'on' : ''} aria-hidden="true">
          <path d="M12 2.5 14.9 9.1 22 9.9 16.7 14.7 18.3 21.7 12 18 5.7 21.7 7.3 14.7 2 9.9 9.1 9.1 12 2.5Z" />
        </svg>
      ))}
    </span>
  );
}
