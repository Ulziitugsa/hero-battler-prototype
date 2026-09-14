import type { MatchStats } from './stats';

const STORAGE_KEY = 'skyloom:recentMatches';
const MAX_ENTRIES = 20;

export interface RecentMatchEntry extends MatchStats {
  seed: number;
  playedAt: string;
}

export function saveRecentMatch(seed: number, stats: MatchStats): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const existing: RecentMatchEntry[] = raw ? JSON.parse(raw) : [];
    const entry: RecentMatchEntry = { ...stats, seed, playedAt: new Date().toISOString() };
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
