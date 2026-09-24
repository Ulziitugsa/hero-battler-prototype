import type { Rarity } from '../types';
import { SUMMON_CONFIG } from './config';
import type { SummonPool } from './pool';
import { SUMMON_COUNTS, summonCost, type SummonCurrency, type SummonKind } from './summon';

// Pure presentation logic for the Summon screen - what each button says and whether it's enabled, and
// how the pity counter reads - kept out of the component so it's unit-tested.

export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

export interface SummonOption {
  kind: SummonKind;
  count: number;
  cost: number;
  affordable: boolean;
  /** Gems still needed (0 when affordable). */
  shortfall: number;
}

/** `unlimited` is the dev-only Unlimited Gems flag (always false in production; also bypasses Ticket cost). */
export function summonOptions(balance: number, pool: SummonPool, unlimited = false, currency: SummonCurrency = 'gems'): SummonOption[] {
  return (['single', 'ten'] as SummonKind[]).map((kind) => {
    const cost = summonCost(pool, kind, currency);
    const affordable = unlimited || balance >= cost;
    return { kind, count: SUMMON_COUNTS[kind], cost, affordable, shortfall: affordable ? 0 : cost - balance };
  });
}

/** The line under the buttons: only shown when even a single summon is out of reach, and says exactly what is missing. */
export function affordabilityNote(balance: number, pool: SummonPool, unlimited = false, currency: SummonCurrency = 'gems'): string | null {
  const single = summonOptions(balance, pool, unlimited, currency)[0];
  if (single.affordable) return null;
  const label = currency === 'gems' ? 'Gems' : 'Tickets';
  return `Need ${single.cost} ${label} · You have ${balance}`;
}

export interface PityDisplay {
  current: number;
  threshold: number;
  /** Pulls until the guaranteed Legendary, counting that pull itself (1 = the next pull is guaranteed). */
  remaining: number;
  label: string;
}

export function pityDisplay(pity: number): PityDisplay {
  const threshold = SUMMON_CONFIG.pityThreshold;
  const current = Math.max(0, Math.min(threshold - 1, Math.floor(pity)));
  const remaining = threshold - current;
  return {
    current,
    threshold,
    remaining,
    label: remaining === 1 ? 'Your next summon is a guaranteed Legendary' : `${remaining} summons until a guaranteed Legendary`,
  };
}

/** "0.6%" / "12%" - small rates keep one decimal so they don't round to zero. */
export function formatPercent(p: number): string {
  if (p >= 10) return `${Math.round(p)}%`;
  return `${Math.round(p * 10) / 10}%`;
}
