// Favorite mark for the Deck Builder. Local inline glyph (not an Icon.tsx entry) so this thread does
// not touch the shared icon set; move it into Icon.tsx during integration if other screens need it.
export function FavoriteStar({ filled, size = 14 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 3.2 14.6 8.7l6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9L3.4 9.5l6-.8L12 3.2Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}
