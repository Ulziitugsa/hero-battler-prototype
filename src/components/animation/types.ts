import type { GameEvent, LaneId } from '../../game/types';

// The UI-side presentation layer for a resolved round. The engine only ever produces
// `{ nextState, events }` (see resolveRound.ts) - it knows nothing about timing, motion, or how any
// of this looks. Everything in this module exists to turn that ordered, already-decided event log
// into a sequence of animation beats the board plays back. The engine decides what happened; this
// layer only explains it visually. See docs/game/CORE-RULES.md for the event model itself.

/** Playback speed the player controls (Battle Screen's speed selector). 'instant' skips all timing. */
export type AnimationSpeed = '1x' | '2x' | 'instant';

/** One of a small, fixed set of duration buckets - see `timing.ts`. Every step is tagged with a
 * category rather than a raw millisecond value, so all pacing lives in one place and can be rescaled
 * (speed setting, reduced motion, a future "skip") without touching step-building logic. */
/** 'destroy' is card combat's quick clash-loser exit (see buildAnimationSteps), kept deliberately short so each lane's
 * destruction lands before the next lane without slowing every clash down. */
export type TimingCategory = 'micro' | 'short' | 'combat' | 'major' | 'destroy';

/** What kind of visual beat a step represents - drives which CSS classes/floaters the renderer applies. Never derived from a card id or name; always from the underlying event shape. */
export type VisualType =
  | 'reveal'
  | 'hero-enter'
  | 'continuous-spell-enter'
  | 'trigger-pulse'
  | 'power-change'
  | 'heal'
  | 'combat-clash'
  | 'hero-destroyed'
  | 'shield-save'
  | 'overflow-damage'
  | 'clash-damage'
  | 'direct-damage'
  | 'shield-granted'
  | 'immunity-blocked'
  | 'silenced'
  | 'spell-zone-destroyed'
  | 'spell-expired'
  | 'spell-resolve-fade'
  | 'returned-to-hand'
  | 'returned-to-deck'
  | 'revived'
  | 'exiled'
  | 'round-end'
  | 'match-end'
  | 'generic';

/**
 * One animation beat, built from a deterministic group of the round's own GameEvents. Never carries
 * a raw duration - only a `timingCategory`; the animation controller resolves that to milliseconds at
 * playback time from the current speed/reduced-motion settings, so pacing can change without
 * rebuilding the step list.
 */
export interface AnimationStep {
  id: string;
  visualType: VisualType;
  timingCategory: TimingCategory;
  /** The underlying engine events this step represents, in their original relative order. Never a copy - same object references as the source `events` array, so the controller can locate their original indices. */
  events: GameEvent[];
  /** The highest index this step's events occupy in the original flat event array - see `useAnimationController` for why this (not array position) drives when state is safely committed. */
  maxEventIndex: number;
  /** Convenience only, derived from `events` - the lane this step is primarily about, when it has one. */
  lane?: LaneId;
  /** True for a curated set of "major beat" steps (a clash landing, a destruction, overflow damage, ...)
   * where a brief breathing gap after this step's own duration helps the next beat read as a separate
   * event rather than a blur - see timing.ts's `resolvePause`. Never set on incidental/trivial steps. */
  pauseAfter?: boolean;
  /**
   * Event indices this step commits on top of the `maxEventIndex` prefix. Card combat only: a lane's clash loser is
   * destroyed in the log after all three lanes clash, and this is how its HERO_DESTROYED (or SHIELD_CONSUMED) commits
   * as soon as its own lane has resolved, without committing the later lanes' clash results early. See playback.ts.
   */
  commitIndices?: number[];
}
