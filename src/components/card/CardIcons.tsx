// Production stat glyphs for card faces. Solid shapes (not strokes) so they stay legible at 9-10px on a
// battle chit, and deliberately different silhouettes: a diagonal blade for ATK, a round heart for HP.

/** ATK: a longsword laid on the diagonal, with a fuller cut into the blade. */
export function AtkIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`card-glyph card-glyph-atk ${className}`} aria-hidden="true" focusable="false">
      <g transform="rotate(45 12 12)" fill="currentColor" fillRule="evenodd">
        <path d="M12 .8 14 3.6V15h-4V3.6L12 .8ZM11.45 4.2v9.6h1.1V4.2h-1.1Z" />
        <path d="M5.8 15h12.4a.9.9 0 0 1 .9.9v.3a.9.9 0 0 1-.9.9H5.8a.9.9 0 0 1-.9-.9v-.3a.9.9 0 0 1 .9-.9Z" />
        <path d="M10.9 17.1h2.2v3.3h-2.2z" />
        <circle cx="12" cy="21.6" r="1.7" />
      </g>
    </svg>
  );
}

/** HP Contribution: a heart with a plus cut out of it - "adds to your HP". */
export function HpIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`card-glyph card-glyph-hp ${className}`} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12 21.4C5.1 16.7 1.8 13 1.8 8.7 1.8 5.5 4.3 3 7.3 3c1.9 0 3.6 1 4.7 2.6C13.1 4 14.8 3 16.7 3c3 0 5.5 2.5 5.5 5.7 0 4.3-3.3 8-10.2 12.7ZM10.9 7.6v2.7H8.2v2.2h2.7v2.7h2.2v-2.7h2.7v-2.2h-2.7V7.6h-2.2Z"
      />
    </svg>
  );
}

/** Effect indicator: a four-point moon star. Shown on compact faces that have an effect; tap for the exact text. */
export function EffectIcon({ size = 12, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`card-glyph card-glyph-effect ${className}`} aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12 1.5c.7 5.6 3.4 8.8 10.5 10.5-7.1 1.7-9.8 4.9-10.5 10.5C11.3 16.9 8.6 13.7 1.5 12 8.6 10.3 11.3 7.1 12 1.5Z" />
    </svg>
  );
}
