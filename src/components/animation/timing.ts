import { useEffect, useState } from 'react';
import type { AnimationSpeed, TimingCategory } from './types';

// The single place every animation duration in the game comes from. Nothing outside this file
// should hardcode a millisecond value for pacing - a step only ever declares which category it is
// (see types.ts), and this module turns that into an actual delay for the current speed setting and
// motion preference. Rescaling the whole game's pace (or adding a future "Skip" speed) means editing
// exactly this table, not hunting through components.
//
// Combat-feel refinement pass: 1x was originally tuned for "technically readable" and played back too
// fast to comfortably follow on a first watch. These bases are deliberately slower - a first-time
// player should see each meaningful beat land, not scroll past it.

export const BASE_DURATIONS: Record<TimingCategory, number> = {
  micro: 220,
  short: 350,
  combat: 550,
  major: 700,
};

/** Multiplies every base duration for the current playback speed. 'instant' always resolves to 0 regardless of category - see resolveDuration. */
const SPEED_MULTIPLIER: Record<AnimationSpeed, number> = {
  '1x': 1,
  '2x': 0.45,
  instant: 0,
};

/** With reduced motion, every step still plays (order and readability are preserved - see
 * docs/game/CORE-RULES.md's "the engine decides what happened" principle) but nothing lingers longer
 * than a quick highlight - every category collapses to `micro`'s pace before the speed multiplier. */
export function resolveDuration(category: TimingCategory, speed: AnimationSpeed, reducedMotion: boolean): number {
  if (speed === 'instant') return 0;
  const base = reducedMotion ? BASE_DURATIONS.micro : BASE_DURATIONS[category];
  return Math.round(base * SPEED_MULTIPLIER[speed]);
}

/**
 * A small breathing gap inserted after certain "major beat" steps (see buildAnimationSteps's
 * `pauseAfter` flag) so chained events don't visually blur together - e.g. the clash lands, THEN
 * (after this gap) the loser's destruction begins, THEN (after another gap) the overflow number
 * appears. Deliberately NOT applied after every step - only where a beat needs a moment to register
 * before the next one starts. Scales with speed exactly like a duration; reduced motion halves it
 * rather than removing it outright, since the gap itself is part of what keeps chained events legible
 * without needing a large movement to do it.
 */
export const PAUSE_MS = 110;

export function resolvePause(speed: AnimationSpeed, reducedMotion: boolean): number {
  if (speed === 'instant') return 0;
  const base = reducedMotion ? PAUSE_MS * 0.5 : PAUSE_MS;
  return Math.round(base * SPEED_MULTIPLIER[speed]);
}

/** Tracks `prefers-reduced-motion` live (not just at mount) so a mid-match OS setting change takes effect immediately. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
