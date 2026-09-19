import { getCard } from '../cards';
import { isCampaignExclusive } from '../collection/exclusives';
import type { Rarity } from '../types';
import { SUMMON_BANNERS, type SummonBanner } from './banners';
import { SUMMON_CONFIG, SUMMON_RARITY_ORDER, type Rates } from './config';

// A banner's rollable pool: real card ids, rarity read from the card, weights that already include the
// banner's rate-up. Everything the resolver and the pool sheet need comes from here.

export type FeaturedKind = 'main' | 'secondary';

export interface SummonPoolEntry {
  cardId: string;
  rarity: Rarity;
  weight: number;
  featured: FeaturedKind | null;
}

export interface SummonPool {
  id: string;
  name: string;
  rates: Rates;
  cost: { single: number; ten: number };
  entries: readonly SummonPoolEntry[];
  banner: SummonBanner;
}

export function buildPool(banner: SummonBanner): SummonPool {
  const entries = banner.cardIds.map((cardId): SummonPoolEntry => {
    const card = getCard(cardId);
    const featured: FeaturedKind | null = cardId === banner.featured.main ? 'main' : banner.featured.secondary.includes(cardId) ? 'secondary' : null;
    const base = card.type === 'hero' ? SUMMON_CONFIG.heroWeight : SUMMON_CONFIG.spellWeight;
    const mult = featured === 'main' ? SUMMON_CONFIG.featuredMainMultiplier : featured === 'secondary' ? SUMMON_CONFIG.featuredSecondaryMultiplier : 1;
    return { cardId, rarity: card.rarity, weight: base * mult, featured };
  });
  return {
    id: banner.id,
    name: banner.name,
    rates: banner.rarityRates ?? SUMMON_CONFIG.rarityRates,
    cost: banner.cost ?? { single: SUMMON_CONFIG.singleCost, ten: SUMMON_CONFIG.tenCost },
    entries,
    banner,
  };
}

export const SUMMON_POOLS: readonly SummonPool[] = SUMMON_BANNERS.map(buildPool);

export function getPool(bannerId: string): SummonPool {
  return SUMMON_POOLS.find((p) => p.id === bannerId) ?? SUMMON_POOLS[0];
}

/** Banners that can pull this card. */
export function bannersFor(cardId: string): SummonBanner[] {
  return SUMMON_POOLS.filter((p) => p.entries.some((e) => e.cardId === cardId)).map((p) => p.banner);
}

export function isSummonable(cardId: string): boolean {
  return bannersFor(cardId).length > 0;
}

/** Chance (in percent of a single pull, before pity) of each card: the rarity rate split by weight within the rarity. */
export function cardRates(pool: SummonPool): { entry: SummonPoolEntry; percent: number }[] {
  const present = SUMMON_RARITY_ORDER.filter((r) => pool.rates[r] > 0 && pool.entries.some((e) => e.rarity === r));
  const total = present.reduce((n, r) => n + pool.rates[r], 0);
  return pool.entries.map((entry) => {
    const tier = pool.entries.filter((e) => e.rarity === entry.rarity).reduce((n, e) => n + e.weight, 0);
    return { entry, percent: present.includes(entry.rarity) ? ((pool.rates[entry.rarity] / total) * 100 * entry.weight) / tier : 0 };
  });
}

/** Problems that would make a pool unsafe to roll from or off-brand. Empty means valid - the tests assert this for every real banner. */
export function validateSummonPool(pool: SummonPool): string[] {
  const errors: string[] = [];
  const b = pool.banner;
  const rateTotal = SUMMON_RARITY_ORDER.reduce((n, r) => n + pool.rates[r], 0);
  if (Math.abs(rateTotal - 100) > 1e-9) errors.push(`rarity rates sum to ${rateTotal}, expected 100`);
  const seen = new Set<string>();
  for (const e of pool.entries) {
    try {
      const card = getCard(e.cardId);
      if (card.rarity !== e.rarity) errors.push(`${e.cardId}: pool rarity ${e.rarity} != card rarity ${card.rarity}`);
    } catch {
      errors.push(`${e.cardId}: unknown card id`);
    }
    if (seen.has(e.cardId)) errors.push(`${e.cardId}: listed twice`);
    seen.add(e.cardId);
    if (!(e.weight > 0) || !Number.isFinite(e.weight)) errors.push(`${e.cardId}: weight must be positive`);
    if (isCampaignExclusive(e.cardId) && !(b.campaignExclusiveExceptions ?? []).includes(e.cardId)) errors.push(`${e.cardId}: Campaign-exclusive cards cannot be summoned`);
  }
  for (const id of b.campaignExclusiveExceptions ?? []) {
    if (!isCampaignExclusive(id)) errors.push(`${id}: listed as an exception but is not Campaign-exclusive`);
    if (!seen.has(id)) errors.push(`${id}: exception is not in the pool`);
  }
  for (const id of [b.featured.main, ...b.featured.secondary]) if (!seen.has(id)) errors.push(`${id}: featured card is not in the pool`);
  for (const r of SUMMON_RARITY_ORDER) {
    if (pool.rates[r] > 0 && !pool.entries.some((e) => e.rarity === r)) errors.push(`no cards for rarity ${r}`);
  }
  // A banner must actually be about its archetype: most of the pool is its own faction.
  const own = pool.entries.filter((e) => {
    try {
      return getCard(e.cardId).faction === b.faction;
    } catch {
      return false;
    }
  }).length;
  if (own / Math.max(1, pool.entries.length) < 0.75) errors.push(`only ${own}/${pool.entries.length} cards are ${b.faction}`);
  return errors;
}
