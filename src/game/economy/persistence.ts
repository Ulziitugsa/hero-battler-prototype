import { ALL_CARDS } from '../cards';
import { isBannerId } from '../summon/banners';
import { SUMMON_CONFIG } from '../summon/config';
import { MAX_GEMS, MAX_GOLD, STARTING_GEMS, STARTING_GOLD } from './config';
import { ECONOMY_VERSION, RARITIES, type PlayerEconomy, type SummonHistoryEntry } from './types';

// Centralised localStorage access for the economy - UI never touches storage directly. Same convention
// as the collection/account stores: try/catch-wrapped, never throws, malformed data is sanitised.

export const ECONOMY_STORAGE_KEY = 'skyloom:economy';
const KNOWN_IDS = new Set(ALL_CARDS.map((c) => c.id));

export function defaultEconomy(): PlayerEconomy {
  return { version: ECONOMY_VERSION, gems: STARTING_GEMS, gold: STARTING_GOLD, summon: { pity: {}, history: [] } };
}

const whole = (n: unknown, fallback: number): number => (typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : fallback);

function sanitizeHistory(raw: unknown): SummonHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SummonHistoryEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    if (typeof r.cardId !== 'string' || !KNOWN_IDS.has(r.cardId)) continue;
    if (!RARITIES.includes(r.rarity as never)) continue;
    out.push({ cardId: r.cardId, rarity: r.rarity as SummonHistoryEntry['rarity'], at: Math.max(0, whole(r.at, 0)), wasNew: r.wasNew === true, bannerId: isBannerId(r.bannerId) ? r.bannerId : '' });
    if (out.length >= SUMMON_CONFIG.historyLimit) break;
  }
  return out;
}

function sanitizePity(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  // v1 stored one number for the old single pool; it has no banner to belong to, so it is dropped.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    if (!isBannerId(id)) continue;
    const pity = Math.max(0, Math.min(SUMMON_CONFIG.pityThreshold - 1, whole(n, 0)));
    if (pity > 0) out[id] = pity;
  }
  return out;
}

/** Coerces anything into a valid economy: gems clamped to [0, MAX_GEMS], pity per known banner clamped to [0, threshold - 1], unknown history entries dropped. */
export function sanitizeEconomy(raw: unknown): PlayerEconomy {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultEconomy();
  const r = raw as Record<string, unknown>;
  const summon = r.summon && typeof r.summon === 'object' ? (r.summon as Record<string, unknown>) : {};
  return {
    version: ECONOMY_VERSION,
    gems: Math.max(0, Math.min(MAX_GEMS, whole(r.gems, 0))),
    // A pre-v3 save has no `gold` field at all - that is 0, not an error, and is never backfilled.
    gold: Math.max(0, Math.min(MAX_GOLD, whole(r.gold, 0))),
    summon: { pity: sanitizePity(summon.pity), history: sanitizeHistory(summon.history) },
  };
}

export type StoredEconomy = { status: 'missing' } | { status: 'malformed' } | { status: 'ok'; economy: PlayerEconomy };

export function readStoredEconomy(): StoredEconomy {
  let raw: string | null;
  try {
    raw = localStorage.getItem(ECONOMY_STORAGE_KEY);
  } catch {
    return { status: 'missing' };
  }
  if (raw === null) return { status: 'missing' };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { status: 'malformed' };
    return { status: 'ok', economy: sanitizeEconomy(parsed) };
  } catch {
    return { status: 'malformed' };
  }
}

export function writeStoredEconomy(economy: PlayerEconomy): void {
  try {
    localStorage.setItem(ECONOMY_STORAGE_KEY, JSON.stringify(economy));
  } catch {
    // best-effort only - the in-memory copy still serves this session
  }
}

export function clearStoredEconomy(): void {
  try {
    localStorage.removeItem(ECONOMY_STORAGE_KEY);
  } catch {
    // ignore
  }
}
