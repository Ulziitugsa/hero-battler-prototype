import { grantGems, grantGold, grantTickets } from '../economy/economy';
import { tierFor, type RankedRivalDeck, type RankedTier } from './tiers';

export const RANKED_STORAGE_KEY = 'moonwater:ranked:v1';
export const RANKED_CONFIG = { winPoints: 24, lossPoints: -12, pointsPerDivision: 100 } as const;
export const RANKS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master'] as const;
export type RankedState = { version: 1; rating: number; peakRating: number; wins: number; losses: number; matches: { id: string; result: 'win' | 'loss' | 'draw'; delta: number; opponent: string; at: number }[]; claimed: string[] };
export const RANK_REWARDS = RANKS.slice(1).map((rank, i) => ({ id: `rating-${(i + 1) * 100}`, rank, rating: (i + 1) * 100, gems: 40 + i * 10, gold: 100 + i * 50, tickets: i === 2 ? 1 : 0 }));
const empty = (): RankedState => ({ version: 1, rating: 0, peakRating: 0, wins: 0, losses: 0, matches: [], claimed: [] });
export function readRanked(): RankedState {
  try { const raw = localStorage.getItem(RANKED_STORAGE_KEY); if (raw) { const x = JSON.parse(raw) as Partial<RankedState>; return { ...empty(), ...x, rating: Math.max(0, Math.floor(x.rating ?? 0)), peakRating: Math.max(0, Math.floor(x.peakRating ?? 0)), matches: Array.isArray(x.matches) ? x.matches.slice(0, 10) : [], claimed: Array.isArray(x.claimed) ? x.claimed : [] }; } } catch { /* fresh local season */ }
  return empty();
}
let state: RankedState | null = null;
const listeners = new Set<() => void>();
export const getRanked = (): RankedState => state ??= readRanked();
export const subscribeRanked = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
function save(next: RankedState) { state = next; try { localStorage.setItem(RANKED_STORAGE_KEY, JSON.stringify(next)); } catch { /* best effort */ } listeners.forEach(fn => fn()); }
export function rankAt(rating: number) { const safe = Math.max(0, Math.floor(rating)); const divisionIndex = Math.min(RANKS.length - 1, Math.floor(safe / RANKED_CONFIG.pointsPerDivision)); return { division: RANKS[divisionIndex], tier: divisionIndex === RANKS.length - 1 ? 'I' : (['III', 'II', 'I'] as const)[Math.floor((safe % 100) / 34)] ?? 'I', progress: divisionIndex === RANKS.length - 1 ? 100 : safe % 100, next: divisionIndex === RANKS.length - 1 ? null : (divisionIndex + 1) * 100 }; }
export function recordRankedMatch(result: 'win' | 'loss' | 'draw', opponent: string, at = Date.now()): RankedState {
  const before = getRanked(); const delta = result === 'win' ? RANKED_CONFIG.winPoints : result === 'loss' ? RANKED_CONFIG.lossPoints : 0; const rating = Math.max(0, before.rating + delta);
  const next = { ...before, rating, peakRating: Math.max(before.peakRating, rating), wins: before.wins + (result === 'win' ? 1 : 0), losses: before.losses + (result === 'loss' ? 1 : 0), matches: [{ id: `${at}-${before.matches.length}`, result, delta: rating - before.rating, opponent, at }, ...before.matches].slice(0, 10) };
  save(next); return next;
}
export function readyRankRewards(s = getRanked()) { return RANK_REWARDS.filter(r => s.peakRating >= r.rating && !s.claimed.includes(r.id)); }
export function claimRankReward(id: string): boolean {
  const s = getRanked(); const reward = RANK_REWARDS.find(r => r.id === id);
  if (!reward || s.peakRating < reward.rating || s.claimed.includes(id)) return false;
  grantGems(reward.gems, 'ranked'); grantGold(reward.gold, 'ranked'); if (reward.tickets) grantTickets(reward.tickets, 'ranked');
  save({ ...s, claimed: [...s.claimed, id] }); return true;
}
export interface RankedOpponent {
  tier: RankedTier;
  deck: RankedRivalDeck;
}

/**
 * The next AI rival: a deck from the current division's own pool (ranked/tiers.ts), at printed card values.
 * Deterministic for a given record, and never derived from the player's decks, Levels or progression.
 */
export function chooseRankedOpponent(s: Pick<RankedState, 'rating' | 'wins' | 'losses'> = getRanked()): RankedOpponent {
  const tier = tierFor(rankAt(s.rating).division);
  const deck = tier.decks[(s.wins + s.losses) % tier.decks.length];
  return { tier, deck };
}
export function resetRankedForTests() { state = null; try { localStorage.removeItem(RANKED_STORAGE_KEY); } catch { /* ignore */ } listeners.forEach(fn => fn()); }
