import type { MasteryId } from '../mastery/definitions';

export const ACCOUNT_VERSION = 1;

/**
 * Persisted account progression. Only what can't be derived is stored: Level, the XP earned toward the
 * next level, which Masteries are unlocked (and their rank), and which one is equipped. XP-to-next,
 * Mastery Points available and the like are computed from these.
 */
export interface AccountState {
  version: number;
  level: number;
  /** XP toward the next level (0 <= xp < xpToNextLevel(level)); always 0 at MAX_LEVEL. */
  xp: number;
  totalXp: number;
  unlockedMasteries: Partial<Record<MasteryId, number>>;
  equippedMasteryId: MasteryId | null;
}

/** What one XP grant did - what the result sheets show. */
export interface XpGrantResult {
  gained: number;
  levelBefore: number;
  levelAfter: number;
  /** Every level reached by this grant (supports several at once). */
  levelsGained: number[];
  xpAfter: number;
  /** Masteries newly unlocked by the levels gained. */
  masteriesUnlocked: MasteryId[];
  masteryPointsGained: number;
  /** Gems awarded by the levels gained (milestone levels only; 0 otherwise). */
  gemsGained: number;
}
