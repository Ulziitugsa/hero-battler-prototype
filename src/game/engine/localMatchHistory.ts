import type { MatchStats } from './stats';
import type { CombatModelId } from '../types';

const STORAGE_KEY = 'skyloom:recentMatches';
const MAX_ENTRIES = 20;

export interface RecentMatchEntry extends MatchStats {
  seed: number;
  playedAt: string;
  /** The resolver that played the match (combat/resolver.ts). Absent on entries saved before card combat: legacy, v1. */
  combatModel?: CombatModelId;
  resolverVersion?: number;
}

export function saveRecentMatch(seed: number, stats: MatchStats, resolver?: { combatModel: CombatModelId; resolverVersion: number }): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing: RecentMatchEntry[] = raw ? JSON.parse(raw) : [];
    const entry: RecentMatchEntry = { ...stats, seed, playedAt: new Date().toISOString(), ...(resolver ?? {}) };
    const next = [entry, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage can throw (private browsing, quota) - losing match history is not worth crashing the app over.
  }
}

export function loadRecentMatches(): RecentMatchEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Dev/playtest only. See game/devReset.ts's resetEverything (Commercial Prototype Phase 11). */
export function resetMatchHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
