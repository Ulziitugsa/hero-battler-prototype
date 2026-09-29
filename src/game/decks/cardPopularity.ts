// "Popular in Ranked" - architecture only. Moonwater has no real aggregate Ranked data yet (Ranked is
// an on-device AI mode and analytics never leave the device), so there is nothing honest to show.
// The Deck Builder asks this module for a snapshot and hides every popularity affordance while the
// answer is 'unavailable'. Never fill this with invented numbers: a future server endpoint that
// aggregates real Ranked deck lists should be the only thing that returns 'available'.

export interface CardPopularitySnapshot {
  status: 'available';
  /** Where the numbers came from, e.g. "Ranked, Season 1, last 7 days". Shown to the player. */
  sourceLabel: string;
  /** When the aggregate was computed (epoch ms). */
  computedAt: number;
  /** card id -> share of sampled Ranked decks that include it, 0..1. */
  deckShare: Readonly<Record<string, number>>;
}

export type CardPopularity = CardPopularitySnapshot | { status: 'unavailable' };

export type CardPopularitySource = () => CardPopularity;

const UNAVAILABLE: CardPopularity = { status: 'unavailable' };

let source: CardPopularitySource = () => UNAVAILABLE;

export function getCardPopularity(): CardPopularity {
  return source();
}

/** Plug in a real aggregate source later (or a clearly labelled fixture in tests). Returns a restore function. */
export function setCardPopularitySource(next: CardPopularitySource): () => void {
  const prev = source;
  source = next;
  return () => {
    source = prev;
  };
}

/** Top `limit` card ids by deck share, only among `candidates`. Empty when data is unavailable. */
export function popularCardIds(popularity: CardPopularity, candidates: readonly string[], limit = 8): string[] {
  if (popularity.status !== 'available') return [];
  return candidates
    .filter((id) => (popularity.deckShare[id] ?? 0) > 0)
    .sort((a, b) => (popularity.deckShare[b] ?? 0) - (popularity.deckShare[a] ?? 0) || a.localeCompare(b))
    .slice(0, limit);
}
