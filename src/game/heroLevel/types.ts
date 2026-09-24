export const HERO_LEVEL_VERSION = 1;

/** Persisted per-card Level. A card with no entry is Level 1 (the default - never stored explicitly, same
 * convention as Ascension rank 0 / omitted). */
export interface HeroLevelState {
  version: number;
  levels: Readonly<Record<string, number>>;
}

export interface LevelUpResult {
  ok: boolean;
  cardId: string;
  levelBefore: number;
  levelAfter: number;
  goldSpent: number;
  reason: string | null;
}
