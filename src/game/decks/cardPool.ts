import type { CardDefinition, Faction, Rarity } from '../types/index.js';
import { baseAtk, hpContribution } from './deckSummary.js';
import type { CardPopularity } from './cardPopularity.js';

// Deck Builder card-pool query: text search, filters and sorting as one pure function, so the page
// only holds the chosen options and every combination is unit-testable. Filters combine with AND.

export type CardTypeFilter = 'all' | 'hero' | 'spell';
/** owned: cards you can add (the default). all: every card in the set, unowned ones shown locked. missing: only cards you don't own yet. */
export type OwnershipFilter = 'owned' | 'all' | 'missing';
export type CardSort = 'default' | 'atk' | 'hp' | 'rarity' | 'recent' | 'name' | 'mastery' | 'popular';

export interface CardPoolOptions {
  search: string;
  type: CardTypeFilter;
  faction: Faction | 'all';
  rarity: Rarity | 'all';
  ownership: OwnershipFilter;
  favoritesOnly: boolean;
  sort: CardSort;
}

export const DEFAULT_POOL_OPTIONS: CardPoolOptions = { search: '', type: 'all', faction: 'all', rarity: 'all', ownership: 'owned', favoritesOnly: false, sort: 'default' };

export interface CardPoolContext {
  ownedCount: (cardId: string) => number;
  favorites: readonly string[];
  obtainedAt: Readonly<Record<string, number>>;
  masteryRank: (cardId: string) => number;
  popularity: CardPopularity;
}

const RARITY_RANK: Record<Rarity, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };

export const SORT_LABEL: Record<CardSort, string> = {
  default: 'Default',
  atk: 'ATK',
  hp: 'HP Contribution',
  rarity: 'Rarity',
  recent: 'Recently obtained',
  name: 'Name',
  mastery: 'Mastery',
  popular: 'Popular in Ranked',
};

/** Sorts offered in the UI. 'popular' only appears when real aggregate data exists. */
export function availableSorts(popularity: CardPopularity): CardSort[] {
  const base: CardSort[] = ['default', 'atk', 'hp', 'rarity', 'recent', 'name', 'mastery'];
  return popularity.status === 'available' ? [...base, 'popular'] : base;
}

/** The existing Deck Builder order: Units before Spells, rarest first, then name. */
export function defaultCardOrder(a: CardDefinition, b: CardDefinition): number {
  if ((a.type === 'hero') !== (b.type === 'hero')) return a.type === 'hero' ? -1 : 1;
  return RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.name.localeCompare(b.name);
}

/** Everything a player might type to find a card: names, role, rules text, tags, faction and rarity. */
export function cardSearchText(card: CardDefinition): string {
  return [card.name, card.shortName, card.role, card.type === 'hero' ? 'unit' : 'spell', card.faction, card.rarity, card.boardText ?? '', ...card.tags, ...card.abilities.map((a) => a.text)].join(' ').toLowerCase();
}

/** Every whitespace-separated term must appear somewhere in the card's search text. */
export function matchesSearch(card: CardDefinition, search: string): boolean {
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = cardSearchText(card);
  return terms.every((t) => text.includes(t));
}

/** Descending numeric key with Spells (null) after Units; ties fall back to the default order. */
function byNumber(key: (c: CardDefinition) => number | null) {
  return (a: CardDefinition, b: CardDefinition) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb === null) return defaultCardOrder(a, b);
    if (ka === null) return 1;
    if (kb === null) return -1;
    return kb - ka || defaultCardOrder(a, b);
  };
}

function comparator(sort: CardSort, ctx: CardPoolContext): (a: CardDefinition, b: CardDefinition) => number {
  switch (sort) {
    case 'atk':
      return byNumber(baseAtk);
    case 'hp':
      return byNumber((c) => (c.type === 'hero' ? hpContribution(c) : null));
    case 'rarity':
      return (a, b) => RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.name.localeCompare(b.name);
    case 'name':
      return (a, b) => a.name.localeCompare(b.name);
    case 'recent':
      // Cards with no record (owned before tracking began, or never obtained) keep the default order after dated ones.
      return byNumber((c) => ctx.obtainedAt[c.id] ?? null);
    case 'mastery':
      return (a, b) => ctx.masteryRank(b.id) - ctx.masteryRank(a.id) || defaultCardOrder(a, b);
    case 'popular':
      return ctx.popularity.status === 'available' ? byNumber((c) => (ctx.popularity as { deckShare: Record<string, number> }).deckShare[c.id] ?? null) : defaultCardOrder;
    default:
      return defaultCardOrder;
  }
}

export function queryCardPool(cards: readonly CardDefinition[], opts: CardPoolOptions, ctx: CardPoolContext): CardDefinition[] {
  const favorites = new Set(ctx.favorites);
  return cards
    .filter((c) => {
      const owned = ctx.ownedCount(c.id) > 0;
      if (opts.ownership === 'owned' && !owned) return false;
      if (opts.ownership === 'missing' && owned) return false;
      if (opts.type !== 'all' && c.type !== opts.type) return false;
      // Spells are faction-neutral for deck legality, but each still belongs to a faction set, so the faction filter applies to both.
      if (opts.faction !== 'all' && c.faction !== opts.faction) return false;
      if (opts.rarity !== 'all' && c.rarity !== opts.rarity) return false;
      if (opts.favoritesOnly && !favorites.has(c.id)) return false;
      return matchesSearch(c, opts.search);
    })
    .sort(comparator(opts.sort, ctx));
}

/** How many filters (beyond search and sort) differ from the defaults - for the "Filters (2)" badge. */
export function activeFilterCount(opts: CardPoolOptions): number {
  return [opts.type !== 'all', opts.faction !== 'all', opts.rarity !== 'all', opts.ownership !== 'owned', opts.favoritesOnly].filter(Boolean).length;
}
