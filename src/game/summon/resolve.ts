import { nextRandom } from '../engine/rng';
import type { Rarity } from '../types';
import { SUMMON_CONFIG, SUMMON_RARITY_ORDER } from './config';
import type { FeaturedKind, SummonPool, SummonPoolEntry } from './pool';

// Pure summon resolution: pool + pity + seed in, results out. No storage, no React, no Math.random -
// identical inputs always give identical pulls, which is what makes it testable. The presentation never
// calls this: results are resolved (and persisted) first, and animation only reads them.

export interface SummonPullResult {
  cardId: string;
  rarity: Rarity;
  /** The banner's rate-up status of the pulled card. */
  featured: FeaturedKind | null;
  /** Pulls-since-Legendary before / after this pull. */
  pityBefore: number;
  pityAfter: number;
  /** True only when the pity guarantee turned a non-Legendary roll into a Legendary. */
  pityTriggered: boolean;
}

export interface SummonStepResult extends SummonPullResult {
  /** RNG state to continue from (pass as the next pull's seed). */
  nextSeed: number;
}

/** Dev/test hook: replace the rolled rarity of one pull. Never set by production code paths. */
export interface ForcedPull {
  rarity: Rarity;
  index: number;
}

const clampPity = (pity: number): number => Math.max(0, Math.min(SUMMON_CONFIG.pityThreshold - 1, Math.floor(Number.isFinite(pity) ? pity : 0)));

function rollRarity(pool: SummonPool, seed: number): { rarity: Rarity; seed: number } {
  const { value, nextState } = nextRandom(seed);
  // Only rarities that actually have cards can be rolled (a validated pool has all of them; this just never crashes).
  const available = SUMMON_RARITY_ORDER.filter((r) => pool.rates[r] > 0 && pool.entries.some((e) => e.rarity === r));
  const total = available.reduce((n, r) => n + pool.rates[r], 0);
  let point = value * total;
  for (const r of available) {
    point -= pool.rates[r];
    if (point < 0) return { rarity: r, seed: nextState };
  }
  return { rarity: available[available.length - 1] ?? 'common', seed: nextState };
}

function pickEntry(entries: readonly SummonPoolEntry[], rarity: Rarity, seed: number): { entry: SummonPoolEntry; seed: number } {
  const candidates = entries.filter((e) => e.rarity === rarity);
  const { value, nextState } = nextRandom(seed);
  let point = value * candidates.reduce((n, e) => n + e.weight, 0);
  for (const e of candidates) {
    point -= e.weight;
    if (point < 0) return { entry: e, seed: nextState };
  }
  return { entry: candidates[candidates.length - 1], seed: nextState };
}

/**
 * One pull. The rarity is rolled from the banner's rates; if this is the pity pull (the pityThreshold-th
 * since the last Legendary on this banner) and the roll wasn't Legendary, it is forced to Legendary. The
 * card is then picked by weight within the rarity (featured cards carry rate-up weight). A Legendary -
 * rolled or forced - resets pity to 0; anything else adds one.
 */
export function resolveSummon(pool: SummonPool, state: { pity: number }, seed: number, forceRarity?: Rarity | null): SummonStepResult {
  const pityBefore = clampPity(state.pity);
  const rolled = rollRarity(pool, seed);
  const canForce = !!forceRarity && pool.entries.some((e) => e.rarity === forceRarity);
  const base: Rarity = canForce ? forceRarity! : rolled.rarity;
  const legendaryAvailable = pool.entries.some((e) => e.rarity === 'legendary');
  const pityPull = pityBefore + 1 >= SUMMON_CONFIG.pityThreshold;
  const pityTriggered = pityPull && legendaryAvailable && base !== 'legendary';
  const rarity: Rarity = pityTriggered ? 'legendary' : base;
  const picked = pickEntry(pool.entries, rarity, rolled.seed);
  return {
    cardId: picked.entry.cardId,
    rarity,
    featured: picked.entry.featured,
    pityBefore,
    pityAfter: rarity === 'legendary' ? 0 : pityBefore + 1,
    pityTriggered,
    nextSeed: picked.seed,
  };
}

/** `count` sequential pulls sharing one pity counter (each pull sees the pity the previous one left). */
export function resolveSummons(pool: SummonPool, state: { pity: number }, count: number, seed: number, forced?: ForcedPull | null): { pulls: SummonPullResult[]; pityAfter: number } {
  const pulls: SummonPullResult[] = [];
  let pity = clampPity(state.pity);
  let rng = seed;
  for (let i = 0; i < count; i++) {
    const { nextSeed, ...pull } = resolveSummon(pool, { pity }, rng, forced && forced.index === i ? forced.rarity : null);
    pulls.push(pull);
    pity = pull.pityAfter;
    rng = nextSeed;
  }
  return { pulls, pityAfter: pity };
}
