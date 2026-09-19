import type { StarterFaction } from '../cards/starterDecks';

// Prototype banner content: pure data. Pools reference real card ids only (rarity is read from the card),
// so adding a banner is an entry here plus a scene in the UI - no resolution or reveal code changes.
// Banners are permanently available for now; start/end metadata is carried for later scheduling but nothing reads it.

export interface SummonBanner {
  id: string;
  name: string;
  /** One-line hook under the title. */
  tagline: string;
  /** What the banner is about, in a sentence. */
  description: string;
  /** What deck it helps build. */
  builds: string;
  /** Visual identity key: picks the scene, palette and seal motif. */
  faction: StarterFaction;
  cardIds: readonly string[];
  featured: { main: string; secondary: readonly string[] };
  /**
   * Campaign-exclusive cards this banner may deliberately offer anyway. Everything else in the central
   * exclusives list (collection/exclusives.ts) stays un-summonable; validateSummonPool enforces both directions.
   */
  campaignExclusiveExceptions?: readonly string[];
  /** Per-banner override of the base rates. */
  rarityRates?: Record<'common' | 'rare' | 'epic' | 'legendary', number>;
  /** Per-banner override of the base costs. */
  cost?: { single: number; ten: number };
  /** Not read yet - reserved for scheduled banners. */
  availability?: { startsAt?: string; endsAt?: string };
}

export const SUMMON_BANNERS: readonly SummonBanner[] = [
  {
    id: 'royal-vanguard',
    name: 'Royal Vanguard',
    tagline: 'Hold the line.',
    description: 'Shield-bearing Knights and battlefield banners for a formation that never breaks.',
    builds: 'Kingdom · Knights · protection',
    faction: 'kingdom',
    cardIds: [
      'kng-paladin',
      'kng-battle-captain',
      'spl-fortify',
      'kng-royal-guard',
      'kng-light-priest',
      'spl-battle-banner',
      'spl-war-cry',
      'spl-dispel',
      'kng-common-knight',
      'kng-archer',
      'spl-power-surge',
    ],
    featured: { main: 'kng-paladin', secondary: ['kng-battle-captain', 'kng-royal-guard'] },
  },
  {
    id: 'gravebound',
    name: 'Gravebound',
    tagline: 'Nothing stays buried.',
    description: 'The restless dead and the spells that keep them walking - recursion from the graveyard.',
    builds: 'Undead · Graveyard · recursion',
    faction: 'undead',
    cardIds: [
      // Vharos is the only Undead Legendary and is a Campaign boss reward too - offered here on purpose so the banner has a themed chase (see campaignExclusiveExceptions).
      'und-vharos',
      'spl-grave-totem',
      'und-grave-knight',
      'und-dark-priest',
      'spl-raise-fallen',
      'spl-cursed-ground',
      'und-bone-soldier',
      'und-cursed-warrior',
      'spl-second-chance',
    ],
    featured: { main: 'und-vharos', secondary: ['und-grave-knight', 'spl-grave-totem'] },
    campaignExclusiveExceptions: ['und-vharos'],
  },
  {
    id: 'infernal-hunt',
    name: 'Infernal Hunt',
    tagline: 'Burn first.',
    description: 'Demons, hounds and hellfire - fast pressure and direct damage.',
    builds: 'Infernal · aggression · direct damage',
    faction: 'infernal',
    cardIds: [
      'inf-infernal-lord',
      'inf-blood-demon',
      'spl-soul-burn',
      'inf-hellhound',
      'spl-fireball',
      'spl-burning-ground',
      'spl-siege-fire',
      'inf-pit-fiend',
      'inf-flame-imp',
      'inf-cultist',
      'spl-weakness',
    ],
    featured: { main: 'inf-infernal-lord', secondary: ['inf-blood-demon', 'inf-hellhound'] },
  },
];

export function getBanner(id: string): SummonBanner | undefined {
  return SUMMON_BANNERS.find((b) => b.id === id);
}

export function isBannerId(id: unknown): id is string {
  return typeof id === 'string' && SUMMON_BANNERS.some((b) => b.id === id);
}
