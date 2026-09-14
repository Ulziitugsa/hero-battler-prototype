import type { RecentMatchEntry } from './localMatchHistory';
import { getCard } from '../cards';

// Aggregates the locally-saved match history into the two tables the Playtest Stats screen shows
// (README "Simple Balance Report"). Deliberately not statistically rigorous - just tooling to eyeball
// trends across whatever local playtesting has been done. See MatchStats.perCard for the per-match
// contribution this rolls up.

export interface DeckRecord {
  label: string;
  wins: number;
  games: number;
}

export interface CardRecord {
  cardId: string;
  name: string;
  drawn: number;
  played: number;
  winsWhenPlayed: number;
}

/** One row per deck label that appeared on EITHER side of a saved match (a deck's performance doesn't depend on which side played it). */
export function summarizeDeckRecords(matches: RecentMatchEntry[]): DeckRecord[] {
  const table = new Map<string, DeckRecord>();
  const bump = (label: string, won: boolean) => {
    if (!label) return;
    const row = table.get(label) ?? { label, wins: 0, games: 0 };
    row.games += 1;
    if (won) row.wins += 1;
    table.set(label, row);
  };
  for (const m of matches) {
    bump(m.playerDeckLabel, m.winner === 'player');
    bump(m.enemyDeckLabel, m.winner === 'enemy');
  }
  return [...table.values()].sort((a, b) => b.games - a.games);
}

/** One row per card that has ever been drawn or played across saved matches. */
export function summarizeCardRecords(matches: RecentMatchEntry[]): CardRecord[] {
  const table = new Map<string, CardRecord>();
  for (const m of matches) {
    for (const [cardId, stat] of Object.entries(m.perCard ?? {})) {
      const row = table.get(cardId) ?? { cardId, name: getCard(cardId).name, drawn: 0, played: 0, winsWhenPlayed: 0 };
      row.drawn += stat.drawn;
      row.played += stat.played;
      row.winsWhenPlayed += stat.winsWhenPlayed;
      table.set(cardId, row);
    }
  }
  return [...table.values()].sort((a, b) => b.played - a.played);
}
