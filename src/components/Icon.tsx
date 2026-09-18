// A small, hand-authored line-icon set (24x24, stroke-based, currentColor) - deliberately not an
// external icon library dependency. Covers exactly the icons this app's UI needs; add new names here
// rather than reaching for emoji or unicode glyphs, so the whole app reads as one consistent language.

export type IconName =
  | 'home'
  | 'battle'
  | 'heroes'
  | 'decks'
  | 'profile'
  | 'settings'
  | 'search'
  | 'filter'
  | 'back'
  | 'close'
  | 'help'
  | 'edit'
  | 'hero'
  | 'spell'
  | 'continuousSpell'
  | 'power'
  | 'hp'
  | 'graveyard'
  | 'deck'
  | 'check'
  | 'warning'
  | 'trophy'
  | 'plus'
  | 'minus'
  | 'bug'
  | 'mute'
  | 'cards'
  | 'lock'
  | 'sort'
  | 'ember';

const PATHS: Record<IconName, string> = {
  home: 'M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9',
  battle: 'M6.5 17.5 17 7M14 4l6 2-2 6-2-2-3 3-3-3 3-3-2-2ZM4 20l3.5-3.5',
  heroes: 'M12 3 4 6.5v5C4 16 7.5 19.5 12 21c4.5-1.5 8-5 8-9.5v-5L12 3ZM12 8v6M9 11h6',
  decks: 'M6 8.5 12 5l6 3.5-6 3.5-6-3.5ZM6 13l6 3.5L18 13M6 17l6 3.5L18 17',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V19.5a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87A1.7 1.7 0 0 0 3.09 12.5H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V.5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4.35-4.35',
  filter: 'M4 5h16M7 12h10M10 19h4',
  back: 'M15 6l-6 6 6 6',
  close: 'M6 6l12 12M18 6 6 18',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.2a2.5 2.5 0 1 1 3.75 2.16c-.83.5-1.25.9-1.25 1.9M12 17h.01',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3ZM14 6l3 3',
  hero: 'M12 3 5 6.5V12c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6.5L12 3Z',
  spell: 'M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  continuousSpell: 'M8 12a4 4 0 1 1 8 0 4 4 0 0 1-8 0ZM12 2a10 10 0 1 0 8.66 5M20 2v5h-5',
  power: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z',
  hp: 'M12 20.5s-7.5-4.6-9.7-9C.7 8 2 4.5 5.3 4c2-.3 3.7.7 4.7 2.2C11 4.7 12.7 3.7 14.7 4c3.3.5 4.6 4 3 7.5-2.2 4.4-9.7 9-9.7 9Z',
  graveyard: 'M7 21V11a5 5 0 0 1 10 0v10M4 21h16M9 14h2M9 17h2',
  deck: 'M6 9.5 12 6l6 3.5v5L12 18l-6-3.5v-5ZM12 6v12',
  check: 'M5 12.5 10 17l9-10',
  warning: 'M12 3 2 20h20L12 3ZM12 10v4M12 17h.01',
  trophy: 'M8 4h8v4a4 4 0 0 1-8 0V4ZM8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4M10 15h4v3h-4zM8 21h8',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  bug: 'M8 6l-2-2M16 6l2-2M9 9h6M6 12h12M6 15h12M8 21l-1.5-3M16 21l1.5-3M9 3.5a3 3 0 0 1 6 0V6H9V3.5ZM7 9v9a5 5 0 0 0 10 0V9',
  mute: 'M11 5 6 9H3v6h3l5 4V5ZM16 9l6 6M22 9l-6 6',
  cards: 'M6 8.5 12 5l6 3.5-6 3.5-6-3.5ZM6 14 12 17.5 18 14',
  lock: 'M6.5 10.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1ZM8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7M12 14v2.5',
  sort: 'M7 20V5M7 5 4 8.5M7 5l3 3.5M17 4v15M17 19l3-3.5M17 19l-3-3.5',
  ember: 'M12 3c1.2 3.2 4.5 4.4 4.5 8a4.5 4.5 0 0 1-9 0c0-2 1.2-2.8 1.2-4.6',
};

/** `filled` swaps to a solid fill with no stroke - used for small glyphs (e.g. the HP heart) sitting
 * on a dark plate, where a filled shape reads better at tiny sizes than a stroked outline. */
export function Icon({ name, size = 18, className = '', filled = false }: { name: IconName; size?: number; className?: string; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
