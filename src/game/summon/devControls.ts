import type { Rarity } from '../types';

// DEV-ONLY summon testing hooks. Guarded by import.meta.env.DEV so a production build can neither set nor
// consume a forced rarity - real pulls there always use the banner's rates.

let forced: Rarity | null = null;

export function forceNextRarity(rarity: Rarity | null): void {
  if (!import.meta.env.DEV) return;
  forced = rarity;
}

/** Returns the pending forced rarity (once) and clears it. Always null outside dev. */
export function takeForcedRarity(): Rarity | null {
  if (!import.meta.env.DEV) return null;
  const r = forced;
  forced = null;
  return r;
}

export function peekForcedRarity(): Rarity | null {
  return import.meta.env.DEV ? forced : null;
}
