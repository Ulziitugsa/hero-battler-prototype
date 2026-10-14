import type { RoundBannerSpec } from './bannerSpecs';

/**
 * The moment between phases: "Round 2 · Deploy" as a round opens, "Fight!" as the cards are revealed. A ribbon across
 * the middle of the battlefield that never takes a tap and never holds up play: the round runs on its own clock
 * underneath it (GamePage owns when it shows; styles/feedback/battle.css owns how).
 */
export function RoundBanner({ banner }: { banner: RoundBannerSpec | null }) {
  if (!banner) return null;
  return (
    <div key={banner.key} className={`mw-round-banner ${banner.tone}`} style={{ ['--mw-banner-ms' as string]: `${banner.ms}ms` }} role="status" aria-live="polite">
      <span className="mw-round-banner-ribbon">
        <strong>{banner.title}</strong>
        {banner.subtitle && <small>{banner.subtitle}</small>}
      </span>
    </div>
  );
}
